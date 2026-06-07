const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const db = require("../db");
const auth = require("../middleware/auth");
const { scheduleElectionClose, clearElectionSchedule } = require("../services/electionScheduler");

const ELECTION_FACTORY_ABI = [
  "function createElection(uint256 electionId, address electionAdmin) external returns (address votingSystem, address votingToken)",
  "event ElectionCreated(uint256 indexed electionId, address votingSystem, address votingToken)",
];

const VOTING_TOKEN_ABI = [
  "function issueTokenBatch(address[] calldata recipients) external",
];

// status 상수화
const ELECTION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  CLOSED: "closed",
  TALLIED: "tallied",
};

// 응답으로 노출 가능한 elections 컬럼 (coord_private_key 제외)
// 개표 등 백엔드 내부에서만 개인키가 필요할 때는 별도 SELECT 사용
const ELECTION_PUBLIC_COLUMNS = `
  id, title, description, start_time, end_time, status,
  coord_public_key, contract_address, token_contract_address,
  total_voters, voted_count, created_at
`;

// 관리자 전용 미들웨어 (JWT의 role 클레임 기준)
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

// 선거 존재 확인 함수 (코디네이터 개인키는 절대 응답에 포함하지 않음)
async function getElectionById(electionId) {
  const [rows] = await db.query(
    `SELECT ${ELECTION_PUBLIC_COLUMNS} FROM elections WHERE id=?`,
    [electionId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/*
=====================================================
  1) 선거 생성 (관리자)
  POST /elections
  {
  "title": "...",
  "description": "...",
  "start_time": "2026-04-20 09:00:00",
  "end_time": "2026-04-21 18:00:00"
}
=====================================================
*/
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const { title, description, start_time, end_time } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ message: "title, start_time, end_time 필수" });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ message: "종료 시간은 시작 시간보다 늦어야 합니다." });
    }

    // 코디네이터 ECDH 키쌍 자동 생성 (개표 시 복호화용)
    const { generateCoordKeyPair } = require("../services/ecdhDecrypt");
    const { publicKeyJWK, privateKeyJWK } = await generateCoordKeyPair();

    const [result] = await db.query(
      `INSERT INTO elections (title, description, start_time, end_time, coord_public_key, coord_private_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description || null, start_time, end_time, publicKeyJWK, privateKeyJWK]
    );

    scheduleElectionClose({ id: result.insertId, end_time });

    res.json({
      message: "선거 생성 완료",
      election_id: result.insertId,
      coord_public_key: publicKeyJWK,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  2) 선거 목록 조회
  GET /elections
=====================================================
*/
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${ELECTION_PUBLIC_COLUMNS}
       FROM elections
       ORDER BY created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  3) 선거 상세 조회 (후보 포함)
  GET /elections/:id
=====================================================
*/
router.get("/:id", async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }

    const [candidates] = await db.query(
      `SELECT id, election_id, name, description, candidate_index, created_at
       FROM candidates
       WHERE election_id=?
       ORDER BY candidate_index ASC`,
      [electionId]
    );

    res.json({ election, candidates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  3-1) 코디네이터 공개키 조회 (투표 시 ECDH용)
  GET /elections/:id/coordinator/public-key
  응답: JWK 객체 (kty, crv, x, y)
=====================================================
*/
router.get("/:id/coordinator/public-key", async (req, res) => {
  try {
    const electionId = req.params.id;

    const [rows] = await db.query(
      "SELECT coord_public_key FROM elections WHERE id=?",
      [electionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "선거 없음" });
    }

    if (!rows[0].coord_public_key) {
      return res.status(404).json({ message: "코디네이터 공개키 미생성" });
    }

    // DB 에는 JSON 문자열로 저장됨 — JWK 객체로 파싱해서 반환
    try {
      const jwk = JSON.parse(rows[0].coord_public_key);
      return res.json(jwk);
    } catch (parseErr) {
      return res.status(500).json({ message: "공개키 파싱 실패", error: parseErr.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  4) 선거 수정 (관리자)
  PUT /elections/:id
=====================================================
*/
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }

    // undefined 체크 방식 (빈 문자열도 허용)
    const title = req.body.title !== undefined ? req.body.title : election.title;
    const description =
      req.body.description !== undefined ? req.body.description : election.description;
    const start_time =
      req.body.start_time !== undefined ? req.body.start_time : election.start_time;
    const end_time = req.body.end_time !== undefined ? req.body.end_time : election.end_time;

    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ message: "종료 시간은 시작 시간보다 늦어야 합니다." });
    }

    await db.query(
      `UPDATE elections
       SET title=?, description=?, start_time=?, end_time=?
       WHERE id=?`,
      [title, description, start_time, end_time, electionId]
    );

    scheduleElectionClose({ id: electionId, end_time });

    res.json({ message: "선거 수정 완료" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  5) 선거 삭제 (관리자)
  DELETE /elections/:id
  - pending 상태에서만 삭제 가능하게 제한
=====================================================
*/
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "대기중(pending) 상태에서만 삭제 가능" });
    }

    await db.query(`DELETE FROM elections WHERE id=?`, [electionId]);
    clearElectionSchedule(electionId);

    res.json({ message: "선거 삭제 완료" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  6) 선거 시작 (pending -> active)
  POST /elections/:id/start
=====================================================
*/
router.post("/:id/start", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "선거 시작 실패 (pending 상태만 가능)" });
    }

    if (!election.contract_address || !election.token_contract_address) {
      return res.status(400).json({ message: "contract_address, token_contract_address 등록 후 시작 가능" });
    }

    const { ethers } = require("ethers");
    const VOTING_SYSTEM_ABI = [
      "function openElection() external",
    ];
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const adminWallet = new ethers.Wallet(process.env.ADMIN_WALLET_PRIVATE_KEY, provider);
    const votingSystem = new ethers.Contract(
      election.contract_address,
      VOTING_SYSTEM_ABI,
      adminWallet
    );
    const tx = await votingSystem.openElection();
    await tx.wait();
    
    const [result] = await db.query(
      `UPDATE elections
       SET status=?
       WHERE id=? AND status=?`,
      [ELECTION_STATUS.ACTIVE, electionId, ELECTION_STATUS.PENDING]
    );

    const [rows] = await db.query(
      `SELECT id, end_time FROM elections WHERE id=?`,
      [electionId]
    );
    if (rows.length > 0) {
      scheduleElectionClose(rows[0]);
    }

    res.json({ message: "선거 시작됨 (active)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  7) 선거 종료 (active -> closed)
  POST /elections/:id/close
=====================================================
*/
router.post("/:id/close", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }
    if (election.status !== ELECTION_STATUS.ACTIVE) {
      return res.status(400).json({ message: "선거 종료 실패 (active 상태만 가능)" });
    }

    // 체인 closeElection() 선행 — recordTally의 whenElectionClosed 전제 (start의 openElection 대칭)
    const { closeElectionOnChain } = require("../blockchain/votingContract");
    await closeElectionOnChain(election.contract_address);

    const [result] = await db.query(
      `UPDATE elections
       SET status=?
       WHERE id=? AND status=?`,
      [ELECTION_STATUS.CLOSED, electionId, ELECTION_STATUS.ACTIVE]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "선거 종료 실패 (active 상태만 가능)" });
    }

    clearElectionSchedule(electionId);

    res.json({ message: "선거 종료됨 (closed)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  8) 컨트랙트 주소 등록
  POST /elections/:id/contract
=====================================================
*/
router.post("/:id/contract", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;
    const { contract_address, token_contract_address } = req.body;

    if (!contract_address && !token_contract_address) {
      return res.status(400).json({
        message: "contract_address 또는 token_contract_address 중 하나는 필수",
      });
    }

    if (contract_address && !/^0x[a-fA-F0-9]{40}$/.test(contract_address)) {
      return res.status(400).json({ message: "contract_address 형식 오류" });
    }

    if (token_contract_address && !/^0x[a-fA-F0-9]{40}$/.test(token_contract_address)) {
      return res.status(400).json({ message: "token_contract_address 형식 오류" });
    }

    await db.query(
      `UPDATE elections
       SET contract_address = COALESCE(?, contract_address),
           token_contract_address = COALESCE(?, token_contract_address)
       WHERE id=?`,
      [contract_address || null, token_contract_address || null, electionId]
    );

    res.json({ message: "컨트랙트 주소 저장 완료" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  9) 후보 등록 (pending 상태만 가능)
  POST /elections/:id/candidates
=====================================================
*/
router.post("/:id/candidates", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;
    const { name, description, candidate_index } = req.body;
    const candidateIndex = Number(candidate_index);

    if (!name || candidate_index === undefined) {
      return res.status(400).json({ message: "name, candidate_index 필수" });
    }

    if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex > 4) {
      return res.status(400).json({
        message: "candidate_index는 tally.circom 기준 0~4 중 하나여야 합니다.",
      });
    }

    const election = await getElectionById(electionId);
    if (!election) return res.status(404).json({ message: "선거 없음" });

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "pending 상태에서만 후보 수정 가능" });
    }

    const [dup] = await db.query(
      `SELECT id FROM candidates WHERE election_id=? AND candidate_index=?`,
      [electionId, candidateIndex]
    );

    if (dup.length > 0) {
      return res.status(400).json({ message: "candidate_index 중복" });
    }

    const [result] = await db.query(
      `INSERT INTO candidates (election_id, name, description, candidate_index)
       VALUES (?, ?, ?, ?)`,
      [electionId, name, description || null, candidateIndex]
    );

    res.json({ message: "후보 등록 완료", candidate_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  9-1) 후보 일괄 교체 (pending 상태만 가능)
  PUT /elections/:id/candidates/bulk
=====================================================
*/
router.put("/:id/candidates/bulk", auth, adminOnly, async (req, res) => {
  const electionId = req.params.id;
  const { candidates } = req.body;

  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 5) {
    return res.status(400).json({ message: "candidates는 1~5개 배열이어야 합니다." });
  }

  const seenIndexes = new Set();
  for (const candidate of candidates) {
    const candidateIndex = Number(candidate.candidate_index);

    if (!candidate.name || candidate.candidate_index === undefined) {
      return res.status(400).json({ message: "name, candidate_index 필수" });
    }

    if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex > 4) {
      return res.status(400).json({
        message: "candidate_index는 tally.circom 기준 0~4 중 하나여야 합니다.",
      });
    }

    if (seenIndexes.has(candidateIndex)) {
      return res.status(400).json({ message: "candidate_index 중복" });
    }

    seenIndexes.add(candidateIndex);
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [electionRows] = await conn.query(
      `SELECT ${ELECTION_PUBLIC_COLUMNS} FROM elections WHERE id=? FOR UPDATE`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    if (electionRows[0].status !== ELECTION_STATUS.PENDING) {
      await conn.rollback();
      return res.status(400).json({ message: "pending 상태에서만 후보 수정 가능" });
    }

    await conn.query(`DELETE FROM candidates WHERE election_id=?`, [electionId]);

    for (const candidate of candidates) {
      await conn.query(
        `INSERT INTO candidates (election_id, name, description, candidate_index)
         VALUES (?, ?, ?, ?)`,
        [
          electionId,
          candidate.name,
          candidate.description || null,
          Number(candidate.candidate_index),
        ]
      );
    }

    await conn.commit();
    res.json({ message: "후보 일괄 교체 완료", count: candidates.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "후보 일괄 교체 실패", error: err.message });
  } finally {
    conn.release();
  }
});

/*
=====================================================
  10) 후보 목록 조회
  GET /elections/:id/candidates
=====================================================
*/
router.get("/:id/candidates", async (req, res) => {
  try {
    const electionId = req.params.id;

    const [rows] = await db.query(
      `SELECT id, election_id, name, description, candidate_index, created_at
       FROM candidates
       WHERE election_id=?
       ORDER BY candidate_index ASC`,
      [electionId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  11) 후보 삭제 (pending 상태만 가능)
  DELETE /elections/:id/candidates/:candidateId
=====================================================
*/
router.delete("/:id/candidates/:candidateId", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;
    const candidateId = req.params.candidateId;

    const election = await getElectionById(electionId);
    if (!election) return res.status(404).json({ message: "선거 없음" });

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "pending 상태에서만 후보 삭제 가능" });
    }

    const [result] = await db.query(
      `DELETE FROM candidates WHERE id=? AND election_id=?`,
      [candidateId, electionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "삭제할 후보 없음" });
    }

    res.json({ message: "후보 삭제 완료" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  12) 유권자 등록 (트랜잭션 적용)
  POST /elections/:id/voters
=====================================================
*/
router.post("/:id/voters", auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const electionId = req.params.id;
    const { email, wallet_address, student_id } = req.body;

    if (!email) {
      await conn.rollback();
      return res.status(400).json({ message: "email 필수" });
    }

    if (!email.endsWith("@stu.jejunu.ac.kr")) {
      await conn.rollback();
      return res.status(400).json({ message: "제주대학교 학생 이메일만 등록 가능" });
    }

    const [electionRows] = await conn.query(
      `SELECT status FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    await conn.query(
      `INSERT INTO voters (election_id, email, student_id, wallet_address)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         student_id = COALESCE(VALUES(student_id), student_id),
         wallet_address = IF(
           token_issued_at IS NULL,
           COALESCE(VALUES(wallet_address), wallet_address),
           wallet_address
         )`,
      [electionId, email, student_id || null, wallet_address || null]
    );

    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS total FROM voters WHERE election_id=?`,
      [electionId]
    );

    await conn.query(
      `UPDATE elections SET total_voters=? WHERE id=?`,
      [countRows[0].total, electionId]
    );

    await conn.commit();
    res.json({ message: "유권자 등록 완료" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    conn.release();
  }
});

/*
=====================================================
  13) 학생증 인증 신청
  POST /elections/:id/verification/request
=====================================================
*/
router.post("/:id/verification/request", auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const electionId = req.params.id;
    const email = req.user.email;
    const { student_id } = req.body;

    if (!student_id) {
      await conn.rollback();
      return res.status(400).json({ message: "student_id 필수" });
    }

    const [electionRows] = await conn.query(
      `SELECT id FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    await conn.query(
      `INSERT INTO user_verifications (email, student_id, status)
       VALUES (?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         student_id = VALUES(student_id),
         status = 'pending',
         note = NULL,
         reviewed_at = NULL`,
      [email, student_id]
    );

    await conn.query(
      `INSERT INTO voters (election_id, email, student_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE student_id = VALUES(student_id)`,
      [electionId, email, student_id]
    );

    await conn.commit();
    res.json({ message: "학생증 인증 신청 완료", verification_status: "pending" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    conn.release();
  }
});

