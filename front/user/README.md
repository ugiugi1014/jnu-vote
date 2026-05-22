# 프론트엔드 개발 규칙

> 이 문서는 JNU 전자투표 시스템 프론트엔드 작업 시 반드시 지켜야 할 규칙을 정리한 것입니다.  
> 규칙마다 **왜 위반하면 안 되는지** 이유와 예시 코드를 함께 설명합니다.

---

## 목차

1. [보안 규칙](#1-보안-규칙)
2. [지갑 및 암호화 규칙](#2-지갑-및-암호화-규칙)
3. [서비스 레이어 규칙](#3-서비스-레이어-규칙)
4. [상태 및 세션 규칙](#4-상태-및-세션-규칙)

---

## 1. 보안 규칙

### 1-1. `wallet.privateKey`를 스토리지에 저장하지 않는다

**이유**: 이 프로젝트의 지갑은 `createWallet(webmail, serverSecret)`으로 언제든 재생성 가능하도록 설계되어 있다. 저장할 이유가 없고, 저장하면 XSS 공격 시 개인키가 영구 노출된다.

```js
// ❌ 금지
localStorage.setItem("privateKey", wallet.privateKey);
sessionStorage.setItem("privateKey", wallet.privateKey);

// ✅ 올바른 방법 — 메모리(useState)에만 유지
const [wallet, setWallet] = useState(null);
setWallet(await createWallet(email, serverSecret));
```

---

### 1-2. 세션 정보는 sessionStorage에만 저장한다

**이유**: `localStorage`는 탭을 닫아도 브라우저 종료 후에도 남는다. 세션 범위를 벗어나는 토큰 유지는 보안 위험이다.

저장 대상: `token`, `email`, `role`, `verificationStatus`  
저장 금지: `privateKey`, `serverSecret`

```js
// ❌ 금지
localStorage.setItem("jnuVote.auth", JSON.stringify({ token, email }));

// ✅ 올바른 방법
sessionStorage.setItem("jnuVote.auth", JSON.stringify({ token, email, role, verificationStatus }));
```

---

### 1-3. `privateKey`를 콘솔에 출력하거나 외부로 전송하지 않는다

**이유**: 개발 편의를 위한 `console.log`가 운영 환경에 그대로 남을 수 있다.

```js
// ❌ 금지
console.log("지갑 확인:", wallet.privateKey);
console.log(wallet);  // wallet 객체 전체 출력도 금지 (privateKey 포함)

await fetch("/api/something", {
  body: JSON.stringify({ privateKey: wallet.privateKey }),  // ❌ 절대 금지
});

// ✅ 필요하다면 주소만 출력
console.log("지갑 주소:", wallet.address);
```

---

## 2. 지갑 및 암호화 규칙

### 2-1. 지갑 생성은 반드시 `createWallet()`을 사용한다

**이유**: KDF 기반 결정론적 지갑 생성이 이 프로젝트의 핵심 설계다. `new ethers.Wallet()`을 직접 호출하면 매번 다른 지갑이 생성되어 동일한 사용자가 다른 주소를 가지게 된다.

```js
// ❌ 금지
const wallet = new ethers.Wallet(someRandomKey);
const wallet = ethers.Wallet.createRandom();

// ✅ 올바른 방법
import { createWallet } from "../services/walletService";
const wallet = await createWallet(email, serverSecret);
```

---

### 2-2. ECDH 개인키는 공유키 생성 직후 폐기한다

**이유**: 투표자의 ECDH 개인키는 공유키를 만든 후 더 이상 필요 없다. 메모리에 남겨두면 익명성이 깨질 수 있다.  
`deriveSharedKeyAndDispose`가 내부적으로 `keyPair.privateKey = null` 처리하므로, 이 함수를 반드시 사용해야 한다.

```js
// ❌ 금지 — 개인키를 직접 꺼내 쓰거나, dispose 없이 공유키만 뽑는 경우
const keyPair = await generateECDHKeyPair();
const sharedKey = await deriveSharedKey(keyPair.privateKey, coordPublicKey);
// keyPair.privateKey가 메모리에 그대로 남아있음

// ✅ 올바른 방법
const keyPair = await generateECDHKeyPair();
const voterPublicKey = await exportPublicKey(keyPair.publicKey); // 공개키 먼저 export
const sharedKey = await deriveSharedKeyAndDispose(keyPair, coordPublicKey); // 개인키 폐기
```

---

### 2-3. `coordPublicKey` export는 `deriveSharedKeyAndDispose` 이전에 해야 한다

**이유**: `deriveSharedKeyAndDispose`를 먼저 호출하면 `keyPair.publicKey`에 대한 참조가 dispose된 객체와 함께 처리되어 이후 export가 실패하거나 잘못된 값이 나올 수 있다.

```js
// ❌ 금지 — dispose 이후 export 시도
const sharedKey = await deriveSharedKeyAndDispose(keyPair, coordPublicKey);
const voterPublicKey = await exportPublicKey(keyPair.publicKey); // 순서 잘못됨

// ✅ 올바른 순서
const voterPublicKey = await exportPublicKey(keyPair.publicKey); // 1. 먼저 export
const sharedKey = await deriveSharedKeyAndDispose(keyPair, coordPublicKey); // 2. 그 다음 dispose
```

---

## 3. 서비스 레이어 규칙

### 3-1. 암호화 로직은 JSX 파일에 직접 작성하지 않는다

**이유**: 암호화 로직이 컴포넌트에 분산되면 유지보수와 보안 검토가 어려워진다.  
모든 암호화 처리는 `services/` 폴더 안의 해당 파일에서만 한다.

| 파일 | 담당 역할 |
|---|---|
| `walletService.js` | 지갑 생성, 체인 연결, 컨트랙트 호출 |
| `ecdhService.js` | ECDH 키쌍 생성, 공유키 생성, 키 export |
| `poseidonService.js` | secret, nullifier 생성, 후보자 암호화 |
| `zkpService.js` | ZKP proof 생성 (snarkjs) |

```js
// ❌ 금지 — JSX 안에서 직접 crypto 호출
// VoteDetailPage.jsx
const secret = await poseidon([BigInt(wallet.privateKey), BigInt(vote.id)]);

// ✅ 올바른 방법 — 서비스 함수 호출
import { generateSecret } from "../services/poseidonService";
const secret = await generateSecret(privateKeyToBigInt(wallet.privateKey), vote.id);
```

---

### 3-2. 복호화 로직을 프론트에 추가하지 않는다

**이유**: 암호화된 투표 내용의 복호화는 개표 시 백엔드(코디네이터 서버)에서만 처리한다. 프론트가 복호화 기능을 가지면 익명성 보장이 깨진다.

```js
// ❌ 금지 — 어떤 형태든 프론트에서 복호화 시도
import { decryptCandidate } from "../services/poseidonService";

// ✅ 결과 조회는 체인에서 집계된 결과만 읽는다
const result = await contract.getResult(electionId);
```

---

### 3-3. `services/` 파일 간 의존 방향을 지킨다

**이유**: 순환 참조가 생기면 모듈 로딩이 실패한다.

허용되는 의존 방향:
```
zkpService → poseidonService → (없음)
VoteDetailPage → walletService, ecdhService, poseidonService, zkpService
```

```js
// ❌ 금지 — poseidonService가 walletService를 import
// poseidonService.js
import { createWallet } from "./walletService"; // 순환 참조 위험

// ✅ 필요한 값은 호출하는 쪽(JSX)에서 준비해서 인자로 넘긴다
// VoteDetailPage.jsx
const walletPrivateKeyBigInt = privateKeyToBigInt(wallet.privateKey);
const secret = await generateSecret(walletPrivateKeyBigInt, vote.id);
```

---

## 4. 상태 및 세션 규칙

### 4-1. 로그인 후 상태 설정은 `applySession()`을 통해서만 한다

**이유**: `App.jsx`의 상태(token, wallet, role 등)를 여러 곳에서 각각 `setState`로 설정하면 일부 상태가 빠지거나 순서 문제가 생긴다. `applySession`이 sessionStorage 저장과 setState를 한 번에 처리한다.

```js
// ❌ 금지 — 각 setState 직접 호출
setToken(data.token);
setWallet(wallet);
setStudentId(email);
// verificationStatus나 role을 빠뜨리기 쉬움

// ✅ 올바른 방법 — onLogin 콜백을 통해 applySession 호출
onLogin({
  email,
  role: data.role,
  token: data.token,
  wallet,
  verification: data.verification,
});
```

---

### 4-2. `wallet`이 null인 상태에서 투표 흐름에 진입하지 않는다

**이유**: 새로고침 시 `wallet`은 복원되지 않는다(설계 의도). `wallet`이 null인 채로 `VoteDetailPage`의 `handleConfirm`이 실행되면 `wallet.privateKey` 참조 시 런타임 오류가 발생한다.

```js
// ❌ 금지 — wallet null 체크 없이 투표 진행
const handleConfirm = async () => {
  const key = privateKeyToBigInt(wallet.privateKey); // wallet이 null이면 즉시 오류
};

// ✅ 올바른 방법 — 진입 시점에 null 체크
const handleConfirm = async () => {
  if (!wallet) {
    alert("세션이 만료되었습니다. 다시 로그인해주세요.");
    onBack();
    return;
  }
  const key = privateKeyToBigInt(wallet.privateKey);
};
```

---

### 4-3. DEV 모드 mock 분기에서도 `createWallet()`을 호출한다

**이유**: `wallet: null`로 mock 로그인하면 투표 흐름 전체를 테스트할 수 없다.

```js
// ❌ 금지
if (import.meta.env.DEV && normalizedEmail === "admin") {
  onLogin({ email: "admin", role: "admin", token: null, wallet: null, ... });
}

// ✅ 올바른 방법
if (import.meta.env.DEV && normalizedEmail === "admin") {
  onLogin({
    email: "admin",
    role: "admin",
    token: null,
    wallet: await createWallet("admin", "mock-secret"),
    verification: { status: "approved" },
  });
}
```

---

## 요약

| 규칙 | 한 줄 요약 |
|---|---|
| 1-1 | `privateKey`는 메모리(useState)에만 |
| 1-2 | 세션 정보는 sessionStorage, localStorage 금지 |
| 1-3 | `privateKey` 콘솔 출력 및 외부 전송 금지 |
| 2-1 | 지갑 생성은 `createWallet()`만 사용 |
| 2-2 | ECDH 개인키는 `deriveSharedKeyAndDispose`로 즉시 폐기 |
| 2-3 | `coordPublicKey` export는 dispose 이전에 |
| 3-1 | 암호화 로직은 `services/`에만, JSX에 직접 작성 금지 |
| 3-2 | 복호화 로직은 프론트에 추가 금지 |
| 3-3 | 서비스 간 의존 방향 준수 |
| 4-1 | 로그인 상태 설정은 `applySession()` 경유 |
| 4-2 | `wallet` null 상태에서 투표 흐름 진입 금지 |
| 4-3 | DEV mock에서도 `createWallet()` 호출 |