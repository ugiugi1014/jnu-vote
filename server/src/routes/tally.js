const express = require("express");
const auth = require("../middleware/auth");
const { performTally } = require("../services/tallyService");

const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "로그인 필요" });
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "관리자 권한 필요" });
  }
  next();
}

/**
 * POST /api/elections/:id/tally  (관리자 전용)
 * 수동 개표. closed 상태 선거에 대해 즉시 개표 + 체인 기록.
 *
 * 자동 개표는 electionScheduler 가 end_time 도달 시 호출 (services/tallyService.performTally).
 */
router.post("/:id/tally", auth, adminOnly, async (req, res) => {
  try {
    const result = await performTally(req.params.id);

    if (result.recordTallyError) {
      return res.status(200).json({
        message: "개표 완료 (DB) — 체인 기록 실패. recordTally 재시도 필요.",
        ...result,
      });
    }

    return res.json({
      message: "개표 완료 + ZKP proof 생성 + 체인 기록 완료",
      ...result,
    });
  } catch (err) {
    console.error("[tally route]", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      message: err.message || "개표 실패",
    });
  }
});

module.exports = router;
