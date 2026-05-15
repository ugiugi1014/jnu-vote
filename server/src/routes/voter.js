const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "로그인 필요" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "관리자 권한 필요" });
  }
  next();
}

/**
 * POST /elections/:id/tokens/issue
 * body: { emails?: [] }
 */
router.post("/:id/tokens/issue", auth, adminOnly, async (req, res) => {
  const electionId = req.params.id;
  const { emails } = req.body || {};

  if (emails !== undefined && !Array.isArray(emails)) {
    return res.status(400).json({ message: "emails는 배열이어야 합니다." });
  }

  if (Array.isArray(emails) && emails.length === 0) {
    return res.status(400).json({ message: "emails가 비어 있습니다." });
  }

  if (Array.isArray(emails)) {
    for (const email of emails) {
      if (!email.endsWith("@stu.jejunu.ac.kr")) {
        return res.status(400).json({ message: `학교 이메일 아님: ${email}` });
      }
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

    if (!election.token_contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "token_contract_address 없음" });
    }

    // 2) 계정 단위 인증/지갑 기준으로 토큰 발급 대상 조회
    let voterRows;
    if (Array.isArray(emails)) {
      const placeholders = emails.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `SELECT uv.email, uv.student_id, us.wallet_address, v.id AS voter_id
         FROM user_verifications uv
         JOIN user_secrets us ON us.email = uv.email
         LEFT JOIN voters v ON v.election_id = ? AND v.email = uv.email
         WHERE uv.status = 'approved'
           AND us.wallet_address IS NOT NULL
           AND (v.token_issued_at IS NULL OR v.id IS NULL)
           AND uv.email IN (${placeholders})`,
        [electionId, ...emails]
      );
      voterRows = rows;

      if (voterRows.length !== emails.length) {
        await conn.rollback();
        return res.status(400).json({
          message: "일부 유권자가 승인되지 않았거나 지갑 주소가 없거나 이미 토큰이 발급되었습니다.",
        });
      }
    } else {
      const [rows] = await conn.query(
        `SELECT uv.email, uv.student_id, us.wallet_address, v.id AS voter_id
         FROM user_verifications uv
         JOIN user_secrets us ON us.email = uv.email
         LEFT JOIN voters v ON v.election_id = ? AND v.email = uv.email
         WHERE uv.status = 'approved'
           AND us.wallet_address IS NOT NULL
           AND (v.token_issued_at IS NULL OR v.id IS NULL)`,
        [electionId]
      );
      voterRows = rows;
    }

    if (voterRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "토큰 발급 가능한 유권자가 없습니다." });
    }

    const walletAddresses = voterRows.map((v) => v.wallet_address);

    // 3) 블록체인 issueTokenBatch 실행
    const { getVotingTokenContract } = require("../blockchain/votingContract");
    const contract = getVotingTokenContract(election.token_contract_address);

    const tx = await contract.issueTokenBatch(walletAddresses);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error("issueTokenBatch 트랜잭션 실패");
    }

    for (const voter of voterRows) {
      await conn.query(
        `INSERT INTO voters (election_id, email, student_id, wallet_address, token_issued_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           student_id = COALESCE(VALUES(student_id), student_id),
           wallet_address = VALUES(wallet_address),
           token_issued_at = COALESCE(token_issued_at, NOW())`,
        [electionId, voter.email, voter.student_id || null, voter.wallet_address]
      );
    }

    // 4) elections.total_voters 업데이트
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM voters v
       JOIN user_verifications uv ON uv.email = v.email
       WHERE v.election_id = ? AND uv.status = 'approved'`,
      [electionId]
    );

    await conn.query(
      `UPDATE elections SET total_voters = ? WHERE id = ?`,
      [countRows[0].total, electionId]
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

module.exports = router;
