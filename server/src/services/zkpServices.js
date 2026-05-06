import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * tallyObj 예: { "1": 10, "2": 5, "3": 2 }
 * candidatesCount 예: 3
 */
export function generateZkpInput(tallyObj, candidatesCount) {
  const tallyArray = [];

  for (let i = 1; i <= candidatesCount; i++) {
    tallyArray.push(tallyObj[i] || 0);
  }

  return {
    tally: tallyArray,
  };
}

/**
 * circom/snarkjs proof 생성 (명령어 실행 방식)
 * - circom 팀이 이 부분을 구현/관리하면 됨
 */
export function runCircomProof(inputJson) {
  const zkpDir = path.join(process.cwd(), "zkp");
  const buildDir = path.join(zkpDir, "build");

  const inputPath = path.join(buildDir, "input.json");
  const witnessPath = path.join(buildDir, "witness.wtns");
  const proofPath = path.join(buildDir, "proof.json");
  const publicPath = path.join(buildDir, "public.json");

  const wasmPath = path.join(buildDir, "tally_js", "tally.wasm");
  const witnessGenPath = path.join(buildDir, "tally_js", "generate_witness.js");
  const zkeyPath = path.join(buildDir, "tally.zkey");

  // 1) input.json 저장
  fs.writeFileSync(inputPath, JSON.stringify(inputJson, null, 2));

  // 2) witness 생성
  execSync(`node ${witnessGenPath} ${wasmPath} ${inputPath} ${witnessPath}`, {
    stdio: "inherit",
  });

  // 3) proof 생성
  execSync(
    `snarkjs groth16 prove ${zkeyPath} ${witnessPath} ${proofPath} ${publicPath}`,
    { stdio: "inherit" }
  );

  // 4) 결과 파일 읽기
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  return { proof, publicSignals };
}
