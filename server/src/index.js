require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const electionsRoutes = require("./routes/elections");

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

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 라우터 연결
app.use("/auth", authRoutes);
app.use("/elections", electionsRoutes);

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
