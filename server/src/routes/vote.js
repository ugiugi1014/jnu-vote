import express from "express";
import db from "../db/index.js";
import { getVotingContract } from "../blockchain/votingContract.js";

const router = express.Router();

/**
 * POST /api/vote
 * body: {
 *   electionId: number,
 *   email: string,
 *   candidateIndex: number,
 *   voterPublicKey: string,
 *   encryptedVote: string
 * }
 */
router.post("/", async (req, res) => {
  const { electionId, email, candidateIndex, voterPublicKey, encryptedVote } =
    req.body;

  if (!electionId || !email || !candidateIndex || !voterPublicKey || !encryptedVote) {
    return res.status(400).json({ message: "필수 값 누락" });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) election 확인
    const [electionRows] = await conn.query(
      `SELECT * FROM elections WHERE id = ?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    const election = electionRows[0];

    if (election.status !== "active") {
      await conn.rollback();
      return res.status(400).json({ message: "투표 가능 상태가 아님" });
    }

    if (!election.contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "컨트랙트 주소 없음" });
    }

    // 2) 후보 확인
    const [candidateRows] = await conn.query(
      `SELECT * FROM candidates WHERE election_id = ? AND candidate_index = ?`,
      [electionId, candidateIndex]
    );

    if (candidateRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "후보 없음" });
    }

    // 3) voter 확인
    const [voterRows] = await conn.query(
      `SELECT * FROM voters WHERE election_id = ? AND email = ?`,
      [electionId, email]
    );

    if (voterRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "유권자 없음" });
    }

    const voter = voterRows[0];

    if (voter.has_voted) {
      await conn.rollback();
      return res.status(400).json({ message: "이미 투표함" });
    }

    // 4) voter_public_key 저장
    await conn.query(
      `UPDATE voters SET voter_public_key = ? WHERE id = ?`,
      [voterPublicKey, voter.id]
    );

    // ===============================
    // 5) 블록체인 castVote 실행
    // ===============================
    const contract = getVotingContract(election.contract_address);

    // encryptedVote는 "0x..." bytes 형식이어야 함
    const tx = await contract.castVote(encryptedVote);

    // tx가 블록에 포함될 때까지 기다림
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error("블록체인 투표 트랜잭션 실패");
    }

    // 6) DB 반영
    await conn.query(
      `UPDATE voters SET has_voted = TRUE WHERE id = ?`,
      [voter.id]
    );

    await conn.query(
      `UPDATE elections SET voted_count = voted_count + 1 WHERE id = ?`,
      [electionId]
    );

    await conn.commit();

    return res.json({
      message: "투표 성공",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    await conn.rollback();
    console.error("vote error:", err);

    return res.status(500).json({
      message: "투표 실패",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

export default router;
