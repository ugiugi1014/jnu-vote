const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");
const { ethers } = require("ethers");

function getProvider() {
  if (!process.env.RPC_URL) {
    throw new Error("RPC_URL 환경변수가 필요합니다.");
  }
  return new ethers.JsonRpcProvider(process.env.RPC_URL);
}

/*
=====================================================
  1) 투표 확인 (사용자가 castVote 후 txHash 제출)
  POST /vote/confirm
  {
    "election_id": 1,
    "txHash": "0x....",
    "voter_public_key": "04...."
  }

  ※ email은 JWT에서 가져오는게 정석 (req.user.email)
=====================================================
*/
router.post("/confirm", auth, async (req, res) => {
  const conn = await db.getConnection();

  try {
    const provider = getProvider();
    await conn.beginTransaction();

    const { election_id, txHash, voter_public_key } = req.body;

    if (!election_id || !txHash) {
      await conn.rollback();
      return res.status(400).json({ message: "election_id, txHash 필수" });
    }

    if (!voter_public_key) {
      await conn.rollback();
      return res.status(400).json({ message: "voter_public_key 필수" });
    }

    // JWT에서 사용자 email 가져오기
    const email = req.user.email;

    // 1) election 조회
    const [electionRows] = await conn.query(
      `SELECT id, status, contract_address 
       FROM elections 
       WHERE id=?`,
      [election_id]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    const election = electionRows[0];

    if (election.status !== "active") {
      await conn.rollback();
      return res.status(400).json({ message: "현재 투표 가능한 상태가 아님" });
    }

    if (!election.contract_address) {
      await conn.rollback();
      return res.status(400).json({ message: "contract_address가 등록되지 않음" });
    }

    // 2) voter 조회
    const [voterRows] = await conn.query(
      `SELECT v.id, us.wallet_address, COALESCE(uv.status, 'none') AS verification_status,
              v.token_issued_at, v.has_voted
       FROM voters v
       LEFT JOIN user_secrets us ON us.email = v.email
       LEFT JOIN user_verifications uv ON uv.email = v.email
       WHERE v.election_id=? AND v.email=?`,
      [election_id, email]
    );

    if (voterRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "유권자 등록이 안됨" });
    }

    const voter = voterRows[0];

    if (!voter.wallet_address) {
      await conn.rollback();
      return res.status(400).json({ message: "지갑 주소가 등록되지 않음" });
    }

    if (voter.verification_status !== "approved") {
      await conn.rollback();
      return res.status(400).json({ message: "학생증 인증 승인 후 투표할 수 있습니다." });
    }

    if (!voter.token_issued_at) {
      await conn.rollback();
      return res.status(400).json({ message: "투표 토큰이 발급되지 않았습니다." });
    }

    if (voter.has_voted) {
      await conn.rollback();
      return res.status(400).json({ message: "이미 투표한 유권자" });
    }

    // 3) 트랜잭션 receipt 검증
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      await conn.rollback();
      return res.status(400).json({ message: "트랜잭션이 아직 블록에 포함되지 않음" });
    }

    if (receipt.status !== 1) {
      await conn.rollback();
      return res.status(400).json({ message: "트랜잭션 실패(status=0)" });
    }

    // 4) 트랜잭션 내용 검증
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      await conn.rollback();
      return res.status(400).json({ message: "트랜잭션 조회 실패" });
    }

    // (A) 컨트랙트 주소 검증
    if (!tx.to || tx.to.toLowerCase() !== election.contract_address.toLowerCase()) {
      await conn.rollback();
      return res.status(400).json({ message: "해당 선거 컨트랙트 tx가 아님" });
    }

    // (B) 투표자 주소 검증
    if (!tx.from || tx.from.toLowerCase() !== voter.wallet_address.toLowerCase()) {
      await conn.rollback();
      return res.status(400).json({ message: "유권자 지갑에서 발생한 tx가 아님" });
    }

    // 5) voter_public_key 저장 + has_voted 처리
    await conn.query(
      `UPDATE voters
       SET voter_public_key=?, has_voted=TRUE
       WHERE id=?`,
      [voter_public_key, voter.id]
    );

    // 6) elections voted_count 증가
    await conn.query(
      `UPDATE elections
       SET voted_count = voted_count + 1
       WHERE id=?`,
      [election_id]
    );

    await conn.commit();

    return res.json({
      message: "투표 확인 완료",
      election_id,
      txHash,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: "서버 오류", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
