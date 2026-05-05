import express from "express";
import db from "../db/index.js";
import { getVotingContract } from "../blockchain/votingContract.js";
import { decryptVote } from "../services/ecdhDecrypt.js";

const router = express.Router();

/**
 * POST /api/elections/:id/tally
 */
router.post("/:id/tally", async (req, res) => {
  const electionId = req.params.id;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) election 조회
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
      return res.status(400).json({ message: "개표 가능한 상태가 아님" });
    }

    if (!election.coord_private_key) {
      await conn.rollback();
      return res.status(400).json({ message: "coord_private_key 없음" });
    }

    if (!election.contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "contract_address 없음" });
    }

    // 2) 후보 목록 가져오기
    const [candidateRows] = await conn.query(
      `SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index ASC`,
      [electionId]
    );

    if (candidateRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "후보 없음" });
    }

    // candidate_index -> candidate_id 매핑
    const candidateMap = {};
    for (const c of candidateRows) {
      candidateMap[c.candidate_index] = c.id;
    }

    // 3) voter public keys 가져오기
    const [voterRows] = await conn.query(
      `SELECT * FROM voters WHERE election_id = ? ORDER BY id ASC`,
      [electionId]
    );

    if (voterRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "유권자 없음" });
    }

    // voterPublicKey 배열 만들기
    const voterPublicKeys = voterRows.map(v => v.voter_public_key);

    // 4) 블록체인에서 encryptedVotes 가져오기
    const contract = getVotingContract(election.contract_address);
    const encryptedVotes = await contract.getAllVotes();

    if (encryptedVotes.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "투표 데이터 없음" });
    }

    // 5) 집계 배열 초기화
    const tally = {};
    for (const c of candidateRows) {
      tally[c.candidate_index] = 0;
    }

    // 6) 복호화 및 집계
    for (let i = 0; i < encryptedVotes.length; i++) {
      const encryptedHex = encryptedVotes[i];
      const voterPubKey = voterPublicKeys[i];

      if (!voterPubKey) continue;

      const decryptedText = decryptVote(
        encryptedHex,
        election.coord_private_key,
        voterPubKey
      );

      // decryptedText 예시: {"candidateIndex":2}
      const voteObj = JSON.parse(decryptedText);
      const idx = voteObj.candidateIndex;

      if (tally[idx] === undefined) {
        console.warn("Invalid candidateIndex:", idx);
        continue;
      }

      tally[idx] += 1;
    }

    // 7) tally_results 저장 (기존 삭제 후 재삽입)
    await conn.query(`DELETE FROM tally_results WHERE election_id = ?`, [
      electionId,
    ]);

    for (const candidateIndex in tally) {
      const candidateId = candidateMap[candidateIndex];

      await conn.query(
        `INSERT INTO tally_results (election_id, candidate_id, vote_count)
         VALUES (?, ?, ?)`,
        [electionId, candidateId, tally[candidateIndex]]
      );
    }

    // 8) elections 상태 업데이트
    await conn.query(
      `UPDATE elections SET status = 'tallied' WHERE id = ?`,
      [electionId]
    );

    await conn.commit();

    return res.json({
      message: "개표 완료",
      electionId,
      tally,
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

export default router;
