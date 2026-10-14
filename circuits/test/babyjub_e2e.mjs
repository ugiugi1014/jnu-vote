// BabyJubJub 암호화 E2E 테스트 (프론트 암호화 -> voteProof witness -> 서버 복호화 -> tally witness)
// 사용: circom 으로 voteProof/tally 를 --wasm 빌드한 디렉터리를 인자로 전달
//   node circuits/test/babyjub_e2e.mjs <build_dir>
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { encryptVote } from "../../front/user/src/services/ecdhService.js";
const require = createRequire(import.meta.url);
const { generateCoordKeyPair, decryptVote } = require("../../server/src/services/ecdhDecrypt.js");
const { generateTallyZkpInput } = require("../../server/src/services/zkpServices.js");

const dir = path.resolve(process.argv[2] || "zkp/build");
const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const S = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v)));

async function check(circuit, label, input, expectPass) {
  const builder = require(path.join(dir, `${circuit}_js`, "witness_calculator.js"));
  const wc = await builder(fs.readFileSync(path.join(dir, `${circuit}_js`, `${circuit}.wasm`)));
  let ok = true;
  try { await wc.calculateWitness(S(input), true); } catch { ok = false; }
  const tag = ok === expectPass ? "OK  " : "FAIL";
  console.log(`${tag} [${circuit}] ${label.padEnd(52)} -> ${ok ? "satisfied" : "rejected"}`);
  if (ok !== expectPass) process.exitCode = 1;
}

const { publicKey, privateKey } = await generateCoordKeyPair();
const coordPub = JSON.parse(publicKey);
const numCandidates = 3;
const secretBase = 123456789n;

// ---- voteProof ----
const ids = [0, 2, 1, 1, 0, 2, 2];
const ballots = [];
for (let i = 0; i < ids.length; i++) {
  const e = await encryptVote(ids[i], coordPub);
  ballots.push(e);
  const input = {
    secret: secretBase + BigInt(i), candidateId: ids[i], ephPriv: e.ephPriv,
    numCandidates, coordPubX: coordPub.x, coordPubY: coordPub.y,
    ciphertext: e.ciphertext, ephPubX: e.ephPubX, ephPubY: e.ephPubY,
  };
  if (i === 0) {
    await check("voteProof", "honest ballot", input, true);
    await check("voteProof", "ciphertext encrypts a different candidate", { ...input, ciphertext: (e.ciphertext + 1n) % P }, false);
    const out = await encryptVote(7, coordPub);
    await check("voteProof", "candidate out of range (7 >= numCandidates)", { ...input, candidateId: 7, ciphertext: out.ciphertext, ephPriv: out.ephPriv, ephPubX: out.ephPubX, ephPubY: out.ephPubY }, false);
    await check("voteProof", "candidateId = p-1 (8bit comparator bypass)", { ...input, candidateId: P - 1n, ciphertext: (e.ciphertext - 1n + P) % P }, false);
    await check("voteProof", "ephPub not matching ephPriv", { ...input, ephPubX: coordPub.x, ephPubY: coordPub.y }, false);
    const fake = JSON.parse((await generateCoordKeyPair()).publicKey);
    await check("voteProof", "encrypted to a different coordinator key", { ...input, coordPubX: fake.x, coordPubY: fake.y }, false);
  } else {
    await check("voteProof", `honest ballot #${i}`, input, true);
  }
}

// ---- server decrypt ----
const tally = {};
const zkpVotes = [];
for (const b of ballots) {
  const d = await decryptVote({ ciphertext: b.ciphertext }, privateKey, { x: b.ephPubX, y: b.ephPubY });
  tally[d.candidateId] = (tally[d.candidateId] || 0) + 1;
  zkpVotes.push({ ciphertext: d.ciphertext, ephPubX: d.ephPubX, ephPubY: d.ephPubY });
}
const expected = {}; ids.forEach((c) => (expected[c] = (expected[c] || 0) + 1));
const decOk = JSON.stringify(tally) === JSON.stringify(expected);
console.log(`${decOk ? "OK  " : "FAIL"} [server ] decrypt matches plaintext votes ${JSON.stringify(tally)}`);
if (!decOk) process.exitCode = 1;

// ---- tally ----
const base = generateTallyZkpInput({ coordPriv: privateKey, coordPub, zkpVotes, tally, candidatesCount: numCandidates });
await check("tally", "honest tally", base, true);
const wrong = [...base.adminResult]; wrong[0] = String(+wrong[0] - 1); wrong[1] = String(+wrong[1] + 1);
await check("tally", "admin moves a vote 0->1", { ...base, adminResult: wrong }, false);
const drop = [...base.adminResult]; drop[0] = String(+drop[0] - 1);
await check("tally", "admin drops a vote", { ...base, adminResult: drop }, false);
const other = await generateCoordKeyPair();
await check("tally", "admin uses another private key", { ...base, coordPriv: other.privateKey }, false);
// 공개 입력 자체를 바꾸는 공격은 회로만으로는 막을 수 없다 -> 컨트랙트가 저장된 ephPub 와 대조해서 차단 (Foundry 테스트 참고)
await check("tally", "real vote relabeled as padding (circuit-only; contract blocks)", { ...base, ephPubX: base.ephPubX.map((v, i) => (i === 0 ? "0" : v)), ephPubY: base.ephPubY.map((v, i) => (i === 0 ? "1" : v)), adminResult: drop }, true);
process.exit(process.exitCode || 0);
