// 개표 비즈니스 로직 (라우터 ↔ 스케줄러 공유)
//
// performTally(electionId) :
//   1) closed 상태 확인 + 코디네이터 키/컨트랙트 주소 확인
//   2) 후보/유권자/체인 vote 데이터 조회
//   3) ECDH 복호화 → candidateID 복원 → 집계
//   4) ZKP② proof 생성 (tally.circom)
//   5) DB tally_results 저장 + elections.status = tallied + coord_private_key 폐기
//   6) 체인 recordTally(candidateIds, voteCounts) 호출
//
// 정상 케이스 → { tally, proof, publicSignals, tallyTxHash }
// 체인 기록 실패 → { tally, proof, publicSignals, tallyTxHash: null, recordTallyError }
// 그 외 검증 실패 → throw Error (HTTP 400 매핑용 statusCode 첨부)

const db = require("../db");
const { getVotingContract } = require("../blockchain/votingContract");
const {
  decryptVote,
  parseEncryptedData,
  parseVoterPublicKey,
} = require("./ecdhDecrypt");
const { generateTallyZkpInput, runCircomProof } = require("./zkpServices");

function tallyError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toSolidityProof(proof, publicSignals) {
  if (!proof?.pi_a || !proof?.pi_b || !proof?.pi_c) {
    throw new Error("tally proof 형식 오류");
  }
  if (!Array.isArray(publicSignals) || publicSignals.length !== 105) {
    throw new Error("tally publicSignals는 105개여야 합니다.");
  }

  return {
    pA: proof.pi_a.slice(0, 2).map(BigInt),
    // pi_b inner pair swap (snarkjs exportSolidityCallData 규약과 동일)
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: proof.pi_c.slice(0, 2).map(BigInt),
    pubSignals: publicSignals.map(BigInt),
  };
}

async function performTally(electionId) {
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
      throw tallyError("선거 없음", 404);
    }

    const election = electionRows[0];

    if (election.status !== "closed") {
      await conn.rollback();
      throw tallyError("개표 가능한 상태가 아님 (closed만 가능)");
    }

    if (!election.coord_private_key) {
      await conn.rollback();
      throw tallyError("coord_private_key 없음 — 선거 생성 시 자동 생성됐어야 함");
    }

    if (!election.contract_address) {
      await conn.rollback();
      throw tallyError("contract_address 없음");
    }

    // 2) 후보 목록
    const [candidateRows] = await conn.query(
      `SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index ASC`,
      [electionId]
    );

    if (candidateRows.length === 0) {
      await conn.rollback();
      throw tallyError("후보 없음");
    }

    const candidatesCount = candidateRows.length;
    const candidateMap = {};
    for (const c of candidateRows) {
      candidateMap[c.candidate_index] = c.id;
    }

    // 3) 유권자 (fallback 용)
    const [voterRows] = await conn.query(
      `SELECT * FROM voters WHERE election_id = ? ORDER BY id ASC`,
      [electionId]
    );

    // 4) 체인에서 encryptedVotes 조회
    const contract = getVotingContract(election.contract_address);
    const encryptedVotes = await contract.getAllVotes();

    if (!encryptedVotes || encryptedVotes.length === 0) {
      await conn.rollback();
      throw tallyError("투표 데이터 없음");
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

    // 9) elections.status = tallied + 코디네이터 개인키 폐기
    await conn.query(
      `UPDATE elections
       SET status = 'tallied', coord_private_key = NULL
       WHERE id = ?`,
      [electionId]
    );

    await conn.commit();

    // 10) 체인에 recordTally 호출 (트랜잭션 분리 — DB 커밋 후)
    let tallyTxHash = null;
    let recordTallyError = null;
    try {
      const TALLY_CANDIDATES = 5;
      const candidateIds = [];
      const voteCounts = [];
      for (let c = 0; c < TALLY_CANDIDATES; c++) {
        const id = candidateMap[c];          // 해당 index의 후보 id, 없으면 undefined
        candidateIds.push(id != null ? id : 0);
        voteCounts.push(tally[c] || 0);
      }
      const solidityProof = toSolidityProof(proofResult.proof, proofResult.publicSignals);

      const tx = await contract.recordTally(
        candidateIds,
        voteCounts,
        solidityProof.pA,
        solidityProof.pB,
        solidityProof.pC,
        solidityProof.pubSignals
      );
      const receipt = await tx.wait();
      tallyTxHash = receipt?.hash || tx.hash;
    } catch (err) {
      console.error("[tally] recordTally 체인 호출 실패:", err.message);
      recordTallyError = err.message;
    }

    return {
      electionId,
      tally,
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      tallyTxHash,
      recordTallyError,
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { performTally };
