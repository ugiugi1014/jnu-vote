import { encryptCandidate, decryptCandidate } from './crypto.js';
import { readFileSync } from 'fs';

const inputPath = new URL('./input.json', import.meta.url);
let testData;

try {
  const rawData = readFileSync(inputPath, 'utf8');
  if (!rawData || rawData.trim() === "") {
    console.error("❌ 오류: input.json 파일이 비어 있습니다.");
    process.exit(1);
  }
  testData = JSON.parse(rawData);
} catch (error) {
  console.error("❌ JSON 파싱 오류: input.json 파일의 형식을 확인하세요.");
  console.error("상세 내용:", error.message);
  process.exit(1);
}

async function runTest() {
  console.log("=== Poseidon 암호화 테스트 시작 (utils/) ===");
  console.log("입력 데이터:", testData);

  // 1. 암호화
  const { ciphertext, nonce } = await encryptCandidate(testData.candidateID, testData.sharedKey);
  console.log("암호화 결과 - ciphertext:", ciphertext);
  console.log("암호화 결과 - nonce:", nonce);

  // 2. 복호화
  const decrypted = await decryptCandidate(ciphertext, testData.sharedKey, nonce);
  console.log("복호화 결과:", decrypted);

  // 3. 검증
  if (decrypted === testData.candidateID.toString()) {
    console.log("✅ 테스트 성공: 복호화된 값이 원본과 일치합니다.");
  } else {
    console.error("❌ 테스트 실패: 값이 일치하지 않습니다.");
  }
}

runTest();