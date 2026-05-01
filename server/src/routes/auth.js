const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const pool = require("../db");

// Gmail SMTP 설정
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// 6자리 랜덤 코드 생성
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 관리자 이메일 화이트리스트 (.env의 ADMIN_EMAILS 쉼표 구분)
function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// POST /auth/send-code
// 이메일로 인증 코드 발송
router.post("/send-code", async (req, res) => {
  try {
    const { email } = req.body;

    // 이메일 형식 확인: @stu.jejunu.ac.kr 도메인만 허용 (관리자 화이트리스트는 예외)
    if (!email || (!email.endsWith("@stu.jejunu.ac.kr") && !isAdminEmail(email))) {
      return res.status(400).json({ error: "제주대학교 학생 이메일(@stu.jejunu.ac.kr)만 사용 가능합니다." });
    }

    // 1분 내 재발급 차단 (스팸 방지)
    const [recent] = await pool.query(
      "SELECT id FROM auth_codes WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1",
      [email]
    );
    if (recent.length > 0) {
      return res.status(429).json({ error: "1분 후에 다시 시도해주세요." });
    }

    // 6자리 코드 생성
    const code = generateCode();

    // 만료 시간: 5분 후
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // DB에 인증 코드 저장
    await pool.query(
      "INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)",
      [email, code, expiresAt]
    );

    // 이메일 발송
    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "[JNU 전자투표] 이메일 인증 코드",
      text: `인증 코드: ${code}\n\n5분 내에 입력해주세요.`,
    });

    res.json({ message: "인증 코드가 발송되었습니다." });
  } catch (err) {
    console.error("send-code 오류:", err);
    res.status(500).json({ error: "인증 코드 발송에 실패했습니다." });
  }
});

// POST /auth/verify-code
// 인증 코드 검증 + JWT 발급
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "이메일과 인증 코드를 입력해주세요." });
    }

    // 해당 이메일의 가장 최근 미사용 코드 조회
    const [rows] = await pool.query(
      `SELECT id, code, expires_at, attempts
       FROM auth_codes
       WHERE email = ? AND is_used = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "인증 코드를 먼저 발급받아주세요." });
    }

    const authCode = rows[0];

    // 시도 횟수 초과 확인
    if (authCode.attempts >= 5) {
      return res.status(400).json({ error: "시도 횟수를 초과했습니다. 새 코드를 발급받아주세요." });
    }

    // 만료 확인
    if (new Date() > new Date(authCode.expires_at)) {
      return res.status(400).json({ error: "인증 코드가 만료되었습니다. 새 코드를 발급받아주세요." });
    }

    // 코드 불일치
    if (authCode.code !== code) {
      // 시도 횟수 증가
      await pool.query(
        "UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?",
        [authCode.id]
      );
      return res.status(400).json({ error: "인증 코드가 올바르지 않습니다." });
    }

    // 코드 일치 → 사용 처리
    await pool.query(
      "UPDATE auth_codes SET is_used = TRUE WHERE id = ?",
      [authCode.id]
    );

    // 서버 시크릿 조회 또는 생성 (인앱 지갑 재생성용)
    const [secrets] = await pool.query(
      "SELECT secret FROM user_secrets WHERE email = ?",
      [email]
    );

    let serverSecret;
    if (secrets.length > 0) {
      serverSecret = secrets[0].secret;
    } else {
      serverSecret = crypto.randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO user_secrets (email, secret) VALUES (?, ?)",
        [email, serverSecret]
      );
    }

    // JWT 발급 (24시간 유효) — 관리자 화이트리스트면 role=admin
    const role = isAdminEmail(email) ? "admin" : "user";
    const token = jwt.sign(
      { email, role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ message: "인증 성공", token, serverSecret, role });
  } catch (err) {
    console.error("verify-code 오류:", err);
    res.status(500).json({ error: "인증 코드 검증에 실패했습니다." });
  }
});

module.exports = router;
