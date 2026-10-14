const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

function toCircuitValue(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} 값이 없습니다.`);
  }
  return BigInt(value).toString();
}

function firstExistingPath(candidates, label) {
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;
  throw new Error(`${label} 파일 없음. 확인 경로: ${candidates.join(" | ")}`);
}

const TALLY_BATCH_SIZE = Number(process.env.TALLY_CIRCUIT_VOTES || 50);
const TALLY_CANDIDATES = Number(process.env.TALLY_CIRCUIT_CANDIDATES || 5);

let poseidonPromise = null;
const getPoseidon = () => (poseidonPromise ??= require("circomlibjs").buildPoseidon());

/**
 * circuits/tally.circom (배치 버전) 입력 목록 생성
 *  - 표를 TALLY_BATCH_SIZE 개씩 나눈다 (표 0개여도 1배치)
 *  - 배치 사이에는 커밋먼트 Poseidon(누적득표[5], salt) 만 이어진다
 *  - salt_k = Poseidon(coordPriv, k+1) : 코디 개인키로부터 결정적으로 생성
 *    -> 비밀이면서도 재실행 시 같은 커밋먼트가 나와, 중간에 실패해도 체인에 기록된 배치부터 이어서 제출 가능
 * 패딩 슬롯: ciphertext=0, ephPub=(0,1). 컨트랙트 recordTallyBatch 와 동일 규약.
 *
 * @param zkpVotes [{ ciphertext, ephPubX, ephPubY, candidateId }] 체인 순서 그대로
 * @returns [{ input, isFinal, result }]
 */
async function buildTallyBatchInputs({ coordPriv, coordPub, zkpVotes, candidatesCount }) {
  if (!Array.isArray(zkpVotes)) throw new Error("zkpVotes 배열이 필요합니다.");
  if (candidatesCount > TALLY_CANDIDATES) {
    throw new Error(`tally 회로 후보 수 초과: circuit=${TALLY_CANDIDATES}, actual=${candidatesCount}`);
  }
  const poseidon = await getPoseidon();
  const H = (xs) => poseidon.F.toObject(poseidon(xs.map(BigInt)));
  const priv = BigInt(coordPriv);

  const nBatches = Math.max(1, Math.ceil(zkpVotes.length / TALLY_BATCH_SIZE));
  const batches = [];
  let tally = Array(TALLY_CANDIDATES).fill(0n);
  let salt = 0n;
  let commit = H([...tally, salt]); // = 컨트랙트 INITIAL_TALLY_COMMIT

  for (let k = 0; k < nBatches; k++) {
    const slice = zkpVotes.slice(k * TALLY_BATCH_SIZE, (k + 1) * TALLY_BATCH_SIZE);
    const newTally = [...tally];
    for (const v of slice) {
      if (!(v.candidateId >= 0 && v.candidateId < TALLY_CANDIDATES)) {
        throw new Error(`유효하지 않은 후보 번호: ${v.candidateId}`);
      }
      newTally[v.candidateId] += 1n;
    }
    const padded = [...slice];
    while (padded.length < TALLY_BATCH_SIZE) padded.push({ ciphertext: "0", ephPubX: "0", ephPubY: "1" });

    const newSalt = H([priv, BigInt(k + 1)]);
    const newCommit = H([...newTally, newSalt]);
    const isFinal = k === nBatches - 1;
    const result = isFinal ? newTally : Array(TALLY_CANDIDATES).fill(0n);

    batches.push({
      isFinal,
      result: result.map(Number),
      input: {
        coordPriv: toCircuitValue(coordPriv, "coordPriv"),
        prevTally: tally.map(String),
        prevSalt: salt.toString(),
        newSalt: newSalt.toString(),
        coordPubX: toCircuitValue(coordPub.x, "coordPubX"),
        coordPubY: toCircuitValue(coordPub.y, "coordPubY"),
        ciphertexts: padded.map((v, i) => toCircuitValue(v.ciphertext, `ciphertexts[${i}]`)),
        ephPubX: padded.map((v, i) => toCircuitValue(v.ephPubX, `ephPubX[${i}]`)),
        ephPubY: padded.map((v, i) => toCircuitValue(v.ephPubY, `ephPubY[${i}]`)),
        prevCommit: commit.toString(),
        newCommit: newCommit.toString(),
        isFinal: isFinal ? "1" : "0",
        result: result.map(String),
      },
    });
    tally = newTally;
    salt = newSalt;
    commit = newCommit;
  }
  return batches;
}


function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} 파일 없음: ${filePath}`);
  }
}