/*
=====================================================
  14) 내 유권자/학생증 인증 상태 조회
  GET /elections/:id/me
=====================================================
*/
router.get("/:id/me", auth, async (req, res) => {
  try {
    const electionId = req.params.id;
    const email = req.user.email;

    const [rows] = await db.query(
      `SELECT v.id, v.election_id, v.email,
              COALESCE(uv.student_id, v.student_id) AS student_id,
              us.wallet_address,
              COALESCE(uv.status, 'none') AS verification_status,
              uv.note AS verification_note,
              uv.reviewed_at AS verified_at,
              v.token_issued_at,
              v.has_voted,
              v.created_at
       FROM voters v
       LEFT JOIN user_verifications uv ON uv.email = v.email
       LEFT JOIN user_secrets us ON us.email = v.email
       WHERE v.election_id=? AND v.email=?`,
      [electionId, email]
    );

    if (rows.length === 0) {
      const [profileRows] = await db.query(
        `SELECT us.email, us.wallet_address,
                COALESCE(uv.status, 'none') AS verification_status,
                uv.student_id,
                uv.note AS verification_note,
                uv.reviewed_at AS verified_at
         FROM user_secrets us
         LEFT JOIN user_verifications uv ON uv.email = us.email
         WHERE us.email=?`,
        [email]
      );

      return res.json({
        registered: false,
        verification_status: profileRows[0]?.verification_status || "none",
        profile: profileRows[0] || null,
      });
    }

    res.json({ registered: true, voter: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  15) 지갑 주소 등록
  POST /elections/:id/wallet
=====================================================
*/
router.post("/:id/wallet", auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const electionId = req.params.id;
    const email = req.user.email;
    const { wallet_address } = req.body;

    if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      await conn.rollback();
      return res.status(400).json({ message: "wallet_address 형식 오류" });
    }

    const [electionRows] = await conn.query(
      `SELECT id FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    const [voterRows] = await conn.query(
      `SELECT us.wallet_address,
              EXISTS(
                SELECT 1 FROM voters
                WHERE election_id=? AND email=? AND token_issued_at IS NOT NULL
              ) AS has_token
       FROM user_secrets us
       WHERE us.email=?`,
      [electionId, email, email]
    );

    if (voterRows.length > 0 && voterRows[0].has_token) {
      await conn.rollback();
      return res.status(400).json({ message: "토큰 발급 후에는 지갑 주소를 변경할 수 없습니다." });
    }

    if (
      voterRows.length > 0 &&
      voterRows[0].wallet_address &&
      voterRows[0].wallet_address.toLowerCase() !== wallet_address.toLowerCase()
    ) {
      await conn.rollback();
      return res.status(400).json({ message: "이미 다른 지갑 주소가 등록되어 있습니다." });
    }

    const [walletResult] = await conn.query(
      `UPDATE user_secrets
       SET wallet_address = COALESCE(wallet_address, ?),
           wallet_registered_at = COALESCE(wallet_registered_at, NOW())
       WHERE email = ?`,
      [wallet_address, email]
    );

    if (walletResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "이메일 인증 후 지갑을 등록해주세요." });
    }

    await conn.query(
      `INSERT INTO voters (election_id, email)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email)`,
      [electionId, email]
    );

    await conn.query(
      `UPDATE voters
       SET wallet_address = ?
       WHERE election_id = ? AND email = ? AND token_issued_at IS NULL`,
      [wallet_address, electionId, email]
    );

    await conn.commit();
    res.json({ message: "지갑 주소 등록 완료", wallet_address });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    conn.release();
  }
});

/*
=====================================================
  16) 학생증 인증 승인/거절 (관리자)
  PATCH /elections/:id/voters/:voterId/verification
=====================================================
*/
router.patch("/:id/voters/:voterId/verification", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;
    const voterId = req.params.voterId;
    const { status, note } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status는 approved 또는 rejected만 가능" });
    }

    const [verificationRows] = await db.query(
      `SELECT uv.file_path
       FROM user_verifications uv
       JOIN voters v ON v.email = uv.email
       WHERE v.id=? AND v.election_id=?`,
      [voterId, electionId]
    );

    if (verificationRows.length === 0) {
      return res.status(404).json({ message: "유권자 또는 인증 신청 없음" });
    }

    const [result] = await db.query(
      `UPDATE user_verifications uv
       JOIN voters v ON v.email = uv.email
       SET uv.status=?,
           uv.note=?,
           uv.file_path=NULL,
           uv.reviewed_at=NOW()
       WHERE v.id=? AND v.election_id=?`,
      [status, note || null, voterId, electionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "유권자 없음" });
    }

    removeUploadedFile(verificationRows[0].file_path);

    res.json({ message: "학생증 인증 상태 변경 완료", verification_status: status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  17) 유권자 목록 조회
  GET /elections/:id/voters
=====================================================
*/
router.get("/:id/voters", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const [rows] = await db.query(
      `SELECT v.id, v.election_id, v.email,
              COALESCE(uv.student_id, v.student_id) AS student_id,
              us.wallet_address,
              v.voter_public_key,
              COALESCE(uv.status, 'none') AS verification_status,
              uv.note AS verification_note,
              uv.reviewed_at AS verified_at,
              v.token_issued_at,
              v.has_voted,
              v.created_at
       FROM voters v
       LEFT JOIN user_verifications uv ON uv.email = v.email
       LEFT JOIN user_secrets us ON us.email = v.email
       WHERE v.election_id=?
       ORDER BY created_at DESC`,
      [electionId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  (추가) 결과 조회 API
  GET /elections/:id/result
  - 개표 완료(tallied)된 선거 결과 조회
  - 후보별 득표수 + 득표율 + 당선자 반환
=====================================================
*/
router.get("/:id/result", async (req, res) => {
  try {
    const electionId = req.params.id;

    // 1) 선거 상태 확인
    const [electionRows] = await db.query(
      `SELECT id, title, status FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      return res.status(404).json({ message: "선거 없음" });
    }

    const election = electionRows[0];

    if (election.status !== ELECTION_STATUS.TALLIED) {
      return res.status(400).json({
        message: "개표 완료된 선거(tallied)만 결과 조회 가능",
        status: election.status,
      });
    }

    // 2) tally_results + candidates 조인해서 득표수 가져오기
    const [rows] = await db.query(
      `SELECT tr.candidate_id, tr.vote_count,
              c.name AS candidate_name,
              c.candidate_index
       FROM tally_results tr
       JOIN candidates c ON tr.candidate_id = c.id
       WHERE tr.election_id=?
       ORDER BY c.candidate_index ASC`,
      [electionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "개표 결과 없음" });
    }

    // 3) 총 투표수 계산
    const totalVotes = rows.reduce((sum, r) => sum + r.vote_count, 0);

    // 4) 득표율 계산
    const results = rows.map((r) => {
      const percentage =
        totalVotes === 0 ? 0 : Number(((r.vote_count / totalVotes) * 100).toFixed(2));

      return {
        candidate_id: r.candidate_id,
        candidate_index: r.candidate_index,
        name: r.candidate_name,
        vote_count: r.vote_count,
        percentage,
      };
    });

    // 5) 당선자 선정 (최다 득표)
    let winner = results[0];
    for (const r of results) {
      if (r.vote_count > winner.vote_count) {
        winner = r;
      }
    }

    // 6) 응답
    res.json({
      electionId: election.id,
      title: election.title,
      status: election.status,
      totalVotes,
      winner,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

/*
=====================================================
  GET /elections/:id/my-eligibility
  - 자격 확인 + 토큰 없으면 lazy 발급
  - 응답: { eligible: true } | { eligible: false, reason: string }
=====================================================
*/
router.get("/:id/my-eligibility", auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const electionId = req.params.id;
    const email = req.user.email;

    // 1. 선거 존재 + active 확인
    const [electionRows] = await conn.query(
      `SELECT id, status, contract_address, token_contract_address
       FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      return res.status(404).json({ eligible: false, reason: "election_not_found" });
    }

    const election = electionRows[0];

    if (election.status !== ELECTION_STATUS.ACTIVE) {
      return res.json({ eligible: false, reason: "election_not_active" });
    }

    // 2. election_student_list에서 명단 확인 (학번 기준)
    const [listRows] = await conn.query(
      `SELECT esl.student_id
      FROM election_student_list esl
      JOIN user_verifications uv ON uv.student_id = esl.student_id
      WHERE esl.election_id = ? AND uv.email = ?`,
      [electionId, email]
    );

    if (listRows.length === 0) {
      return res.json({ eligible: false, reason: "not_in_voter_list" });
    }

    // 3. voters에서 인증+지갑+투표 상태 확인
    const [voterRows] = await conn.query(
      `SELECT v.id, v.token_issued_at, v.has_voted,
              us.wallet_address,
              COALESCE(uv.status, 'none') AS verification_status
       FROM user_verifications uv
       LEFT JOIN user_secrets us ON us.email = uv.email
       LEFT JOIN voters v ON v.email = uv.email AND v.election_id = ?
       WHERE uv.email = ?`,
      [electionId, email]
    );

    // voters에 아직 행이 없으면 (미로그인 상태에서 명단만 등록된 케이스) — wallet 없음으로 처리
    let voter = voterRows[0] || null;

    // 재학 인증 미완료
    if (!voter || voter.verification_status !== "approved") {
      return res.json({ eligible: false, reason: "not_verified" });
    }

    // 지갑 미등록
    if (!voter.wallet_address) {
      return res.json({ eligible: false, reason: "wallet_not_registered" });
    }

    if (!voter.id) {
      await conn.query(
        `INSERT INTO voters (election_id, email, student_id, wallet_address, verification_status, verified_at)
         VALUES (?, ?, ?, ?, 'approved', NOW())
         ON DUPLICATE KEY UPDATE
           student_id = VALUES(student_id),
           wallet_address = COALESCE(VALUES(wallet_address), wallet_address),
           verification_status = 'approved',
           verified_at = COALESCE(verified_at, NOW())`,
        [electionId, email, listRows[0].student_id, voter.wallet_address]
      );

      const [createdRows] = await conn.query(
        `SELECT id, token_issued_at, has_voted, ? AS wallet_address, 'approved' AS verification_status
         FROM voters
         WHERE election_id = ? AND email = ?`,
        [voter.wallet_address, electionId, email]
      );
      voter = createdRows[0];
    }

    // 이미 투표함
    if (voter.has_voted) {
      return res.json({ eligible: false, reason: "already_voted" });
    }

    // 토큰 이미 있으면 바로 통과 (단, 가스 부족 시 보충 — castVote 가스 보장)
    if (voter.token_issued_at) {
      const { fundVoterGas } = require("../blockchain/votingContract");
      await fundVoterGas([voter.wallet_address]);
      return res.json({ eligible: true });
    }
    
    // 4. 토큰 없으면 lazy 발급
    if (!election.token_contract_address) {
      return res.json({ eligible: false, reason: "token_contract_not_set" });
    }

    const { ethers } = require("ethers");

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const adminWallet = new ethers.Wallet(process.env.ADMIN_WALLET_PRIVATE_KEY, provider);
    const tokenContract = new ethers.Contract(
      election.token_contract_address,
      VOTING_TOKEN_ABI,
      adminWallet
    );

    const tx = await tokenContract.issueTokenBatch([voter.wallet_address]);
    await tx.wait();

    await conn.query(
      `UPDATE voters SET token_issued_at=NOW() WHERE election_id=? AND email=?`,
      [electionId, email]
    );

    // 토큰 발급과 함께 가스(ETH)도 발급
    const { fundVoterGas } = require("../blockchain/votingContract");
    await fundVoterGas([voter.wallet_address]);

    return res.json({ eligible: true });

  } catch (err) {
    console.error("my-eligibility 오류:", err);
    res.status(500).json({ eligible: false, reason: "server_error" });
  } finally {
    conn.release();
  }
});

/*
=====================================================
  POST /elections/:id/deploy
  - ElectionFactory.createElection 호출
  - 반환된 주소 DB 자동 등록
=====================================================
*/
router.post("/:id/deploy", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const election = await getElectionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "선거 없음" });
    }

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "pending 상태에서만 배포 가능" });
    }

    if (election.contract_address || election.token_contract_address) {
      return res.status(400).json({ message: "이미 컨트랙트가 배포된 선거입니다." });
    }

    const { ethers } = require("ethers");

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const adminWallet = new ethers.Wallet(process.env.ADMIN_WALLET_PRIVATE_KEY, provider);
    const factory = new ethers.Contract(
      process.env.FACTORY_ADDRESS,
      ELECTION_FACTORY_ABI,
      adminWallet
    );

    const tx = await factory.createElection(electionId, adminWallet.address);
    const receipt = await tx.wait();

    // ElectionCreated 이벤트에서 주소 파싱
    const iface = new ethers.Interface(ELECTION_FACTORY_ABI);
    let votingSystemAddress, votingTokenAddress;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "ElectionCreated") {
          votingSystemAddress = parsed.args.votingSystem;
          votingTokenAddress = parsed.args.votingToken;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!votingSystemAddress || !votingTokenAddress) {
      return res.status(500).json({ message: "컨트랙트 주소 파싱 실패" });
    }

    await db.query(
      `UPDATE elections
       SET contract_address=?, token_contract_address=?
       WHERE id=?`,
      [votingSystemAddress, votingTokenAddress, electionId]
    );

    res.json({
      message: "컨트랙트 배포 완료",
      contract_address: votingSystemAddress,
      token_contract_address: votingTokenAddress,
      txHash: receipt.hash,
    });
  } catch (err) {
    console.error("deploy 오류:", err);
    res.status(500).json({ message: "서버 오류", error: err.message });
  }
});

/*
=====================================================
  POST /elections/:id/voters/bulk
  - 학번 명단 업로드 + 즉시 토큰 발급 (가입+인증 완료자만)
  - 미가입자는 election_student_list에만 저장 → my-eligibility에서 lazy 발급
=====================================================
*/
router.post("/:id/voters/bulk", auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const electionId = req.params.id;
    const { student_ids } = req.body;

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ message: "학번 목록이 필요합니다." });
    }

    const election = await getElectionById(electionId);
    if (!election) return res.status(404).json({ message: "선거 없음" });
    if (!["pending", "active"].includes(election.status)) {
      return res.status(400).json({ message: "pending 또는 active 상태에서만 명단 등록 가능" });
    }

    await conn.beginTransaction();

    // 1. election_student_list에 upsert
    for (const studentId of student_ids) {
      await conn.query(
        `INSERT IGNORE INTO election_student_list (election_id, student_id)
         VALUES (?, ?)`,
        [electionId, studentId]
      );
    }

    // 2. total_voters 갱신
    await conn.query(
      `UPDATE elections SET total_voters = (
         SELECT COUNT(*) FROM election_student_list WHERE election_id = ?
       ) WHERE id = ?`,
      [electionId, electionId]
    );

    // 3. 이미 가입+인증+지갑 있는 학번 선별 → 즉시 토큰 발급
    const [eligible] = await conn.query(
      `SELECT uv.email, esl.student_id, us.wallet_address, v.id AS voter_id
       FROM election_student_list esl
       JOIN user_verifications uv ON uv.student_id = esl.student_id
       JOIN user_secrets us ON us.email = uv.email
       LEFT JOIN voters v ON v.email = uv.email AND v.election_id = esl.election_id
       WHERE esl.election_id = ?
         AND esl.student_id IN (?)
         AND uv.status = 'approved'
         AND us.wallet_address IS NOT NULL
         AND (v.token_issued_at IS NULL OR v.id IS NULL)`,
      [electionId, student_ids]
    );

    let txHash = null;
    let issuedCount = 0;

    if (eligible.length > 0 && election.token_contract_address) {
      const { ethers } = require("ethers");

      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const adminWallet = new ethers.Wallet(process.env.ADMIN_WALLET_PRIVATE_KEY, provider);
      const tokenContract = new ethers.Contract(
        election.token_contract_address,
        VOTING_TOKEN_ABI,
        adminWallet
      );

      const walletAddresses = eligible.map(e => e.wallet_address);
      const tx = await tokenContract.issueTokenBatch(walletAddresses);
      await tx.wait();
      txHash = tx.hash;
      issuedCount = eligible.length;

      // 토큰 발급과 함께 가스(ETH)도 발급 — castVote는 투표자 지갑이 직접 가스 지불
      const { fundVoterGas } = require("../blockchain/votingContract");
      await fundVoterGas(walletAddresses);

      for (const voter of eligible) {
        await conn.query(
          `INSERT INTO voters (
             election_id, email, student_id, wallet_address,
             verification_status, verified_at, token_issued_at
           )
           VALUES (?, ?, ?, ?, 'approved', NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             student_id = VALUES(student_id),
             wallet_address = COALESCE(VALUES(wallet_address), wallet_address),
             verification_status = 'approved',
             verified_at = COALESCE(verified_at, NOW()),
             token_issued_at = COALESCE(token_issued_at, NOW())`,
          [electionId, voter.email, voter.student_id, voter.wallet_address]
        );
      }
    }

    await conn.commit();

    res.json({
      message: "명단 등록 완료",
      total: student_ids.length,
      issued: issuedCount,
      pending: student_ids.length - issuedCount,
      txHash,
    });
  } catch (err) {
    await conn.rollback();
    console.error("voters/bulk 오류:", err);
    res.status(500).json({ message: "서버 오류", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
