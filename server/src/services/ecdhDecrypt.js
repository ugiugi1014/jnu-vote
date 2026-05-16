// ECDH (P-256) + Poseidon 스트림 복호화 모듈
// 프론트의 ecdhService.js + poseidonService.js 와 호환되는 백엔드 구현
//
// 흐름:
//   1) 코디네이터 개인키 + 투표자 공개키 → ECDH 공유키 도출
//   2) keystream = Poseidon(sharedKey, nonce)
//   3) candidateID = ciphertext XOR keystream

const { webcrypto } = require("crypto");
const { buildPoseidon } = require("circomlibjs");
const { ethers } = require("ethers");

// circomlibjs Poseidon 인스턴스 (싱글톤)
let poseidonPromise = null;
async function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

// JWK 가 문자열로 저장돼 있으면 파싱
function parseJWK(input) {
  if (!input) throw new Error("JWK 키가 비어있습니다.");
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch (err) {
      throw new Error(`JWK 파싱 실패: ${err.message}`);
    }
  }
  return input;
}

// 코디네이터 ECDH 키쌍 생성 (선거 생성 시 호출)
async function generateCoordKeyPair() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable — 개인키 export 위해 필요
    ["deriveBits"]
  );

  const publicKey = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKeyJWK: JSON.stringify(publicKey),
    privateKeyJWK: JSON.stringify(privateKey),
  };
}

// ECDH 공유키 도출 → BigInt 변환 (프론트 exportSharedKeyAsBigInt 와 동일)
async function deriveSharedKeyBigInt(coordPrivKeyJWK, voterPubKeyJWK) {
  const privJWK = parseJWK(coordPrivKeyJWK);
  const pubJWK = parseJWK(voterPubKeyJWK);

  const privKey = await webcrypto.subtle.importKey(
    "jwk",
    privJWK,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );

  const pubKey = await webcrypto.subtle.importKey(
    "jwk",
    pubJWK,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const bits = await webcrypto.subtle.deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256 // 32바이트
  );

  const buf = new Uint8Array(bits);
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex);
}

// 단일 투표 복호화
// 입력: { ciphertext, nonce } (BigInt string), 코디네이터 개인키 JWK, 투표자 공개키 JWK
// 출력: { candidateId, sharedKey, nonce, ciphertext } (전부 string/number)
async function decryptVote({ ciphertext, nonce }, coordPrivKey, voterPubKey) {
  if (ciphertext === undefined || nonce === undefined) {
    throw new Error("ciphertext, nonce 필수");
  }

  const sharedKey = await deriveSharedKeyBigInt(coordPrivKey, voterPubKey);

  const poseidon = await getPoseidon();
  const hash = poseidon([sharedKey, BigInt(nonce)]);
  const keystream = poseidon.F.toObject(hash);

  const candidateId = Number(BigInt(ciphertext) ^ keystream);

  return {
    candidateId,
    sharedKey: sharedKey.toString(),
    nonce: BigInt(nonce).toString(),
    ciphertext: BigInt(ciphertext).toString(),
  };
}

// 체인의 encryptedData (bytes) → { ciphertext, nonce } 파싱
// 프론트가 JSON.stringify 후 UTF-8 bytes 로 인코딩해서 castVote 호출한다고 가정
function parseEncryptedData(encryptedData) {
  if (!encryptedData) {
    throw new Error("encryptedData 비어있음");
  }
  // hex (0x...) 면 utf8 디코딩, 아니면 그대로 문자열로 취급
  const text =
    typeof encryptedData === "string" && encryptedData.startsWith("0x")
      ? ethers.toUtf8String(encryptedData)
      : String(encryptedData);
  return JSON.parse(text);
}

// 투표자 공개키 (bytes 또는 JSON 문자열) → JWK 객체
function parseVoterPublicKey(input) {
  if (!input) {
    throw new Error("voter_public_key 비어있음");
  }
  if (typeof input === "string" && input.startsWith("0x")) {
    return JSON.parse(ethers.toUtf8String(input));
  }
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return input;
}

module.exports = {
  generateCoordKeyPair,
  deriveSharedKeyBigInt,
  decryptVote,
  parseEncryptedData,
  parseVoterPublicKey,
};