/**
 * circom/snarkjs proof 생성 (명령어 실행 방식, 비동기 — 배치 증명을 병렬로 돌릴 수 있음)
 * 기본 경로: <repo>/zkp/build
 * 환경변수로 경로 조정 가능:
 * - ZKP_BUILD_DIR
 * - TALLY_WASM_PATH
 * - TALLY_WITNESS_GEN_PATH
 * - TALLY_ZKEY_PATH
 * - SNARKJS_BIN
 * @param inputJson 회로 입력
 * @param tag 작업별 파일 이름 구분자 (병렬 실행 시 충돌 방지)
 */
async function runCircomProof(inputJson, tag = "tally") {
  const projectZkpDir = path.resolve(__dirname, "..", "..", "..", "zkp");
  const buildDir = process.env.ZKP_BUILD_DIR || path.join(projectZkpDir, "build");
  const keysDir = path.join(projectZkpDir, "keys");
  const jobDir = path.join(buildDir, "jobs");

  const inputPath = path.join(jobDir, `${tag}_input.json`);
  const witnessPath = path.join(jobDir, `${tag}_witness.wtns`);
  const proofPath = path.join(jobDir, `${tag}_proof.json`);
  const publicPath = path.join(jobDir, `${tag}_public.json`);

  const wasmPath = process.env.TALLY_WASM_PATH || firstExistingPath([
    path.join(buildDir, "tally_js", "tally.wasm"),
    path.join(buildDir, "tally.wasm"),
  ], "tally.wasm");
  const witnessGenPath = process.env.TALLY_WITNESS_GEN_PATH || firstExistingPath([
    path.join(buildDir, "tally_js", "generate_witness.js"),
    path.join(buildDir, "generate_witness.js"),
  ], "generate_witness.js");
  const zkeyPath = process.env.TALLY_ZKEY_PATH || firstExistingPath([
    path.join(keysDir, "tally_final.zkey"),
    path.join(buildDir, "tally_final.zkey"),
    path.join(buildDir, "tally.zkey"),
  ], "tally.zkey");
  // snarkjs CLI는 PATH에 없을 수 있으므로 설치된 cli.cjs를 node로 직접 실행
  const snarkjsCli =
    process.env.SNARKJS_BIN ||
    path.join(path.dirname(require.resolve("snarkjs")), "cli.cjs");

  fs.mkdirSync(jobDir, { recursive: true });
  assertFileExists(wasmPath, "tally.wasm");
  assertFileExists(witnessGenPath, "generate_witness.js");
  assertFileExists(zkeyPath, "tally.zkey");

  fs.writeFileSync(inputPath, JSON.stringify(inputJson, null, 2));
  await execFileAsync("node", [witnessGenPath, wasmPath, inputPath, witnessPath]);
  await execFileAsync("node", [snarkjsCli, "groth16", "prove", zkeyPath, witnessPath, proofPath, publicPath]);

  const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf-8"));
  for (const f of [inputPath, witnessPath, proofPath, publicPath]) fs.rmSync(f, { force: true });
  return { proof, publicSignals };
}

/**
 * 여러 배치 증명을 동시성 제한을 두고 병렬 생성
 * TALLY_PROOF_CONCURRENCY (기본 2) — 배치 1개당 메모리 2GB 안팎 사용
 */
async function proveTallyBatches(batches, tagPrefix = "tally") {
  const limit = Math.max(1, Number(process.env.TALLY_PROOF_CONCURRENCY || 2));
  const results = new Array(batches.length);
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const k = next++;
      results[k] = await runCircomProof(batches[k].input, `${tagPrefix}_${k}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, batches.length) }, worker));
  return results;
}

module.exports = { buildTallyBatchInputs, runCircomProof, proveTallyBatches, TALLY_BATCH_SIZE, TALLY_CANDIDATES };
