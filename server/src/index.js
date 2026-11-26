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
  ...(process.env.DEMO_MODE === "1" ? [] : ["MAIL_USER", "MAIL_PASS"]), // 데모는 메일을 보내지 않음
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
const tallyRoutes = require("./routes/tally");
const { restoreElectionSchedules } = require("./services/electionScheduler");

const app = express();
const PORT = process.env.PORT || 3000;

// 리버스 프록시(nginx 등) 뒤에서 돌릴 때 실제 클라이언트 IP 로 횟수 제한을 하려면 설정 (예: TRUST_PROXY=1)
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}

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

// 데모 안내 (DEMO_MODE=1 일 때만 내용이 있음): 화면의 체험 안내 배너가 읽는다
app.get(["/demo/info", "/api/demo/info"], (req, res) => {
  const { DEMO_MODE, loadDemoAccounts } = require("./demo");
  const a = DEMO_MODE ? loadDemoAccounts() : null;
  if (!a) return res.json({ enabled: false });
  const { EXHIBITION_MODE } = require("./exhibition");
  // 전시 모드에서는 계정 목록을 내보내지 않는다 (관람객은 아무 이메일로 로그인, 운영자 계정은 비공개)
  if (EXHIBITION_MODE) return res.json({ enabled: true, exhibition: true });
  res.json({ enabled: true, admin: a.admin, students: a.students, outsider: a.outsider });
});

// 라우터 연결
app.use("/auth", authRoutes);
app.use("/elections", electionsRoutes);
app.use("/elections", voterRoutes);
app.use("/elections", tallyRoutes);
app.use("/vote", voteRoutes);
app.use("/verification", verificationRoutes);

// 프론트 통합용 /api prefix 호환
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionsRoutes);
app.use("/api/elections", voterRoutes);
app.use("/api/elections", tallyRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/verification", verificationRoutes);

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  require("./exhibition").startExhibitionScheduler();
  restoreElectionSchedules().catch((err) => {
    console.error("선거 예약 복구 실패:", err);
  });
});
