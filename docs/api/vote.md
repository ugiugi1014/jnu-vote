# 투표 API

실제 투표 트랜잭션은 **프론트가 직접 컨트랙트의 `castVote` 를 호출**하고, 백엔드는 그 결과를 검증·기록만 한다.

## 전체 흐름

```
[프론트]
  1. GET /elections/:id/coordinator/public-key   ← 코디네이터 공개키
  2. ECDH 키쌍 생성 → 공유키 도출 → 개인키 폐기
  3. Poseidon 으로 candidateID 암호화 → { ciphertext, nonce }
  4. ZKP① proof + nullifier 생성 (vote.circom)
  5. 컨트랙트 VotingSystem.castVote(nullifier, encryptedData, voterPubKey) 호출
     · encryptedData = ethers.toUtf8Bytes(JSON.stringify({ ciphertext, nonce }))
     · voterPubKey = ethers.toUtf8Bytes(JSON.stringify(voterPublicJWK))
     · 트랜잭션 성공 → tx hash 받음
  6. POST /vote/confirm 으로 tx 검증 요청

[백엔드 (POST /vote/confirm)]
  · 트랜잭션 receipt 조회 → status=1 확인
  · tx.to 가 election.contract_address 와 일치하는지 확인
  · tx.from 이 voter.wallet_address 와 일치하는지 확인
  · voters.voter_public_key 저장, has_voted=TRUE
  · elections.voted_count++ 증가
```

---

## `POST /vote/confirm`

투표 트랜잭션 확인 + voter_public_key 저장.

**권한**: auth  
**요청**:
```json
{
  "election_id": 1,
  "txHash": "0x...",
  "voter_public_key": "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"...\",\"y\":\"...\"}"
}
```

> `voter_public_key` 는 JWK 객체를 JSON.stringify 한 문자열로 전달.

**전제 조건**:
- 선거 상태 = `active`
- `election.contract_address` 등록됨
- 해당 사용자 = `voters` 에 등록됨 + `has_voted=FALSE`
- `voters.wallet_address` 있음
- 재학증명서 인증 `approved`
- `token_issued_at` 있음 (= 토큰 발급됨)

**검증**:
- `provider.getTransactionReceipt(txHash)` 성공 + `status === 1`
- `tx.to` 가 `election.contract_address` 와 일치
- `tx.from` 이 `voter.wallet_address` 와 일치

**성공 (200)**:
```json
{
  "message": "투표 확인 완료",
  "election_id": 1,
  "txHash": "0x..."
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | election_id / txHash / voter_public_key 필수값 누락 |
| 400 | 선거 상태 active 아님 |
| 400 | contract_address 미등록 |
| 400 | 지갑 미등록 / 재학증명서 미승인 / 토큰 미발급 / 이미 투표 |
| 400 | 트랜잭션 미포함 / 실패 / 다른 컨트랙트 / 다른 지갑 |
| 401 | 토큰 없음 |
| 404 | 선거 없음 / 유권자 등록 안됨 |
| 500 | RPC/DB 오류 |

---

## 컨트랙트 측 castVote 시그니처

```solidity
function castVote(
    bytes32 nullifier,
    bytes calldata encryptedData,
    bytes calldata voterPubKey
) external whenElectionOpen
```

**컨트랙트 처리**:
1. `votingToken.isTokenValid(msg.sender)` 확인
2. `nullifiers[nullifier]` 중복 체크
3. `nullifiers[nullifier] = true` 등록
4. `votes` 배열에 `{ encryptedData, voterPubKey }` 저장
5. `votingToken.burnToken(msg.sender)` 호출 — 토큰 소각
6. `emit VoteCast(nullifier)`

> 현재 컨트랙트는 ZKP① proof 검증을 안 함 (TODO 주석). verifier.sol 통합 시 활성화 예정.

---

## 데이터 형식 합의 (프론트 ↔ 백엔드)

### `encryptedData` (체인 저장)
- 프론트: `ethers.toUtf8Bytes(JSON.stringify({ ciphertext, nonce }))`
- 백엔드: `ethers.toUtf8String(bytes)` → `JSON.parse` → `{ ciphertext, nonce }` (BigInt string)

### `voterPubKey` (체인 저장)
- 프론트: `ethers.toUtf8Bytes(JSON.stringify(voterPublicJWK))`
- 백엔드: `ethers.toUtf8String(bytes)` → `JSON.parse` → JWK 객체

### `voter_public_key` (DB 저장, `POST /vote/confirm` 으로 받음)
- 프론트→백엔드: JWK 객체를 JSON.stringify 한 문자열
- 백엔드 DB: TEXT 컬럼에 그대로 저장

> 두 경로(체인 / DB) 모두 같은 voter_public_key 가 들어가야 함. 개표 시 체인 데이터를 우선 참조.
