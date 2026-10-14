const express = require("express");
const router = express.Router();
const db = require("../db");
const { getVotingContract } = require("../blockchain/votingContract");

/*
=====================================================
  익명 투표 제출 (relayer)
  POST /vote/relay        ※ 인증 없음 — 누가 보냈는지 서버가 알 필요가 없고, 알면 안 된다
  {
    "election_id": 1,
    "nullifier": "0x...(bytes32)",
    "merkleRoot": "123...",
    "encryptedData": "0x...",   // abi.encode(uint256 ciphertext)
    "voterPubKey": "0x...",     // abi.encode(uint256 ephPubX, uint256 ephPubY)
    "pA": [..2], "pB": [[..2],[..2]], "pC": [..2]   // pi_b swap 적용된 값
  }

  - 서버 관리자 지갑이 castVote 트랜잭션을 대신 보낸다 (학생 지갑·토큰·가스 불필요).
  - 자격은 증명(유권자 트리 포함)으로, 이중투표는 nullifier 로 컨트랙트가 막는다.
  - 보내기 전에 staticCall 로 미리 실행해 보고, 실패할 증명이면 가스를 쓰지 않고 거절한다.
  - 요청 본문/IP 를 로그로 남기지 않는다.
=====================================================
*/
const isHex = (v, bytes) => typeof v === "string" && new RegExp(`^0x[0-9a-fA-F]{${bytes ? bytes * 2 : "2,"}}$`).test(v);
const isUint = (v) => (typeof v === "string" && /^[0-9]{1,78}$/.test(v)) || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
const isPair = (a) => Array.isArray(a) && a.length === 2 && a.every(isUint);

router.post("/relay", async (req, res) => {
  try {
    const { election_id, nullifier, merkleRoot, encryptedData, voterPubKey, pA, pB, pC } = req.body || {};
    if (!election_id || !isHex(nullifier, 32) || !isUint(merkleRoot) || !isHex(encryptedData) || !isHex(voterPubKey)
        || !isPair(pA) || !Array.isArray(pB) || pB.length !== 2 || !pB.every(isPair) || !isPair(pC)) {
      return res.status(400).json({ message: "요청 형식 오류" });
    }

    const [rows] = await db.query(`SELECT status, contract_address FROM elections WHERE id=?`, [election_id]);
    if (rows.length === 0) return res.status(404).json({ message: "선거 없음" });
    if (rows[0].status !== "active" || !rows[0].contract_address) {
      return res.status(400).json({ message: "현재 투표 가능한 상태가 아님" });
    }

    const contract = getVotingContract(rows[0].contract_address);
    const args = [nullifier, BigInt(merkleRoot), encryptedData, voterPubKey,
      pA.map(BigInt), pB.map((r) => r.map(BigInt)), pC.map(BigInt)];

    try {
      await contract.castVote.staticCall(...args);
    } catch (err) {
      const reason = err?.reason || err?.shortMessage || "rejected";
      return res.status(400).json({ message: "투표가 거절되었습니다.", reason });
    }

    const tx = await contract.castVote(...args);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      return res.status(502).json({ message: "트랜잭션 실패" });
    }

    // 투표율 표시용 (누가 했는지는 기록하지 않음)
    await db.query(`UPDATE elections SET voted_count = voted_count + 1 WHERE id=?`, [election_id]);

    return res.json({ message: "투표 완료", txHash: receipt.hash || tx.hash });
  } catch (err) {
    console.error("[vote/relay] 오류:", err.message);
    return res.status(500).json({ message: "서버 오류" });
  }
});

/*
  POST /vote/confirm — 삭제됨
  학번(JWT)과 투표 트랜잭션·임시 공개키를 한 행에 묶어 저장해서, 서버가 "누가 누구에게"를 복원할 수 있었다.
*/
router.post("/confirm", (req, res) => {
  res.status(410).json({ message: "더 이상 사용하지 않는 API 입니다. /vote/relay 를 사용하세요." });
});

module.exports = router;
