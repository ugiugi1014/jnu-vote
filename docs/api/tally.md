# 개표 API

선거 종료 후 ECDH 복호화 + ZKP② proof 생성 + 체인 기록.

## 자동 vs 수동

| 트리거 | 호출 위치 |
|---|---|
| **자동** | `services/electionScheduler.js` 가 `end_time` 도달 시 자동 호출 (`runAutoTally`) |
| **수동** | 관리자가 명시적으로 `POST /elections/:id/tally` 호출 |

둘 다 내부적으로 `services/tallyService.performTally(electionId)` 호출.

자동 트리거는 다음 케이스에 **조용히 스킵**:
- `contract_address` 미등록
- 투표 데이터 없음
- 후보 없음

관리자가 조건을 갖춘 후 수동 재호출 가능.

---

## `POST /elections/:id/tally`

수동 개표.

**권한**: admin  
**요청**: 없음

**전제 조건**:
- `election.status === 'closed'`
- `coord_private_key` 있음 (선거 생성 시 자동 생성됨)
- `contract_address` 있음
- 후보 ≥ 1
- 체인에 투표 데이터 ≥ 1

**처리 흐름**:
1. 체인에서 `getAllVotes()` 조회 → `[{ encryptedData, voterPublicKey }, ...]`
2. 각 vote 마다:
   - `encryptedData` → `{ ciphertext }`, `voterPublicKey` → `{ x, y }` 파싱
   - shared = `coord_private_key` * ephPub (BabyJubJub)
   - candidateID = ciphertext - Poseidon(shared.x, shared.y)
   - tally[candidateIndex]++
3. 표를 50개씩 배치로 나눠 ZKP② proof 생성 (`tally.circom`, snarkjs, 병렬)
4. 체인 `recordTallyBatch(k, ...)` 를 배치 순서대로 호출 (이미 기록된 배치는 건너뜀)
4. DB:
   - `tally_results` INSERT
   - `elections.status = 'tallied'`
   - `elections.coord_private_key = NULL` (사후 노출 차단)
5. 체인 `VotingSystem.recordTally(candidateIds, voteCounts)` 호출

**성공 (200)** — 전체 정상:
```json
{
  "message": "개표 완료 + ZKP proof 생성 + 체인 기록 완료",
  "electionId": "1",
  "tally": { "0": 42, "1": 31, "2": 18 },
  "proof": { "...": "..." },
  "publicSignals": ["..."],
  "tallyTxHash": "0x..."
}
```

**부분 성공 (200)** — DB 만 커밋, 체인 실패:
```json
{
  "message": "개표 완료 (DB) — 체인 기록 실패. recordTally 재시도 필요.",
  "electionId": "1",
  "tally": { ... },
  "proof": { ... },
  "publicSignals": [...],
  "tallyTxHash": null,
  "recordTallyError": "에러 메시지"
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | status 가 closed 아님 |
| 400 | coord_private_key 없음 (정상이라면 발생하지 않음) |
| 400 | contract_address 없음 |
| 400 | 후보 없음 / 투표 데이터 없음 |
| 401 / 403 | 인증/권한 |
| 404 | 선거 없음 |
| 500 | 복호화 실패 / ZKP proof 생성 실패 / DB 오류 |

---

## ZKP② 회로 입력 형식

[tally.circom](../../circuits/tally.circom) 입력:

배치 k 입력:
```json
{
  "coordPriv": "...",                  // 비밀
  "prevTally": ["..."x5], "prevSalt": "...", "newSalt": "...",   // 비밀
  "coordPubX": "...", "coordPubY": "...",
  "ciphertexts": ["...", ...],          // 50개 (배치 크기)
  "ephPubX": ["...", ...],
  "ephPubY": ["...", ...],
  "prevCommit": "...", "newCommit": "...",   // Poseidon(누적득표[5], salt)
  "isFinal": "0 | 1",
  "result": ["20","20","20","0","0"]         // 마지막 배치에서만 값, 그 외 0
}
```
공개 신호 160개: `[coordPubX, coordPubY, ciphertext[50], ephPubX[50], ephPubY[50], prevCommit, newCommit, isFinal, result[5]]`
salt_k = Poseidon(coordPriv, k+1). 첫 배치 prevCommit = Poseidon(0,0,0,0,0,0).

### 패딩 정책
마지막 배치의 남는 칸은 `ciphertext=0, ephPub=(0,1)` (BabyJubJub 항등원) 로 패딩.
컨트랙트 `recordTally` 도 같은 값을 요구한다 (규약 고정, 환경변수 조정 없음).

표 수 제한 없음 (배치 수 = ceil(표 수 / 50), 표 0개면 1배치).

---

## ZKP 회로 파일 경로

기본값: `server/zkp/build/`

| 항목 | 기본 경로 | 환경변수 |
|---|---|---|
| 빌드 디렉토리 | `server/zkp/build` | `ZKP_BUILD_DIR` |
| WASM | `<buildDir>/tally_js/tally.wasm` | `TALLY_WASM_PATH` |
| witness 생성 스크립트 | `<buildDir>/tally_js/generate_witness.js` | `TALLY_WITNESS_GEN_PATH` |
| zkey | `<buildDir>/tally.zkey` | `TALLY_ZKEY_PATH` |
| snarkjs 바이너리 | `snarkjs` (PATH) | `SNARKJS_BIN` |

회로 친구가 빌드한 산출물을 위 경로에 두면 동작.

---

## 컨트랙트 측 recordTally

```solidity
function recordTally(
    uint256[] calldata candidateIds,
    uint256[] calldata voteCounts
) external onlyElectionAdmin whenElectionClosed
```

- 길이 일치 확인
- 각 후보별 `tallyResult[candidateId] = voteCount` 저장
- `emit TallyRecorded(candidateId, voteCount)` 이벤트

> 현재는 proof 검증 안 함 (TODO). verifier.sol 통합 시 활성화 예정.

---

## `GET /elections/:id/result`

개표 완료된 선거 결과 조회.

**권한**: public  
**전제**: `election.status === 'tallied'`

**성공 (200)**:
```json
{
  "electionId": 1,
  "title": "...",
  "status": "tallied",
  "totalVotes": 91,
  "winner": {
    "candidate_id": 10,
    "candidate_index": 0,
    "name": "김제주",
    "vote_count": 42,
    "percentage": 46.15
  },
  "results": [
    { "candidate_id": 10, "candidate_index": 0, "name": "김제주",  "vote_count": 42, "percentage": 46.15 },
    { "candidate_id": 11, "candidate_index": 1, "name": "이한라",  "vote_count": 31, "percentage": 34.07 },
    { "candidate_id": 12, "candidate_index": 2, "name": "박성산",  "vote_count": 18, "percentage": 19.78 }
  ]
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | status 가 tallied 아님 |
| 404 | 선거 없음 / 결과 없음 |
