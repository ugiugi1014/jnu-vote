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

// ==========================================
// 핵심 함수 (JSX 삽입용)
// ==========================================

// 🧑‍💻 유권자 등록
async function registerVoter() {
  const keyPair = await generateKeyPair();

  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  localStorage.setItem("myPublicKey", JSON.stringify(publicKey));
  localStorage.setItem("myPrivateKey", JSON.stringify(privateKey));

  return publicKey; // 백엔드에 전달할 공개키 반환
}

// 🗳 투표
async function vote(coordJWK) { // 백엔드에서 받은 코디 공개키를 인자로
  const savedPrivate = localStorage.getItem("myPrivateKey");
  if (!savedPrivate) return console.error("❌ 먼저 유권자 등록을 해주세요!");

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(savedPrivate),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const coordPublicKey = await crypto.subtle.importKey(
    "jwk",
    coordJWK,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  const shared = await deriveSharedKey(privateKey, coordPublicKey);
  const raw = await crypto.subtle.exportKey("raw", shared);
  return Array.from(new Uint8Array(raw))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''); // 공유키 반환
}

// ==========================================
// 테스트용 (JSX 삽입 시 아래 전부 삭제)
// ==========================================

async function registerVoterTest() {
  console.log("=== 유권자 등록 ===");
  const publicKey = await registerVoter();
  console.log("공개키:", publicKey);

  // 공개키 JSON 다운로드
  const blob = new Blob([JSON.stringify(publicKey, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'voterPublicKey.json';
  a.click();
  console.log("등록 완료!");
}

async function voteTest() {
  console.log("=== 투표 시작 ===");
  const coordJWK = await fetch('coordPublicKey.json').then(r => r.json());
  const sharedKey = await vote(coordJWK);
  console.log("공유키:", sharedKey);
  console.log("=== 투표 끝 ===");
}