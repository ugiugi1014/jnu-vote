// 데모 데이터 넣기 (DEMO_MODE 전용). 서버가 뜬 뒤 한 번 실행한다. 이미 있으면 건너뛴다.
//  1) 데모 학생 재학 인증을 '승인' 상태로 넣는다 (KICA 대신)
//  2) 관리자 API 로 선거 생성 → 후보 등록 → 컨트랙트 배포 → 명단 등록 → (필요하면) 시작
//     실제 관리자 화면과 같은 API 를 쓰므로 운영 흐름 그대로 체인에 기록된다.
require("dotenv").config();
const fs = require("fs");
const jwt = require("jsonwebtoken");

const API = process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 8080}`;
const accounts = JSON.parse(fs.readFileSync(process.env.DEMO_ACCOUNTS_FILE, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch (_) { /* 아직 안 뜸 */ }
    await sleep(1000);
  }
  throw new Error(`서버가 응답하지 않습니다: ${API}`);
}

async function main() {
  if (process.env.DEMO_MODE !== "1") throw new Error("DEMO_MODE=1 에서만 실행합니다.");
  await waitForServer();
  const db = require("../src/db");

  // 1) 재학 인증 승인 (명단 밖 학생도 인증은 돼 있어야 "명단에 없음" 거절을 볼 수 있다)
  for (const s of [...accounts.students, accounts.outsider]) {
    const docNo = ("DEMO" + s.student_id).padEnd(16, "0").slice(0, 16);
    await db.query(
      `INSERT INTO user_verifications (email, student_id, doc_no, status, note, reviewed_at)
       VALUES (?, ?, ?, 'approved', '데모 계정', NOW())
       ON DUPLICATE KEY UPDATE status='approved', student_id=VALUES(student_id)`,
      [s.email, s.student_id, docNo]
    );
  }

  // 2) 선거
  const token = jwt.sign({ email: accounts.admin.email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const api = async (method, path, body) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path} 실패 (${r.status}): ${data.message || ""} ${data.error || ""}`);
    return data;
  };

  const [rows] = await db.query(`SELECT title FROM elections`);
  const existing = new Set(rows.map((r) => r.title));
  const studentIds = accounts.students.map((s) => s.student_id);

  for (const e of accounts.elections) {
    if (existing.has(e.title)) {
      console.log(`[seed] 이미 있음: ${e.title}`);
      continue;
    }
    const now = Date.now();
    const created = await api("POST", "/elections", {
      title: e.title,
      description: e.description,
      start_time: fmt(new Date(now - 60_000)),
      end_time: fmt(new Date(now + 7 * 24 * 3600_000)), // 심사 중 자동 종료되지 않게 넉넉히
    });
    const id = created.election_id;
    await api("PUT", `/elections/${id}/candidates/bulk`, {
      candidates: e.candidates.map((c, i) => ({ ...c, candidate_index: i })),
    });
    const dep = await api("POST", `/elections/${id}/deploy`);
    await api("POST", `/elections/${id}/voters/bulk`, { student_ids: studentIds });
    if (e.start) await api("POST", `/elections/${id}/start`);
    console.log(`[seed] ${e.title} → #${id} ${dep.contract_address} ${e.start ? "(진행 중)" : "(예정)"}`);
  }
  await db.end?.();
  console.log("[seed] 완료");
}

main().catch((err) => {
  console.error("[seed] 실패:", err.message);
  process.exit(1);
});
