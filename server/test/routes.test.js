// 라우트 테스트: DB·체인을 메모리 가짜로 바꿔서 등록/교체/relay 흐름을 확인한다.
process.env.RELAY_RATE_MAX = "5"; // 라우트 모듈을 불러오기 전에 설정 (모듈 로드 시 읽음)
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { ethers } = require("ethers");
const { buildMerklePath } = require("../src/services/voterTree");

const src = (p) => path.join(__dirname, "..", "src", p);
const mock = (p, exportsObj) => {
  const file = require.resolve(src(p));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsObj };
};

// ── 가짜 체인 (VotingSystem 일부) ──
const iface = new ethers.Interface([
  "event VoterRegistered(uint256 indexed leafIndex, uint256 commitment, uint256 root)",
]);
const chain = { commitments: [], root: 0n, votes: 0, calls: [] };
async function recomputeRoot() {
  if (chain.commitments.length === 0) return 0n;
  return (await buildMerklePath(chain.commitments, 0)).root;
}
const fakeContract = {
  interface: iface,
  async registerVoter(c) {
    chain.calls.push(["registerVoter", c]);
    const index = chain.commitments.length;
    chain.commitments.push(BigInt(c));
    chain.root = await recomputeRoot();
    const log = iface.encodeEventLog("VoterRegistered", [index, c, chain.root]);
    return { hash: "0xreg", wait: async () => ({ status: 1, logs: [log] }) };
  },
  async replaceVoter(leafIndex, oldC, newC, siblings) {
    chain.calls.push(["replaceVoter", leafIndex, oldC, newC]);
    if (chain.votes > 0) throw new Error("votes already cast");
    if (chain.commitments[Number(leafIndex)] !== BigInt(oldC)) throw new Error("old commitment mismatch");
    const expect = (await buildMerklePath(chain.commitments, Number(leafIndex))).siblings;
    assert.deepStrictEqual(siblings.map(BigInt), expect, "siblings 가 체인 트리와 같아야 한다");
    chain.commitments[Number(leafIndex)] = BigInt(newC);
    chain.root = await recomputeRoot();
    return { hash: "0xrep", wait: async () => ({ status: 1, logs: [] }) };
  },
  async getCommitments() { return [...chain.commitments]; },
  castVote: Object.assign(async () => ({ hash: "0xvote", wait: async () => ({ status: 1, hash: "0xvote" }) }), {
    staticCall: async () => true,
  }),
};
mock("blockchain/votingContract.js", { getVotingContract: () => fakeContract, closeElectionOnChain: async () => ({}) });
mock("services/electionScheduler.js", { scheduleElectionClose() {}, clearElectionSchedule() {}, restoreElectionSchedules: async () => {} });
mock("middleware/auth.js", (req, res, next) => { req.user = { email: "s1@stu.jejunu.ac.kr", role: "user" }; next(); });

// ── 가짜 DB ──
const state = {
  election: { id: 1, status: "pending", contract_address: "0x0000000000000000000000000000000000000001" },
  voter: { id: 7, commitment_registered_at: null, commitment_leaf_index: null },
};
function query(sql, params = []) {
  const s = sql.replace(/\s+/g, " ").trim();
  if (s.startsWith("SELECT id, status, contract_address FROM elections")) return [[state.election]];
  if (s.startsWith("SELECT status, contract_address FROM elections")) return [[state.election]];
  if (s.includes("FROM election_student_list esl")) return [[{ student_id: "2022001" }]];
  if (s.startsWith("SELECT v.id, v.commitment_registered_at")) {
    return [[{ ...state.voter, wallet_address: "0xabc", verification_status: "approved" }]];
  }
  if (s.startsWith("SELECT commitment_registered_at, commitment_leaf_index FROM voters")) return [[{ ...state.voter }]];
  if (s.startsWith("UPDATE voters SET commitment_registered_at = NOW(), commitment_leaf_index = ?")) {
    state.voter.commitment_registered_at = new Date();
    state.voter.commitment_leaf_index = params[0];
    return [{ affectedRows: 1 }];
  }
  if (s.startsWith("UPDATE voters SET commitment_registered_at = NOW() WHERE id = ?")) {
    state.voter.commitment_registered_at = new Date();
    return [{ affectedRows: 1 }];
  }
  if (s.startsWith("UPDATE elections SET voted_count")) return [{ affectedRows: 1 }];
  throw new Error("예상하지 못한 SQL: " + s.slice(0, 80));
}
const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {}, query: async (...a) => query(...a) };
mock("db/index.js", { getConnection: async () => conn, query: async (...a) => query(...a) });

const express = require("express");
const app = express();
app.use(express.json());
app.use("/elections", require("../src/routes/elections"));
app.use("/elections", require("../src/routes/voter"));
app.use("/vote", require("../src/routes/vote"));

let server, base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("시작 전: 등록 → 트리 위치 저장, 두 번째 등록은 409, 교체는 성공", async () => {
  // 다른 학생 2명이 먼저 등록돼 있다고 가정
  chain.commitments.push(111n, 222n);
  let r = await fetch(base + "/elections/1/my-eligibility");
  let j = await r.json();
  assert.deepStrictEqual([j.eligible, j.registered, j.can_replace, j.status], [true, false, false, "pending"]);

  r = await post("/elections/1/register-commitment", { commitment: "333" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(state.voter.commitment_leaf_index, 2);

  r = await post("/elections/1/register-commitment", { commitment: "444" });
  assert.strictEqual(r.status, 409);

  j = await (await fetch(base + "/elections/1/my-eligibility")).json();
  assert.strictEqual(j.can_replace, true);

  r = await post("/elections/1/register-commitment", { commitment: "555", replace: true });
  assert.strictEqual(r.status, 200, await r.text());
  assert.deepStrictEqual(chain.commitments, [111n, 222n, 555n]);
});

test("시작 후에는 교체 불가 (409 replace_closed)", async () => {
  state.election.status = "active";
  const r = await post("/elections/1/register-commitment", { commitment: "666", replace: true });
  assert.strictEqual(r.status, 409);
  assert.strictEqual((await r.json()).reason, "replace_closed");
  const j = await (await fetch(base + "/elections/1/my-eligibility")).json();
  assert.strictEqual(j.can_replace, false);
});

test("미등록 상태에서 교체 요청은 409", async () => {
  state.election.status = "pending";
  state.voter = { id: 7, commitment_registered_at: null, commitment_leaf_index: null };
  const r = await post("/elections/1/register-commitment", { commitment: "777", replace: true });
  assert.strictEqual(r.status, 409);
});

test("토큰 발급 API 는 410", async () => {
  const r = await post("/elections/1/tokens/issue", {});
  assert.strictEqual(r.status, 410);
});

test("relay: 형식 오류는 400, 횟수 제한을 넘으면 429", async () => {
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await post("/vote/relay", { election_id: 1 })).status);
  assert.deepStrictEqual(codes, [400, 400, 400, 400, 400, 429, 429]);
});
