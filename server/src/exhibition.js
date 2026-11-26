// 전시 모드 (DEMO_MODE=1 + EXHIBITION_MODE=1): 관람객이 아무 이메일로 로그인해 전시용 투표(demo/exhibition.json)에 참여한다.
//  - 로그인하면 자동으로 재학 인증 완료 + 열려 있는(또는 열릴) 모든 선거의 명단에 추가
//  - 운영자(ADMIN_EMAILS)는 자동 입력 코드 대신 EXHIBITION_ADMIN_CODE 를 직접 넣어야 로그인
//  - 시작 시각이 된 선거는 자동으로 시작 (마감·개표는 기존 electionScheduler 가 end_time 에 처리)
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { DEMO_MODE, loadDemoAccounts } = require("./demo");

const EXHIBITION_MODE = DEMO_MODE && process.env.EXHIBITION_MODE === "1";

// 관람객 학번: 이메일에서 만든 가짜 학번 (V + 9자리). 같은 이메일이면 같은 학번
function visitorStudentId(email) {
  const n = BigInt("0x" + crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex")) % 1_000_000_000n;
  return `V${n.toString().padStart(9, "0")}`;
}

async function enrollVisitor(email) {
  const sid = visitorStudentId(email);
  await db.query(
    `INSERT INTO user_verifications (email, student_id, status, note, reviewed_at)
     VALUES (?, ?, 'approved', '전시 관람객 (자동 승인)', NOW())
     ON DUPLICATE KEY UPDATE status = 'approved'`,
    [email, sid]
  );
  await db.query(
    `INSERT IGNORE INTO election_student_list (election_id, student_id)
     SELECT id, ? FROM elections WHERE status IN ('pending', 'active') AND NOT (title IN (?))`,
    [sid, (loadDemoAccounts()?.elections || []).map((e) => e.title).concat("")]
  );
}

// 시작 시각이 지난 pending 선거를 시작한다. 시작 로직(체인에 키 고정 + open)은 관리자 API 를 그대로 쓴다.
async function startDueElections() {
  const [rows] = await db.query(
    `SELECT id, title FROM elections
     WHERE status = 'pending' AND contract_address IS NOT NULL AND start_time <= NOW() AND end_time > NOW()`
  );
  if (!rows.length) return;
  const admin = (process.env.ADMIN_EMAILS || "").split(",")[0].trim();
  const token = jwt.sign({ email: admin, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });
  for (const e of rows) {
    if (isHiddenElection(e.title)) continue; // 숨은 데모 선거는 시드가 직접 시작한다
    const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/elections/${e.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => ({ ok: false, status: err.message }));
    console.log(`[exhibition] 자동 시작 ${e.title}: ${r.ok ? "완료" : `실패 (${r.status})`}`);
  }
}

let timer = null;
function startExhibitionScheduler() {
  if (!EXHIBITION_MODE || timer) return;
  if (!process.env.EXHIBITION_ADMIN_CODE) {
    console.warn("[exhibition] EXHIBITION_ADMIN_CODE 가 없어 운영자 로그인이 막혀 있습니다 (demo/.env 에 설정).");
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await startDueElections();
    } catch (err) {
      console.error("[exhibition] 자동 시작 오류:", err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 3000);
  timer = setInterval(tick, 20_000);
  console.log("[exhibition] 전시 모드: 아무 이메일 로그인, 선거 자동 시작");
}

// 공격 시도용으로 미리 만들어 두는 데모 선거 (accounts.json 의 elections) — 전시 모드 투표 목록에서는 숨긴다
function isHiddenElection(title) {
  const a = loadDemoAccounts();
  return !!a?.elections?.some((e) => e.title === title);
}

module.exports = { EXHIBITION_MODE, visitorStudentId, enrollVisitor, startExhibitionScheduler, isHiddenElection };
