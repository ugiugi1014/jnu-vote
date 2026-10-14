// tally.circom 집계 무결성 테스트 (witness 단계 제약 검사)
//
// 사용법 (루트에서):
//   circom circuits/tally.circom --wasm -o zkp/build
//   node circuits/test/tally_integrity.js zkp/build/tally_js
//   (circomlibjs 필요: server/ 또는 front/user/ 의 node_modules 사용 가능 -> NODE_PATH=server/node_modules)
//
// 기대 결과:
//   honest tally                         PASS
//   admin drops a vote (fake sharedKey)  FAIL  <- 이전 회로에서는 PASS 였음 (표 누락 공격 가능)
//   admin moves a vote 1->2              FAIL
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");

const dir = path.resolve(process.argv[2] || "zkp/build/tally_js");
const N = 50, C = 5;
const rnd = () => BigInt("0x" + crypto.randomBytes(31).toString("hex"));

(async () => {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const pos = (a, b) => F.toObject(poseidon([a, b]));
  const wasm = fs.readFileSync(path.join(dir, "tally.wasm"));
  const builder = require(path.join(dir, "witness_calculator.js"));

  const ids = [0, 1, 1, 2, 4, 1, 3];
  const sk = [], nn = [], ct = [];
  for (const id of ids) {
    const s = rnd(), n = rnd();
    sk.push(s); nn.push(n); ct.push(pos(s, n) ^ BigInt(id));
  }
  while (sk.length < N) { sk.push(0n); nn.push(0n); ct.push(0n); }
  const res = Array(C).fill(0n); ids.forEach((i) => res[i]++);

  const input = (o = {}) => ({
    sharedKeys: (o.sk || sk).map(String),
    nonces: nn.map(String),
    ciphertexts: ct.map(String),
    adminResult: (o.res || res).map(String),
  });
  const run = async (label, inp) => {
    try {
      const wc = await builder(wasm);
      await wc.calculateWitness(inp, true);
      console.log(label.padEnd(40), "PASS");
    } catch (e) {
      console.log(label.padEnd(40), "FAIL (constraint violated)");
    }
  };

  const skDrop = [...sk]; skDrop[0] = rnd();
  const resDrop = [...res]; resDrop[0]--;
  const resMove = [...res]; resMove[1]--; resMove[2]++;

  await run("honest tally", input());
  await run("admin drops a vote (fake sharedKey)", input({ sk: skDrop, res: resDrop }));
  await run("admin moves a vote 1->2", input({ res: resMove }));
})();
