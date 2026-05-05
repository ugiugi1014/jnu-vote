import express from "express";
import db from "../db/index.js";
import { getVotingContract } from "../blockchain/votingContract.js";

const router = express.Router();

/**
 * POST /api/elections/:id/voters
 * body: { emails: [], walletAddresses: [] }
 */
router.post("/:id/voters", async (req, res) => {
  const electionId = req.params.id;
  const { emails, walletAddresses } = req.body;

  if (!Array.isArray(emails) || !Array.isArray(walletAddresses)) {
    return res.status(400).json({ message: "emails, walletAddresses 배열 필요" });
  }

  if (emails.length === 0 || walletAddresses.length === 0) {
    return res.status(400).json({ message: "빈 배열은 불가" });
  }

  if (emails.length !== walletAddresses.length) {
    return res.status(400).json({ message: "emails와 walletAddresses 길이가 다름" });
  }

  // wallet 주소 검증
  for (const w of walletAddresses) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(w)) {
      return res.status(400).json({ message: `잘못된 walletAddress: ${w}` });
    }
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

    if (!election.contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "contract_address 없음" });
    }

    // 2) voters 테이블에 유권자 추가
    // 이미 있는 email이면 무시 or 에러 선택 가능
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const wallet = walletAddresses[i];

      if (!email.endsWith("@stu.jejunu.ac.kr")) {
        await conn.rollback();
        return res.status(400).json({ message: `학교 이메일 아님: ${email}` });
      }

      await conn.query(
        `INSERT INTO voters (election_id, email, wallet_address)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE wallet_address = VALUES(wallet_address)`,
        [electionId, email, wallet]
      );
    }

    // 3) 블록체인 issueTokenBatch 실행
    const contract = getVotingContract(election.contract_address);

    const tx = await contract.issueTokenBatch(walletAddresses);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error("issueTokenBatch 트랜잭션 실패");
    }

    // 4) elections.total_voters 업데이트
    await conn.query(
      `UPDATE elections SET total_voters = total_voters + ? WHERE id = ?`,
      [walletAddresses.length, electionId]
    );

    await conn.commit();

    return res.json({
      message: "유권자 등록 + 토큰 발급 완료",
      electionId,
      count: walletAddresses.length,
      txHash: receipt.hash,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);

    return res.status(500).json({
      message: "유권자 등록 실패",
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

export default router;
