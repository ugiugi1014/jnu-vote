require("dotenv").config();
const express = require("express");
const cors = require("cors");

// 부팅 시 필수 환경변수 검증 — 누락이면 fail-fast
const REQUIRED_ENV = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
  "MAIL_USER",
  "MAIL_PASS",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[FATAL] 환경변수 누락: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const pool = require("./db");
const authRoutes = require("./routes/auth");
const electionsRoutes = require("./routes/elections");
const voterRoutes = require("./routes/voter");
const voteRoutes = require("./routes/vote");
const verificationRoutes = require("./routes/verification");
const { restoreElectionSchedules } = require("./services/electionScheduler");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: 화이트리스트는 .env의 CORS_ORIGINS (쉼표 구분), 없으면 Vite 기본(5173)
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// 헬스체크 — DB ping까지 포함해서 진짜 살아있는지 확인
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("health check DB error:", err);
    res.status(503).json({ status: "db_down" });
  }
});

// 라우터 연결
app.use("/auth", authRoutes);
app.use("/elections", electionsRoutes);
app.use("/elections", voterRoutes);
app.use("/vote", voteRoutes);
app.use("/verification", verificationRoutes);

// 프론트 통합용 /api prefix 호환
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionsRoutes);
app.use("/api/elections", voterRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/verification", verificationRoutes);

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  restoreElectionSchedules().catch((err) => {
    console.error("선거 예약 복구 실패:", err);
  });
});
