# 유권자 + 토큰 발급 API

## `POST /elections/:id/tokens/issue`

선거 시작 전(`pending`) 상태에서 **승인된 + 지갑 등록된 + 미발급** 유권자에게 ERC20 토큰 일괄 발행.

**권한**: admin  
**요청**:
```json
{ "emails": ["20210001@stu.jejunu.ac.kr", "..."] }
```

또는 빈 body / `emails` 생략 시: 조건 충족하는 **전체 사용자**에게 발급.

**선별 쿼리**:
```sql
WHERE uv.status = 'approved'
  AND us.wallet_address IS NOT NULL
  AND (v.token_issued_at IS NULL OR v.id IS NULL)
```

**처리 흐름**:
1. 대상 유권자 선별
2. `VotingToken.issueTokenBatch(walletAddresses)` 체인 호출
3. `voters` 테이블에 row INSERT/UPDATE (`token_issued_at = NOW()`)
4. `elections.total_voters` 갱신

**성공 (200)**:
```json
{
  "message": "유권자 등록 + 토큰 발급 완료",
  "electionId": "1",
  "count": 42,
  "txHash": "0x..."
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | `emails` 가 배열이 아님 / 빈 배열 / 학교 이메일 아님 |
| 400 | `token_contract_address` 미등록 |
| 400 | 발급 가능한 유권자 없음 (전부 미승인/지갑 미등록/이미 발급) |
| 400 | (emails 명시 시) 일부 유권자가 조건 불충족 |
| 401 / 403 | 인증/권한 |
| 404 | 선거 없음 |
| 500 | 체인 트랜잭션 실패 |

**주의**:
- 보통 `pending` 상태에서만 호출 (`AdminPage` UI 가 그렇게 노출)
- 백엔드 자체는 상태 제약 없음 — 정책 일치 필요시 라우터에 상태 체크 추가

---

## `GET /elections/:id/voters`

선거별 유권자 목록 (관리자용).

**권한**: admin

**성공 (200)**:
```json
[
  {
    "id": 1,
    "election_id": 1,
    "email": "20210001@stu.jejunu.ac.kr",
    "student_id": "20210001",
    "wallet_address": "0x...",
    "voter_public_key": "{...} 또는 null",
    "verification_status": "approved",
    "token_issued_at": "2026-03-20 09:00:00",
    "has_voted": false,
    "created_at": "..."
  }
]
```

> `voter_public_key` 는 투표 제출(`POST /vote/confirm`) 시점에 채워짐.

---

## 데이터 관계

```
user_verifications   ← 학생증 인증 (계정 단위, 한 번 approved 되면 재사용)
user_secrets         ← serverSecret + wallet_address (계정 단위, 최초 등록 후 변경 불가)
voters               ← 선거별 토큰 발급 + 투표 기록 (선거 단위)
```

`voters.wallet_address` 는 토큰 발급 시점에 `user_secrets.wallet_address` 에서 복사된 스냅샷.  
계정 단위로 변경 불가 정책이라 사실상 중복이지만, 선거 기록 보존 측면에서 의도된 비정규화.
