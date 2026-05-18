# 인증 + 지갑 API

## `POST /auth/send-code`

이메일로 인증 코드 발송. 6자리 숫자, 5분 유효.

**권한**: public  
**요청**:
```json
{ "email": "20210001@stu.jejunu.ac.kr" }
```

**성공 (200)**:
```json
{ "message": "인증 코드가 발송되었습니다." }
```

**제약**:
- `@stu.jejunu.ac.kr` 도메인만 허용 (단, `ADMIN_EMAILS` 화이트리스트는 도메인 무관 통과)
- 같은 이메일 1분 내 재발급 차단 → 429
- 같은 이메일 30분 내 실패 시도 합계 10회 이상 시 잠금 → 429

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | 학교 이메일 아님 |
| 429 | 1분 내 재발송 / 30분 잠금 |
| 500 | 발송 실패 |

---

## `POST /auth/verify-code`

인증 코드 검증 + JWT 발급.

**권한**: public  
**요청**:
```json
{ "email": "20210001@stu.jejunu.ac.kr", "code": "123456" }
```

**성공 (200)**:
```json
{
  "message": "인증 성공",
  "token": "eyJhbGciOi...",
  "serverSecret": "abc123...(64자 hex)",
  "role": "user",
  "walletAddress": "0x... 또는 null",
  "verification": {
    "status": "none|pending|approved|rejected",
    "student_id": "20210001 또는 null",
    "note": "거절 사유 또는 null",
    "reviewed_at": "2026-05-13 12:00:00 또는 null"
  }
}
```

**필드 설명**:
- `token`: JWT (24h 유효). 프론트는 `localStorage.setItem("token", token)` 권장.
- `serverSecret`: KDF 지갑 생성용 (`createWallet(email, serverSecret)`).
- `role`: `admin` (`ADMIN_EMAILS` 일치) 또는 `user`.
- `walletAddress`: 이미 등록된 지갑 주소 (없으면 null). 첫 로그인 시 `POST /auth/wallet` 으로 등록.
- `verification.status`:
  - `none` — 미제출
  - `pending` — 심사 대기
  - `approved` — 승인 완료
  - `rejected` — 거절

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | 코드 불일치 / 만료 / 미발급 |
| 429 | 잠금 |

---

## `POST /auth/wallet`

KDF 로 만든 지갑 주소를 백엔드에 등록. **최초 1회만 허용** (등록 후 변경 불가).

**권한**: auth  
**요청**:
```json
{ "wallet_address": "0xabc...DEF" }
```

**검증**: `0x + 40자 hex` 형식만 허용.

**성공 — 최초 등록 (200)**:
```json
{
  "message": "지갑 주소 등록 완료",
  "wallet_address": "0xabc...def",
  "already_registered": false
}
```

**성공 — 이미 같은 주소 등록됨 (200, 멱등)**:
```json
{
  "message": "이미 등록된 지갑입니다.",
  "wallet_address": "0xabc...def",
  "already_registered": true
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | 잘못된 지갑 주소 형식 |
| 401 | 토큰 없음/만료 |
| 404 | 사용자 없음 (verify-code 안 거침) |
| 409 | 이미 다른 지갑 주소가 등록되어 있음. 응답에 `wallet_address` 로 기존 주소 반환 |

**참고**: 결정적 KDF 라 동일 입력 → 동일 주소. 정상 흐름에서는 409 가 발생하지 않음.

---

## `GET /auth/me`

토큰 기반 자기 정보 조회. 새로고침 자동 로그인 / 학생증 상태 폴링 용.

**권한**: auth  
**요청**: 없음

**성공 (200)**:
```json
{
  "email": "20210001@stu.jejunu.ac.kr",
  "role": "user",
  "walletAddress": "0xabc...def 또는 null",
  "verification": {
    "status": "approved",
    "student_id": "20210001",
    "note": null,
    "reviewed_at": "2026-05-15 10:23:45"
  }
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 401 | 토큰 없음/만료 |
| 404 | 사용자 없음 |

**활용**:
- 페이지 로드 시 localStorage 의 token 으로 호출 → 응답으로 세션 복원
- 401 응답 시 토큰 만료로 간주하고 로그인 페이지로 이동
- 학생증 심사 대기 중에 주기적으로 폴링 → status 갱신
