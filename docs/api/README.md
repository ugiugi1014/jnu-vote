# JNU Vote — 백엔드 API 명세

제주대학교 블록체인 전자투표 시스템 백엔드 API 레퍼런스.

## 베이스 URL

```
개발: http://localhost:8080
```

두 가지 prefix 가 동일하게 마운트되어 있음:

- `/` (예: `/auth/send-code`)
- `/api/` (예: `/api/auth/send-code`)

**프론트는 `/api/` prefix 사용 권장** (Vite proxy 설정과 일관성).

## 인증

대부분의 보호된 엔드포인트는 JWT 토큰을 헤더에 요구한다.

```http
Authorization: Bearer <JWT>
```

토큰은 `POST /auth/verify-code` 응답으로 발급되며, payload 는 `{ email, role }`. 만료 24h.

## 권한 레벨

| 레벨 | 미들웨어 | 설명 |
|---|---|---|
| **public** | - | 누구나 호출 가능 |
| **auth** | `auth` | 로그인 사용자 (역할 무관) |
| **admin** | `auth + adminOnly` | `role: "admin"` 토큰만 가능 (`ADMIN_EMAILS` 화이트리스트 기반) |

## 공통 응답 포맷

### 성공
```json
{
  "message": "처리 결과 메시지",
  "...": "추가 데이터"
}
```

### 에러
```json
{
  "message": "에러 사유",
  "error": "(선택) 추가 에러 정보"
}
```

## 공통 에러 코드

| 코드 | 의미 |
|---|---|
| 400 | 잘못된 요청 (필수값 누락, 형식 오류 등) |
| 401 | 인증 필요 (토큰 없음/만료) |
| 403 | 권한 부족 (예: 일반 사용자가 관리자 API 호출) |
| 404 | 리소스 없음 |
| 409 | 충돌 (예: 이미 등록된 지갑 주소와 다른 주소로 재등록) |
| 429 | Rate limit (인증 코드 잠금 등) |
| 500 | 서버 오류 |

## 엔드포인트 카테고리

| 카테고리 | 문서 |
|---|---|
| 인증 + 지갑 | [auth.md](./auth.md) — send-code, verify-code, /auth/wallet, /auth/me |
| 선거 + 후보자 | [elections.md](./elections.md) — CRUD, 컨트랙트 등록, 시작/종료, 코디네이터 키 |
| 유권자 + 토큰 | [voters.md](./voters.md) — 토큰 일괄 발행 |
| 학생증 인증 | [verification.md](./verification.md) — 제출, 심사, 파일 스트림 |
| 투표 | [vote.md](./vote.md) — 투표 확인 |
| 개표 | [tally.md](./tally.md) — 수동/자동 개표 |

## 흐름 요약

```
[유권자 등록]
  POST /auth/send-code             웹메일 입력 → 인증 코드 발송
  POST /auth/verify-code           코드 검증 → JWT + serverSecret 발급
  (프론트) KDF(웹메일+serverSecret) → 지갑 생성
  POST /auth/wallet                지갑 주소 백엔드 등록
  POST /verification/request       학생증 사진 제출
  ⏳ 관리자 승인 대기
  PATCH /verification/admin/:id    관리자 승인 → status: approved
  POST /elections/:id/tokens/issue 관리자 토큰 일괄 발행

[투표]
  POST /auth/verify-code           재로그인 (또는 토큰 유지 시 GET /auth/me)
  GET /elections/:id/coordinator/public-key  코디네이터 ECDH 공개키
  (프론트) ECDH + ZKP① + Poseidon 암호화 → castVote
  POST /vote/confirm               tx 검증 + voter_public_key 저장

[개표]
  end_time 도달 시 자동: status → closed → 자동 개표 (electionScheduler)
  또는 수동: POST /elections/:id/tally (admin)
  → ECDH 복호화 → 집계 → ZKP② proof → DB 저장 → 체인 recordTally
```

## 환경 변수

[server/.env.example](../../server/.env.example) 참고.

주요 항목:
- `DB_*`: MySQL 접속 정보
- `JWT_SECRET`: JWT 서명 키
- `MAIL_USER`, `MAIL_PASS`: Gmail SMTP (인증 코드 발송)
- `ADMIN_EMAILS`: 관리자 화이트리스트 (쉼표 구분)
- `CORS_ORIGINS`: 허용 origin (쉼표 구분)
- `RPC_URL`: 이더리움 RPC 엔드포인트
- `ADMIN_WALLET_PRIVATE_KEY`: 컨트랙트 호출용 관리자 지갑 개인키
- `TALLY_CIRCUIT_VOTES`, `TALLY_CIRCUIT_CANDIDATES`: tally 회로 크기
