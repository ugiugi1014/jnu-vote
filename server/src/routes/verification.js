const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();
const uploadDir = path.join(process.cwd(), "uploads", "verifications");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeEmail = req.user.email.replace(/[^a-zA-Z0-9]/g, "_");
    const ext = path.extname(file.originalname || "");
    cb(null, `${safeEmail}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "로그인 필요" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "관리자 권한 필요" });
  }
  next();
}

function removeUploadedFile(filePath) {
  if (!filePath) return;

  const absolutePath = path.resolve(process.cwd(), filePath);
  const uploadsRoot = path.resolve(process.cwd(), "uploads");

  if (!absolutePath.startsWith(uploadsRoot)) {
    return;
  }

  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (err) {
    console.error("인증 파일 삭제 실패:", err);
  }
}

// POST /verification/request
// multipart/form-data: student_id, file
router.post("/request", auth, upload.single("file"), async (req, res) => {
  try {
    const email = req.user.email;
    const { doc_no, student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ message: "student_id 필수" });
    }

    if (!doc_no || doc_no.length !== 16 || !/^[a-zA-Z0-9]+$/.test(doc_no)) {
      return res.status(400).json({ message: "문서번호 형식이 올바르지 않습니다." });
    }

    const filePath = req.file ? path.relative(process.cwd(), req.file.path) : null;

    // KICA 진위확인
    let autoApproved = false;
    try {
      const kicaRes = await fetch(
        'https://unv.doculink.co.kr/servlet/WMVERIFY?COMMAND=GETPRINTVIEWEXE',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://unc.doculink.co.kr/',
          },
          body: new URLSearchParams({ DOC_NO: doc_no, GUBUN: 'null' }),
        }
      );
      const kicaData = await kicaRes.json();

      if (kicaData.SUCC != "Y") {
        return res.status(400).json({ message: "유효하지 않은 재학증명서입니다. 문서번호를 다시 확인해주세요." });
      }

      autoApproved = true;
    } catch (kicaErr) {
      console.error("KICA 서버 오류:", kicaErr);
      // KICA 오류 시 pending으로 fallback
    }

    const status = autoApproved ? "approved" : "pending";

    await db.query(
      `INSERT INTO user_verifications (email, student_id, file_path, status)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        student_id = VALUES(student_id),
        file_path = COALESCE(VALUES(file_path), file_path),
        status = VALUES(status),
        note = NULL,
        reviewed_at = ${autoApproved ? "NOW()" : "NULL"}`,
      [email, student_id, filePath, status]
    );

    res.json({ message: "인증 신청 완료", status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// GET /verification/me
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT email, student_id, file_path, status, note, created_at, reviewed_at
       FROM user_verifications
       WHERE email = ?`,
      [req.user.email]
    );

    if (rows.length === 0) {
      return res.json({ status: "none" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// GET /verification/admin?status=pending
router.get("/admin", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";

    if (status) {
      where = "WHERE status = ?";
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT id, email, student_id, file_path, status, note, created_at, reviewed_at
       FROM user_verifications
       ${where}
       ORDER BY created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// GET /verification/admin/:id/file
// 학생증 사진 스트림 (관리자 전용, 승인/거절 전까지만 접근 가능)
// 프론트는 fetch + Authorization 헤더로 받아 blob URL 로 <img> 렌더 — 통합 TODO
router.get("/admin/:id/file", auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT file_path FROM user_verifications WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "인증 신청 없음" });
    }

    const filePath = rows[0].file_path;
    if (!filePath) {
      return res.status(404).json({ message: "파일 없음 (이미 처리됨)" });
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    const uploadsRoot = path.resolve(process.cwd(), "uploads");

    // 경로 escape 방지 + 실제 존재 여부 체크
    if (!absolutePath.startsWith(uploadsRoot) || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: "파일 없음" });
    }

    res.sendFile(absolutePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// PATCH /verification/admin/:id
router.patch("/admin/:id", auth, adminOnly, async (req, res) => {
  try {
    const { status, note } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status는 approved 또는 rejected만 가능" });
    }

    const [rows] = await db.query(
      "SELECT file_path FROM user_verifications WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "인증 신청 없음" });
    }

    const [result] = await db.query(
      `UPDATE user_verifications
       SET status = ?, note = ?, file_path = NULL, reviewed_at = NOW()
       WHERE id = ?`,
      [status, note || null, req.params.id]
    );

    removeUploadedFile(rows[0].file_path);

    res.json({ message: "인증 상태 변경 완료", status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 재학증명서 진위확인
router.post('/verify-document', async (req, res) => {
  const { docNo } = req.body;

  if (!docNo || docNo.length !== 16 || !/^[a-zA-Z0-9]+$/.test(docNo)) {
    return res.status(400).json({ valid: false, reason: 'invalid_format' });
  }

  try {
    const response = await fetch(
      'https://unv.doculink.co.kr/servlet/WMVERIFY?COMMAND=GETPRINTVIEWEXE',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://unc.doculink.co.kr/',
          //'Origin': 'https://unc.doculink.co.kr',
        },
        body: new URLSearchParams({ DOC_NO: docNo, GUBUN: 'null' }),
      }
    );

    const data = await response.json();
    const isValid = data.SUCC === "Y";
    res.json({ valid: isValid });

  } catch (err) {
    res.status(500).json({ valid: false, reason: 'server_error' });
  }
});

module.exports = router;
