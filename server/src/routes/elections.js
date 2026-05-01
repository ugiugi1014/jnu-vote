const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");

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
  coord_public_key, contract_address,
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

    const [result] = await db.query(
      `INSERT INTO elections (title, description, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [title, description || null, start_time, end_time]
    );

    res.json({ message: "선거 생성 완료", election_id: result.insertId });
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

    const [result] = await db.query(
      `UPDATE elections
       SET status=?
       WHERE id=? AND status=?`,
      [ELECTION_STATUS.ACTIVE, electionId, ELECTION_STATUS.PENDING]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "선거 시작 실패 (pending 상태만 가능)" });
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

    const [result] = await db.query(
      `UPDATE elections
       SET status=?
       WHERE id=? AND status=?`,
      [ELECTION_STATUS.CLOSED, electionId, ELECTION_STATUS.ACTIVE]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "선거 종료 실패 (active 상태만 가능)" });
    }

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
    const { contract_address } = req.body;

    if (!contract_address) {
      return res.status(400).json({ message: "contract_address 필수" });
    }

    await db.query(
      `UPDATE elections SET contract_address=? WHERE id=?`,
      [contract_address, electionId]
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

    if (!name || candidate_index === undefined) {
      return res.status(400).json({ message: "name, candidate_index 필수" });
    }

    const election = await getElectionById(electionId);
    if (!election) return res.status(404).json({ message: "선거 없음" });

    if (election.status !== ELECTION_STATUS.PENDING) {
      return res.status(400).json({ message: "pending 상태에서만 후보 수정 가능" });
    }

    const [dup] = await db.query(
      `SELECT id FROM candidates WHERE election_id=? AND candidate_index=?`,
      [electionId, candidate_index]
    );

    if (dup.length > 0) {
      return res.status(400).json({ message: "candidate_index 중복" });
    }

    const [result] = await db.query(
      `INSERT INTO candidates (election_id, name, description, candidate_index)
       VALUES (?, ?, ?, ?)`,
      [electionId, name, description || null, candidate_index]
    );

    res.json({ message: "후보 등록 완료", candidate_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
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
    const { email, wallet_address } = req.body;

    if (!email) {
      await conn.rollback();
      return res.status(400).json({ message: "email 필수" });
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
      `INSERT INTO voters (election_id, email, wallet_address)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE wallet_address = VALUES(wallet_address)`,
      [electionId, email, wallet_address || null]
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
  13) 유권자 목록 조회
  GET /elections/:id/voters
=====================================================
*/
router.get("/:id/voters", auth, adminOnly, async (req, res) => {
  try {
    const electionId = req.params.id;

    const [rows] = await db.query(
      `SELECT id, election_id, email, wallet_address, voter_public_key, has_voted, created_at
       FROM voters
       WHERE election_id=?
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
  14) 개표 결과 저장 (트랜잭션 적용)
  POST /elections/:id/tally
=====================================================
body:
{
  "results": [
    { "candidate_id": 1, "vote_count": 10 },
    { "candidate_id": 2, "vote_count": 5 }
  ]
}
*/
router.post("/:id/tally", auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const electionId = req.params.id;
    const { results } = req.body;

    if (!Array.isArray(results) || results.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "results 배열이 비어있음" });
    }

    const [electionRows] = await conn.query(
      `SELECT status FROM elections WHERE id=?`,
      [electionId]
    );

    if (electionRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "선거 없음" });
    }

    if (electionRows[0].status !== ELECTION_STATUS.CLOSED) {
      await conn.rollback();
      return res.status(400).json({ message: "closed 상태에서만 개표 저장 가능" });
    }

    // 후보 검증
    const [candidateRows] = await conn.query(
      `SELECT id FROM candidates WHERE election_id=?`,
      [electionId]
    );
    const validCandidateIds = new Set(candidateRows.map((c) => c.id));

    for (const r of results) {
      if (!validCandidateIds.has(r.candidate_id)) {
        await conn.rollback();
        return res.status(400).json({
          message: `잘못된 candidate_id 포함: ${r.candidate_id}`,
        });
      }
      if (typeof r.vote_count !== "number" || r.vote_count < 0) {
        await conn.rollback();
        return res.status(400).json({
          message: `vote_count 값 오류: ${r.vote_count}`,
        });
      }
    }

    // 기존 결과 삭제
    await conn.query(`DELETE FROM tally_results WHERE election_id=?`, [electionId]);

    // 결과 저장
    for (const r of results) {
      await conn.query(
        `INSERT INTO tally_results (election_id, candidate_id, vote_count)
         VALUES (?, ?, ?)`,
        [electionId, r.candidate_id, r.vote_count]
      );
    }

    // 선거 상태 tallied로 변경
    await conn.query(
      `UPDATE elections SET status=? WHERE id=?`,
      [ELECTION_STATUS.TALLIED, electionId]
    );

    await conn.commit();
    res.json({ message: "개표 결과 저장 완료 + tallied 처리 완료" });
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
  15) 개표 결과 조회
  GET /elections/:id/tally
=====================================================
*/
router.get("/:id/tally", async (req, res) => {
  try {
    const electionId = req.params.id;

    const [rows] = await db.query(
      `SELECT tr.id, tr.election_id, tr.candidate_id, tr.vote_count, tr.created_at,
              c.name AS candidate_name, c.candidate_index
       FROM tally_results tr
       JOIN candidates c ON tr.candidate_id = c.id
       WHERE tr.election_id=?
       ORDER BY c.candidate_index ASC`,
      [electionId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
