const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");
const { getVotingContract } = require("../blockchain/votingContract");
const {
  decryptVote,
  parseEncryptedData,
  parseVoterPublicKey,
} = require("../services/ecdhDecrypt");
const { generateTallyZkpInput, runCircomProof } = require("../services/zkpServices");

const router = express.Router();

// 관리자만 개표 가능
function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "로그인 필요" });
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "관리자 권한 필요" });
  }
  next();
}

/**
 * POST /api/elections/:id/tally  (관리자 전용)
 * 흐름:
 *   1) closed 상태 확인 + 코디네이터 키 확인
 *   2) 후보/유권자/체인 vote 데이터 조회
 *   3) ECDH 복호화 → candidateID 복원 → 집계
 *   4) ZKP② proof 생성 (tally.circom)
 *   5) DB tally_results 저장 + elections.status = tallied
 *   6) 체인 recordTally(candidateIds, voteCounts) 호출
 */
router.post("/:id/tally", auth, adminOnly, async (req, res) => {
  const electionId = req.params.id;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) 선거 상태 확인
    const [electionRows] = await conn.query(
      `SELECT * FROM elections WHERE id = ?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    const election = electionRows[0];

    if (election.status !== "closed") {
      await conn.rollback();
      return res.status(400).json({ message: "개표 가능한 상태가 아님 (closed만 가능)" });
    }

    if (!election.coord_private_key) {
      await conn.rollback();
      return res.status(400).json({ message: "coord_private_key 없음 — 선거 생성 시 자동 생성됐어야 함" });
    }

    if (!election.contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "contract_address 없음" });
    }

    // 2) 후보 목록
    const [candidateRows] = await conn.query(
      `SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index ASC`,
      [electionId]
    );

    if (candidateRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "후보 없음" });
    }

    const candidatesCount = candidateRows.length;
    const candidateMap = {};
    for (const c of candidateRows) {
      candidateMap[c.candidate_index] = c.id;
    }

    // 3) 유권자 (fallback 용, voter_public_key 가 체인에 있으면 그쪽 우선)
    const [voterRows] = await conn.query(
      `SELECT * FROM voters WHERE election_id = ? ORDER BY id ASC`,
      [electionId]
    );

    // 4) 체인에서 encryptedVotes 조회
    const contract = getVotingContract(election.contract_address);
    const encryptedVotes = await contract.getAllVotes();

    if (!encryptedVotes || encryptedVotes.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "투표 데이터 없음" });
    }

    // 5) 집계 초기화
    const tally = {};
    for (const c of candidateRows) {
      tally[c.candidate_index] = 0;
    }

    // 6) 복호화 + 집계
    const zkpVotes = [];
    for (let i = 0; i < encryptedVotes.length; i++) {
      const vote = encryptedVotes[i];
      const encryptedDataBytes = vote.encryptedData ?? vote[0];
      const voterPubKeyBytes =
        vote.voterPublicKey ?? vote[1] ?? voterRows[i]?.voter_public_key;

      if (!encryptedDataBytes || !voterPubKeyBytes) {
        console.warn(`[tally] vote ${i} skipped — 데이터 누락`);
        continue;
      }

      const { ciphertext, nonce } = parseEncryptedData(encryptedDataBytes);
      const voterPubJWK = parseVoterPublicKey(voterPubKeyBytes);

      const decrypted = await decryptVote(
        { ciphertext, nonce },
        election.coord_private_key,
        voterPubJWK
      );

      if (tally[decrypted.candidateId] === undefined) {
        console.warn(`[tally] vote ${i} candidateId=${decrypted.candidateId} 후보 매핑 없음`);
        continue;
      }

      tally[decrypted.candidateId] += 1;
      zkpVotes.push({
        sharedKey: decrypted.sharedKey,
        nonce: decrypted.nonce,
        ciphertext: decrypted.ciphertext,
      });
    }

    // 7) ZKP② proof 생성
    const zkpInput = generateTallyZkpInput({
      zkpVotes,
      tally,
      candidatesCount,
    });

    let proofResult;
    try {
      proofResult = await runCircomProof(zkpInput);
    } catch (err) {
      console.error("[tally] ZKP proof 생성 실패:", err.message);
      throw new Error(`ZKP proof 생성 실패: ${err.message}`);
    }

    // 8) DB tally_results 저장
    await conn.query(`DELETE FROM tally_results WHERE election_id = ?`, [electionId]);

    for (const candidateIndex in tally) {
      const candidateId = candidateMap[candidateIndex];
      await conn.query(
        `INSERT INTO tally_results (election_id, candidate_id, vote_count)
         VALUES (?, ?, ?)`,
        [electionId, candidateId, tally[candidateIndex]]
      );
    }

    // 9) elections.status = tallied
    await conn.query(`UPDATE elections SET status = 'tallied' WHERE id = ?`, [electionId]);

    await conn.commit();

    // 10) 체인에 recordTally 호출 (트랜잭션 분리 — DB 커밋 후)
    let tallyTxHash = null;
    try {
      const candidateIds = candidateRows.map((c) => c.id);
      const voteCounts = candidateRows.map((c) => tally[c.candidate_index] || 0);

      const tx = await contract.recordTally(candidateIds, voteCounts);
      const receipt = await tx.wait();
      tallyTxHash = receipt?.hash || tx.hash;
    } catch (err) {
      console.error("[tally] recordTally 체인 호출 실패:", err.message);
      // DB 는 이미 tallied 상태 — 체인 기록만 실패. 재시도 가능하게 응답.
      return res.status(200).json({
        message: "개표 완료 (DB) — 체인 기록 실패. recordTally 재시도 필요.",
        electionId,
        tally,
        proof: proofResult.proof,
        publicSignals: proofResult.publicSignals,
        recordTallyError: err.message,
      });
    }

    return res.json({
      message: "개표 완료 + ZKP proof 생성 + 체인 기록 완료",
      electionId,
      tally,
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      tallyTxHash,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({
      message: "개표 실패",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
