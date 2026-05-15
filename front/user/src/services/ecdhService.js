// src/services/ecdhService.js

// 🔑 키쌍 생성
export async function generateECDHKeyPair() {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

// 🔐 공유키 생성 + 개인키 폐기
export async function deriveSharedKeyAndDispose(keyPair, coordPublicKey) {
  const sharedKey = await deriveSharedKey(keyPair.privateKey, coordPublicKey);
  keyPair.privateKey = null; // 개인키 폐기
  return sharedKey;
}

// 코디네이터 공개키 import
export async function importCoordPublicKey(coordJWK) {
  return await crypto.subtle.importKey(
    "jwk",
    coordJWK,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

// 🔐 공유키 생성 (내부용)
async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return await crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// 📤 공개키 export (체인 제출용)
export async function exportPublicKey(publicKey) {
  return await crypto.subtle.exportKey("jwk", publicKey);
}

// 🔢 공유키 CryptoKey → BigInt 변환 (Poseidon 입력용)
export async function exportSharedKeyAsBigInt(sharedKey) {
  const raw = await crypto.subtle.exportKey("raw", sharedKey);
  const hex = Array.from(new Uint8Array(raw))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return BigInt('0x' + hex);
}