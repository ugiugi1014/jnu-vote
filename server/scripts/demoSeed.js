// 데모 데이터 넣기 (DEMO_MODE 전용). 서버가 뜬 뒤 한 번 실행한다. 이미 있으면 건너뛴다.
//  1) 데모 학생 재학 인증을 '승인' 상태로 넣는다 (KICA 대신)
//  2) 관리자 API 로 선거 생성 → 후보 등록 → 컨트랙트 배포 → 명단 등록 → (필요하면) 시작
//     실제 관리자 화면과 같은 API 를 쓰므로 운영 흐름 그대로 체인에 기록된다.
//  3) '미리 투표한 학생'(seed_voters)이 실제 증명으로 투표 → 공격 시도(이중 투표 등)를 바로 해 볼 수 있게
//  4) tally: true 인 선거는 종료·개표까지 (개표 조작 시도용)
require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const { seedSecret, commitmentOf, castVote } = require("./demoVoter");

const API = process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 8080}`;
const accounts = JSON.parse(fs.readFileSync(process.env.DEMO_ACCOUNTS_FILE, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 서버·DB 는 한국 시간(TZ=Asia/Seoul)이라 날짜를 한국 시간 문자열로 보낸다
const fmt = (d) => {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return k.toISOString().slice(0, 19).replace("T", " ");
};

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
  const seedVoters = accounts.seed_voters || [];
  for (const s of [...accounts.students, accounts.outsider, ...seedVoters]) {
    const docNo = ("DEMO" + s.student_id).padEnd(16, "0").slice(0, 16);
    await db.query(
      `INSERT INTO user_verifications (email, student_id, doc_no, status, note, reviewed_at)
       VALUES (?, ?, ?, 'approved', '데모 계정', NOW())
       ON DUPLICATE KEY UPDATE status='approved', student_id=VALUES(student_id)`,
      [s.email, s.student_id, docNo]
    );
  }

  // 미리 투표할 학생은 로그인하지 않으므로 지갑 주소만 임의로 넣어 둔다 (투표는 relay 라 지갑을 쓰지 않음)
  for (const s of seedVoters) {
    const w = ethers.Wallet.createRandom();
    await db.query(
      `INSERT INTO user_secrets (email, secret, wallet_address, wallet_registered_at) VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE email=email`,
      [s.email, crypto.randomBytes(32).toString("hex"), w.address]
    );
  }

  // 2) 선거
  const sign = (email, role) => jwt.sign({ email, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const token = sign(accounts.admin.email, "admin");
  const api = async (method, path, body, asToken = token) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${asToken}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path} 실패 (${r.status}): ${data.message || ""} ${data.error || ""}`);
    return data;
  };

  // 전시 모드: demo/exhibition.json 의 투표만 만든다 (시작은 서버가 시각에 맞춰 자동, 명단은 관람객이 로그인할 때 자동)
  if (process.env.EXHIBITION_MODE === "1") {
    const file = process.env.EXHIBITION_FILE || "/repo/demo/exhibition.json";
    const { polls } = JSON.parse(require("fs").readFileSync(file, "utf8"));
    const [ex] = await db.query(`SELECT title FROM elections`);
    const have = new Set(ex.map((r) => r.title));
    for (const p of polls) {
      if (have.has(p.title)) {
        console.log(`[seed] 이미 있음: ${p.title}`);
        continue;
      }
      const created = await api("POST", "/elections", { title: p.title, description: p.description, start_time: p.start, end_time: p.end });
      const id = created.election_id;
      await api("PUT", `/elections/${id}/candidates/bulk`, {
        candidates: p.candidates.map((c, i) => ({ ...c, candidate_index: i })),
      });
      await api("POST", `/elections/${id}/deploy`);
      console.log(`[seed] 전시 투표 ${p.title} (${p.start} ~ ${p.end})`);
    }
    console.log("[seed] 전시 투표 준비 끝. 이어서 공격 시도용 숨은 선거를 준비합니다 (투표 목록에는 안 보임)");
  }

  const [rows] = await db.query(`SELECT id, title, status, contract_address FROM elections`);
  const existing = new Map(rows.map((r) => [r.title, r]));
  const studentIds = [...accounts.students, ...seedVoters].map((s) => s.student_id);
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

  // 선거가 이미 있어도(이전 버전으로 시작한 경우 등) 빠진 미리 투표·개표를 채운다.
  // 미리 투표한 학생의 투표권은 (이메일, 선거 주소)로 매번 같게 만들어서, 다시 실행해도 이어서 할 수 있다.
  for (const e of accounts.elections) {
    let el = existing.get(e.title);
    if (!el) {
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
      el = { id, title: e.title, status: e.start ? "active" : "pending", contract_address: dep.contract_address };
      console.log(`[seed] ${e.title} → #${id} ${dep.contract_address} ${e.start ? "(진행 중)" : "(예정)"}`);
    } else {
      console.log(`[seed] 이미 있음: ${e.title} (${el.status})`);
      // 이전 버전 명단에는 미리 투표할 학생이 없을 수 있다 (이미 있는 학번은 서버가 건너뜀)
      if (el.status === "pending" || el.status === "active") {
        await api("POST", `/elections/${el.id}/voters/bulk`, { student_ids: studentIds }).catch(() => {});
      }
    }

    // 3) 미리 투표: 등록을 먼저 모두 끝내고(명단 root 고정) 투표한다
    const votes = e.seed_votes || [];
    if (votes.length && el.status === "active") {
      const election = { id: el.id, contract_address: el.contract_address };
      const secrets = [];
      for (let i = 0; i < votes.length; i++) {
        const v = seedVoters[i];
        const secret = await seedSecret(`${v.email}|${process.env.JWT_SECRET}`, el.contract_address);
        const r = await fetch(`${API}/elections/${el.id}/register-commitment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sign(v.email, "user")}` },
          body: JSON.stringify({ commitment: (await commitmentOf(secret)).toString() }),
        });
        if (!r.ok && r.status !== 409) throw new Error(`투표권 등록 실패 (${v.label}): ${r.status}`);
        secrets.push(secret);
      }
      for (let i = 0; i < votes.length; i++) {
        const t0 = Date.now();
        const r = await castVote({ api: API, provider, election, secret: secrets[i], candidateId: votes[i] });
        const already = JSON.stringify(r.data).match(/already|duplicate/i);
        if (r.status !== 200 && !already) throw new Error(`미리 투표 실패 (${seedVoters[i].label}): ${JSON.stringify(r.data)}`);
        console.log(`[seed]   ${seedVoters[i].label} ${already ? "이미 투표함" : `투표 완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`}`);
      }
    }

    // 4) 종료·개표
    if (e.tally && el.status !== "tallied") {
      if (el.status === "active") await api("POST", `/elections/${el.id}/close`);
      const t0 = Date.now();
      await api("POST", `/elections/${el.id}/tally`);
      console.log(`[seed]   종료·개표 완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
  }
  await db.end?.();
  console.log("[seed] 완료");
  process.exit(0); // 증명 생성 워커·체인 연결이 남아 있어 직접 끝낸다 (start 스크립트가 seed 종료를 기다림)
}

main().catch((err) => {
  console.error("[seed] 실패:", err.message);
  process.exit(1);
});
