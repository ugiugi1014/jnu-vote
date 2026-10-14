# 투표 API

실제 투표 트랜잭션은 **프론트가 직접 컨트랙트의 `castVote` 를 호출**하고, 백엔드는 그 결과를 검증·기록만 한다.

## 전체 흐름 (익명 투표)

```
[프론트 — 투표 화면 진입]
  1. GET /elections/:id/my-eligibility  → { eligible, registered, contract_address }
  2. 미등록이면: secret = 랜덤 (localStorage 에만 저장), commitment = Poseidon(secret)
     POST /elections/:id/register-commitment { commitment }  (로그인 필요, 학생 1명당 1회)

[프론트 — 투표]
  3. 체인 VotingSystem 에서 coordPubX/Y, numCandidates, getCommitments() 조회
  4. 내 commitment 의 머클 경로 계산 (voterIdService.buildMerkleProof)
  5. BabyJubJub 암호화: ciphertext = candidateID + Poseidon(shared.x, shared.y)
  6. ZKP① (voteProof.circom, Web Worker): 트리 포함 + nullifier + 유효 후보 암호화
  7. POST /vote/relay  (로그인 토큰 없이!)
     { election_id, nullifier(bytes32), merkleRoot, encryptedData, voterPubKey, pA, pB(swap), pC }

[백엔드 (POST /vote/relay)]
  · 형식 검사 → castVote.staticCall 로 사전 검증 (실패 시 400, 가스 사용 안 함)
  · 관리자 지갑으로 castVote 전송 → voted_count + 1 (누가 했는지는 기록하지 않음)
```

## `POST /vote/relay`
**권한**: 없음 (의도적 — 서버가 투표자를 알면 안 됨)

**성공 (200)**: `{ "message": "투표 완료", "txHash": "0x..." }`

**에러**: 400 형식 오류 / 400 `{ message: "투표가 거절되었습니다.", reason }` (예: `duplicate nullifier`, `unknown merkle root`, `vote proof failed`) / 404 선거 없음

## `POST /vote/confirm` — 삭제 (410)
학번(JWT)과 투표 트랜잭션·임시 공개키를 한 행에 저장해서, 서버가 "누가 누구에게"를 복원할 수 있었다.

## 데이터 형식

- `encryptedData` = `abi.encode(uint256 ciphertext)`
- `voterPubKey` = `abi.encode(uint256 ephPubX, uint256 ephPubY)` (BabyJubJub 임시 공개키)
- `nullifier` = `Poseidon(secret, scope)`, scope = 선거 컨트랙트 주소
- `merkleRoot` = 증명에 쓴 유권자 트리 root (컨트랙트가 최근 30개 root 를 인정)
