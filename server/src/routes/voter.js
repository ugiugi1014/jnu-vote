import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /api/voters/register-wallet
 * body: {
 *   electionId: number,
 *   email: string,
 *   walletAddress: string
 * }
 */
router.post("/register-wallet", async (req, res) => {
  const { electionId, email, walletAddress } = req.body;

  if (!electionId || !email || !walletAddress) {
    return res.status(400).json({ message: "필수 값 누락" });
  }

  // wallet 주소 형식 간단 검증 (0x + 40 hex)
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return res.status(400).json({ message: "walletAddress 형식 오류" });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) election 존재 확인
    const [electionRows] = await conn.query(
      `SELECT * FROM elections WHERE id = ?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    const election = electionRows[0];

    // pending/active일때만 등록 가능하도록 제한 (원하면 closed도 가능)
    if (election.status !== "pending" && election.status !== "active") {
      await conn.rollback();
      return res.status(400).json({ message: "지갑 등록 불가능한 선거 상태" });
    }

    // 2) voter 존재 확인
    const [voterRows] = await conn.query(
      `SELECT * FROM voters WHERE election_id = ? AND email = ?`,
      [electionId, email]
    );

    if (voterRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "유권자 등록이 안됨 (인증 필요)" });
    }

    const voter = voterRows[0];

    // 3) 이미 wallet 등록돼있으면 막기 (원하면 overwrite 허용 가능)
    if (voter.wallet_address) {
      await conn.rollback();
      return res.status(400).json({ message: "이미 지갑이 등록되어 있음" });
    }

    // 4) wallet 중복 방지 (같은 election에서 같은 wallet 사용 불가)
    const [dupRows] = await conn.query(
      `SELECT id FROM voters WHERE election_id = ? AND wallet_address = ?`,
      [electionId, walletAddress]
    );

    if (dupRows.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: "이미 등록된 지갑 주소" });
    }

    // 5) wallet_address 업데이트
    await conn.query(
      `UPDATE voters SET wallet_address = ? WHERE id = ?`,
      [walletAddress, voter.id]
    );

    await conn.commit();

    return res.json({
      message: "지갑 등록 완료",
      electionId,
      email,
      walletAddress,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);

    return res.status(500).json({
      message: "서버 오류",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

export default router;
