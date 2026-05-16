const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const auth = require("../middleware/auth");

// 0x + 40 hex 형식 검증
const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Gmail SMTP 설정 (TLS 검증 우회는 운영환경에서는 비활성화)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
  },
});

// 인증코드 brute-force 잠금 정책
const LOCKOUT_WINDOW_MIN = 30; // 분
const LOCKOUT_THRESHOLD = 10;  // 최근 윈도우 내 실패 시도 합계가 이 값 이상이면 잠금

// 암호학적으로 안전한 6자리 랜덤 코드
function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// 관리자 이메일 화이트리스트 (.env의 ADMIN_EMAILS 쉼표 구분)
function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// 이메일 단위 잠금 체크 (최근 윈도우 내 실패 시도 합산)
async function isEmailLockedOut(email) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(attempts), 0) AS total
     FROM auth_codes
     WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [email, LOCKOUT_WINDOW_MIN]
  );
  return Number(rows[0].total) >= LOCKOUT_THRESHOLD;
}

// POST /auth/send-code
// 이메일로 인증 코드 발송
router.post("/send-code", async (req, res) => {
  try {
    const { email } = req.body;

    // 이메일 형식 확인: @stu.jejunu.ac.kr 도메인만 허용 (관리자 화이트리스트는 예외)
    if (!email || (!email.endsWith("@stu.jejunu.ac.kr") && !isAdminEmail(email))) {
      return res.status(400).json({ message: "제주대학교 학생 이메일(@stu.jejunu.ac.kr)만 사용 가능합니다." });
    }

    // 이메일 단위 잠금 (최근 30분간 실패 시도 합계)
    if (await isEmailLockedOut(email)) {
      return res.status(429).json({
        message: `시도 횟수가 너무 많습니다. ${LOCKOUT_WINDOW_MIN}분 후에 다시 시도해주세요.`,
      });
    }

    // 1분 내 재발급 차단 (스팸 방지)
    const [recent] = await pool.query(
      "SELECT id FROM auth_codes WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1",
      [email]
    );
    if (recent.length > 0) {
      return res.status(429).json({ message: "1분 후에 다시 시도해주세요." });
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
    res.status(500).json({ message: "인증 코드 발송에 실패했습니다." });
  }
});

// POST /auth/verify-code
// 인증 코드 검증 + JWT 발급
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "이메일과 인증 코드를 입력해주세요." });
    }

    // 이메일 단위 잠금 (최근 30분간 실패 시도 합계)
    if (await isEmailLockedOut(email)) {
      return res.status(429).json({
        message: `시도 횟수가 너무 많습니다. ${LOCKOUT_WINDOW_MIN}분 후에 다시 시도해주세요.`,
      });
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
      return res.status(400).json({ message: "인증 코드를 먼저 발급받아주세요." });
    }

    const authCode = rows[0];

    // 만료 확인
    if (new Date() > new Date(authCode.expires_at)) {
      return res.status(400).json({ message: "인증 코드가 만료되었습니다. 새 코드를 발급받아주세요." });
    }

    // 코드 불일치
    if (authCode.code !== code) {
      // 시도 횟수 증가
      await pool.query(
        "UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?",
        [authCode.id]
      );
      return res.status(400).json({ message: "인증 코드가 올바르지 않습니다." });
    }

    // 코드 일치 → 사용 처리
    await pool.query(
      "UPDATE auth_codes SET is_used = TRUE WHERE id = ?",
      [authCode.id]
    );

    // 서버 시크릿 조회 또는 생성 (인앱 지갑 재생성용)
    const [secrets] = await pool.query(
      "SELECT secret, wallet_address FROM user_secrets WHERE email = ?",
      [email]
    );

    let serverSecret;
    let walletAddress = null;
    if (secrets.length > 0) {
      serverSecret = secrets[0].secret;
      walletAddress = secrets[0].wallet_address;
    } else {
      serverSecret = crypto.randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO user_secrets (email, secret) VALUES (?, ?)",
        [email, serverSecret]
      );
    }

    const [verificationRows] = await pool.query(
      "SELECT status, student_id, note, reviewed_at FROM user_verifications WHERE email = ?",
      [email]
    );
    const verification = verificationRows[0] || {
      status: "none",
      student_id: null,
      note: null,
      reviewed_at: null,
    };

    // JWT 발급 (24시간 유효) — 관리자 화이트리스트면 role=admin
    const role = isAdminEmail(email) ? "admin" : "user";
    const token = jwt.sign(
      { email, role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "인증 성공",
      token,
      serverSecret,
      role,
      walletAddress,
      verification,
    });
  } catch (err) {
    console.error("verify-code 오류:", err);
    res.status(500).json({ message: "인증 코드 검증에 실패했습니다." });
  }
});

// POST /auth/wallet
// 사용자 단위 지갑주소 등록 (최초 1회만 허용, 등록 후 변경 불가)
router.post("/wallet", auth, async (req, res) => {
  try {
    const { wallet_address } = req.body;

    if (!wallet_address || !WALLET_ADDRESS_REGEX.test(wallet_address)) {
      return res.status(400).json({ message: "잘못된 지갑 주소 형식입니다." });
    }

    const email = req.user.email;
    const normalized = wallet_address.toLowerCase();

    // 사용자 시크릿 존재 여부 확인 (verify-code 통과해야 행이 있음)
    const [rows] = await pool.query(
      "SELECT wallet_address FROM user_secrets WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다. 다시 로그인해주세요." });
    }

    const existing = rows[0].wallet_address;

    // 이미 등록된 경우 — 같은 주소면 OK, 다르면 409
    if (existing) {
      if (existing.toLowerCase() === normalized) {
        return res.json({
          message: "이미 등록된 지갑입니다.",
          wallet_address: existing,
          already_registered: true,
        });
      }
      return res.status(409).json({
        message: "이미 다른 지갑 주소가 등록되어 있습니다.",
        wallet_address: existing,
      });
    }

    // 최초 등록
    await pool.query(
      "UPDATE user_secrets SET wallet_address = ?, wallet_registered_at = NOW() WHERE email = ?",
      [normalized, email]
    );

    res.json({
      message: "지갑 주소 등록 완료",
      wallet_address: normalized,
      already_registered: false,
    });
  } catch (err) {
    console.error("/auth/wallet 오류:", err);
    res.status(500).json({ message: "지갑 등록에 실패했습니다." });
  }
});

// GET /auth/me
// 토큰 기반 사용자 정보 조회 (새로고침 시 자동 로그인용)
router.get("/me", auth, async (req, res) => {
  try {
    const email = req.user.email;
    const role = req.user.role;

    const [secretRows] = await pool.query(
      "SELECT wallet_address FROM user_secrets WHERE email = ?",
      [email]
    );

    if (secretRows.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const [verificationRows] = await pool.query(
      "SELECT status, student_id, note, reviewed_at FROM user_verifications WHERE email = ?",
      [email]
    );

    const verification = verificationRows[0] || {
      status: "none",
      student_id: null,
      note: null,
      reviewed_at: null,
    };

    res.json({
      email,
      role,
      walletAddress: secretRows[0].wallet_address,
      verification,
    });
  } catch (err) {
    console.error("/auth/me 오류:", err);
    res.status(500).json({ message: "사용자 정보 조회에 실패했습니다." });
  }
});

module.exports = router;
