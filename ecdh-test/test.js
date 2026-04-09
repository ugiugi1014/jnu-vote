// 🔑 키 생성
async function generateKeyPair() {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

// 🔐 공유키 생성
async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return await crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// 🧑‍💻 유권자 등록
async function registerVoter() {
  console.log("=== 유권자 등록 ===");

  const keyPair = await generateKeyPair();

  // 공개키 export
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // 개인키 export
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // localStorage 저장
  localStorage.setItem("myPublicKey", JSON.stringify(publicKey));
  localStorage.setItem("myPrivateKey", JSON.stringify(privateKey));

  console.log("등록 완료!");
  console.log("공개키:", publicKey);
}

// 🗳 투표 (저장된 키 사용)
async function vote() {
  console.log("=== 투표 시작 ===");

  // 1. 저장된 개인키 불러오기
  const savedPrivate = localStorage.getItem("myPrivateKey");

  if (!savedPrivate) {
    console.error("❌ 먼저 유권자 등록을 해주세요!");
    return;
  }

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(savedPrivate),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  // 2. 코디네이터 키 생성 (테스트용)
  const coordinator = await generateKeyPair();

  // 3. 공유키 생성
  const shared = await deriveSharedKey(privateKey, coordinator.publicKey);

  // 4. 출력
  const raw = await crypto.subtle.exportKey("raw", shared);
  const hex = Array.from(new Uint8Array(raw))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  console.log("공유키:", hex);

  console.log("=== 투표 끝 ===");
}
