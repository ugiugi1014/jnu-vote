const express = require("express");

const router = express.Router();

/**
 * POST /elections/:id/tokens/issue  — 사용 중지 (410)
 * 익명 투표 전환 후 투표는 relayer 가 제출하므로 투표 토큰·가스 발급이 필요 없다.
 * 학생은 투표 화면에서 투표 키(commitment)를 직접 등록한다 (POST /elections/:id/register-commitment).
 */
router.post("/:id/tokens/issue", (req, res) => {
  res.status(410).json({ message: "토큰 발급은 더 이상 사용하지 않습니다 (익명 투표: relayer 제출)." });
});

module.exports = router;
