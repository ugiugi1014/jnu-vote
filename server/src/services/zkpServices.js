const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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

/**
 * circuits/tally.circom 입력 형식 생성
 * {
 *   sharedKeys: [],
 *   nonces: [],
 *   ciphertexts: [],
 *   adminResult: []
 * }
 */
function generateTallyZkpInput({ zkpVotes, tally, candidatesCount }) {
  if (!Array.isArray(zkpVotes)) {
    throw new Error("zkpVotes 배열이 필요합니다.");
  }

  const circuitVotes = Number(process.env.TALLY_CIRCUIT_VOTES || 10);
  const circuitCandidates = Number(process.env.TALLY_CIRCUIT_CANDIDATES || 3);

  if (zkpVotes.length > circuitVotes) {
    throw new Error(
      `투표 수 초과: circuit=${circuitVotes}, actual=${zkpVotes.length}. 회로 사이즈를 늘려야 합니다.`
    );
  }

  if (candidatesCount !== circuitCandidates) {
    throw new Error(
      `tally 회로 후보 수 불일치: circuit=${circuitCandidates}, actual=${candidatesCount}`
    );
  }

  // 회로는 고정 사이즈 입력이 필요 — 부족하면 dummy 로 패딩
  // dummy 형식은 회로 spec 에 맞춰야 함. 기본값(0,0,0)이 의도된 동작이 아니라면
  // 환경변수 TALLY_PAD_SHAREDKEY / TALLY_PAD_NONCE / TALLY_PAD_CIPHERTEXT 로 재정의 가능.
  const padShared = process.env.TALLY_PAD_SHAREDKEY || "0";
  const padNonce = process.env.TALLY_PAD_NONCE || "0";
  const padCiphertext = process.env.TALLY_PAD_CIPHERTEXT || "0";

  const padded = [...zkpVotes];
  while (padded.length < circuitVotes) {
    padded.push({
      sharedKey: padShared,
      nonce: padNonce,
      ciphertext: padCiphertext,
    });
  }

  const sharedKeys = padded.map((v, i) => toCircuitValue(v.sharedKey, `sharedKeys[${i}]`));
  const nonces = padded.map((v, i) => toCircuitValue(v.nonce, `nonces[${i}]`));
  const ciphertexts = padded.map((v, i) => toCircuitValue(v.ciphertext, `ciphertexts[${i}]`));

  const adminResult = [];
  for (let candidateIndex = 0; candidateIndex < candidatesCount; candidateIndex++) {
    adminResult.push(toCircuitValue(tally[candidateIndex] || 0, `adminResult[${candidateIndex}]`));
  }

  return {
    sharedKeys,
    nonces,
    ciphertexts,
    adminResult,
  };
}

// 기존 호출부 호환용 이름
const generateZkpInput = generateTallyZkpInput;

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} 파일 없음: ${filePath}`);
  }
}

/**
 * circom/snarkjs proof 생성 (명령어 실행 방식)
 * 기본 경로: server/zkp/build
 * 환경변수로 경로 조정 가능:
 * - ZKP_BUILD_DIR
 * - TALLY_WASM_PATH
 * - TALLY_WITNESS_GEN_PATH
 * - TALLY_ZKEY_PATH
 * - SNARKJS_BIN
 */
function runCircomProof(inputJson) {
  const projectZkpDir = path.resolve(__dirname, "..", "..", "..", "zkp");
  const buildDir = process.env.ZKP_BUILD_DIR || path.join(projectZkpDir, "build");
  const keysDir = path.join(projectZkpDir, "keys");

  const inputPath = path.join(buildDir, "input.json");
  const witnessPath = path.join(buildDir, "witness.wtns");
  const proofPath = path.join(buildDir, "proof.json");
  const publicPath = path.join(buildDir, "public.json");

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
  const snarkjsBin = process.env.SNARKJS_BIN || "snarkjs";

  fs.mkdirSync(buildDir, { recursive: true });
  assertFileExists(wasmPath, "tally.wasm");
  assertFileExists(witnessGenPath, "generate_witness.js");
  assertFileExists(zkeyPath, "tally.zkey");

  // 1) input.json 저장
  fs.writeFileSync(inputPath, JSON.stringify(inputJson, null, 2));

  // 2) witness 생성
  execFileSync("node", [witnessGenPath, wasmPath, inputPath, witnessPath], {
    stdio: "inherit",
  });

  // 3) proof 생성
  execFileSync(snarkjsBin, ["groth16", "prove", zkeyPath, witnessPath, proofPath, publicPath], {
    stdio: "inherit",
  });

  // 4) 결과 파일 읽기
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  return { proof, publicSignals };
}

module.exports = { generateZkpInput, generateTallyZkpInput, runCircomProof };
