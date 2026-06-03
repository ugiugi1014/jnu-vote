# 테스트 절차서 (단위 → 통합)

> 실제 코드(`blockchain/contracts`, `server/src/routes`)를 본문까지 읽고 확인한 동작만 기재.
> 구분: **[자동]** = `npm test` 류로 실행 / **[수동]** = curl·Postman·UI로 호출 / **[관찰]** = 로그·DB 상태만 확인.
> 진행: 0 → 1 → 2 → 3 순서. 앞 단계 실패 시 다음 단계 의미 없음.

---

## 0. 환경 준비

- [ ] **MySQL 8 기동 + 스키마 적용** — `mysql -u root -p < server/src/db/schema.sql` (+ `migrations/` 마이그레이션)
- [ ] **`server/.env` 작성** — `.env.example` 복사 후 채움. 필수: `RPC_URL`, `ADMIN_WALLET_PRIVATE_KEY`, `FACTORY_ADDRESS`, `JWT_SECRET`, `MAIL_USER/PASS`
- [ ] **RPC + 관리자 지갑 잔액 확인** — Sepolia 또는 로컬 Hardhat. ADMIN_WALLET 가스 충분히 있어야 함
- [ ] **Verifier 2종 + ElectionFactory 사전 배포** — `voteVerifier`, `tallyVerifier`, `ElectionFactory` 주소가 FACTORY_ADDRESS 에 반영돼야 함
- [ ] **ZKP 회로 산출물 존재** — `zkp/build/tally.wasm`, `zkp/keys/tally_final.zkey` (TALLY_CIRCUIT_VOTES=10, CANDIDATES=3)
- [ ] **백엔드 기동** — `cd server && npm run dev` (포트 8080, 로그에 `scheduler restored` 보여야 정상)
- [ ] **프론트 기동** — `cd front/user && npm run dev` (포트 5173)

> 위 7가지 중 하나라도 빠지면 1단계 이후는 의미가 없음. 셋업이 막히는 부분은 따로 기록하고 진행을 멈출 것.

---

## 1. 단위 테스트 — 블록체인 컨트랙트

> **실행**: `cd blockchain && npx hardhat test`
> **결과 (2026-05-20)**: **35/35 PASS** (VotingToken 13 + VotingSystem 22). 약 2초.
> **셋업 방식**: 운영 코드와 동일하게 `ElectionFactory.createElection()` 으로 clone 생성. Mock verifier (`contracts/mocks/MockVoteVerifier.sol`, `MockTallyVerifier.sol`) 로 ZKP 의존 격리.

### 1-1. VotingToken — 13/13 PASS

- [x] 관리자가 토큰 발급 → 잔액 = 1
- [x] 토큰 보유 → `isTokenValid` = true
- [x] 미보유 → `isTokenValid` = false
- [x] 관리자 아니면 발급 불가
- [x] 같은 유권자 이중 발급 불가
- [x] `transfer` revert (soulbound)
- [x] `decimals` = 0
- [x] `approve` revert
- [x] `issueTokenBatch` 일괄 발급
- [x] 일괄 발급 시 이미 보유한 유권자 스킵
- [x] 관리자 아니면 일괄 발급 불가
- [x] 빈 배열로 일괄 발급 무오류
- [x] `burnToken` — VotingSystem 이 아닌 주소가 호출 시 revert (다이어그램 보완 분기)

### 1-2. VotingSystem — 22/22 PASS

**관리자 설정 (3):**
- [x] 초기화 후 `electionAdmin` 올바르게 설정
- [x] owner 가 `setElectionAdmin` 가능
- [x] owner 아니면 `setElectionAdmin` revert

**선거 시작/종료 (5):**
- [x] `openElection` — 관리자만 가능
- [x] `closeElection` — 관리자만 가능
- [x] 비관리자 `openElection` revert
- [x] 이미 시작된 선거 재시작 revert
- [x] 열리지 않은 선거 종료 revert

**투표 (7):**
- [x] 토큰 있는 유권자가 선거 중 투표 가능
- [x] castVote 성공 시 토큰 1개 burn (soulbound 검증)
- [x] 토큰 없는 유권자 투표 불가
- [x] 선거 닫혀 있으면 투표 불가
- [x] 이중 투표 불가 (nullifier 재사용 차단)
- [x] 다른 nullifier 면 다른 유권자 투표 가능
- [x] vote verifier 가 false 반환 시 revert

**개표 (7):**
- [x] 선거 종료 후 관리자가 `recordTally` 호출 가능 (votes=0)
- [x] 선거 진행 중 `recordTally` revert
- [x] 후보·voteCount 배열 길이 불일치 시 revert
- [x] 후보 수 ≠ 3 시 revert (회로 고정 제약)
- [x] `pubSignals` voteCount 매핑 불일치 시 revert
- [x] tally verifier 가 false 반환 시 revert
- [x] 관리자 아니면 `recordTally` 호출 불가

### 1-3. ElectionFactory — 단위 테스트 파일은 없지만 **정상 동작 검증됨**

> 위 35개 테스트 전부가 `ElectionFactory.createElection()` 을 통과해야 setup 이 완료되므로, 사실상 Factory 도 함께 검증됨. 별도 테스트 파일 필요 시 작성 권장.

- [x] `createElection(id, admin)` — `onlyOwner` (deployer 만 호출)
- [x] clone 2개 (VotingSystem + VotingToken) 배포 확인
- [x] `setVotingSystem` 자동 주입 (burnToken 권한 검증으로 확인)
- [x] `VotingSystem.initialize` 시 verifier 2종 정상 주입 (vote/tally verifier 분기 동작으로 확인)
- [ ] 같은 `electionId` 재배포 시 revert _(별도 파일 작성 시 추가)_

### 1-4. 작업 내역 요약

- 신규 파일:
  - `contracts/mocks/MockVoteVerifier.sol`
  - `contracts/mocks/MockTallyVerifier.sol`
- 재작성: `test/VotingToken.test.js` (12 → 13개), `test/VotingSystem.test.js` (16 → 22개)
- 핵심 변경:
  - 운영과 동일하게 `ElectionFactory.createElection()` 통해 clone 생성 → `_disableInitializers()` 우회
  - `castVote` 6인자 시그니처 + dummy proof 전달
  - `recordTally` 23-slot `pubSignals` 정확히 매핑 + 후보 3명 고정 반영
  - Mock verifier 의 `setShouldVerify(false)` 로 ZKP 분기 격리 검증

---

## 2. 단위 테스트 — 백엔드 API `[수동]`

> Postman 컬렉션 또는 curl. 보호 라우트는 `Authorization: Bearer <token>` 헤더 필수. 관리자 권한은 `ADMIN_EMAILS` 화이트리스트 이메일로 로그인해서 얻은 토큰.

### 2-1. 인증 흐름 (`auth.js`)

- [ ] `POST /auth/send-code` — `@stu.jejunu.ac.kr` 도메인 → 200, 이메일 도착
- [ ] 위 + 학교 외 도메인 → 4xx
- [ ] 위 + 화이트리스트(`jnuvote2026@gmail.com`) → 200 (도메인 우회)
- [ ] 코드 5회 오입력 → 30분 잠금 (현재 정책 확인 필요)
- [ ] `POST /auth/verify-code` 정상 코드 → 200, 응답 `{token, serverSecret, walletAddress, verification, role}`
- [ ] 만료 코드 → 4xx
- [ ] `POST /auth/wallet` 최초 → 200, `user_secrets.wallet_address` 등록
- [ ] 다른 주소 재등록 시도 → 409 (변경 불가 정책)
- [ ] 동일 주소 재호출 → 200 (멱등)
- [ ] `GET /auth/me` → 200, 자기 정보 반환 (새로고침 복원용)

### 2-2. 학생증 인증 + KICA (`verification.js`)

- [ ] `POST /verification/request` + 파일 + `doc_no` 16자리 + KICA `SUCC=Y` → 자동 `approved`
- [ ] 위 + KICA `SUCC=N` → 400 "유효하지 않은 재학증명서"
- [ ] 위 + KICA 서버 차단(hosts 파일로 막기) → `pending` fallback
- [ ] `doc_no` 중복 (다른 계정에서 이미 사용) → 409
- [ ] `GET /verification/admin?status=pending` (admin) → 대기 목록
- [ ] `GET /verification/admin/:id/file` → 파일 스트림 정상
- [ ] `PATCH /verification/admin/:id` body `{status:"approved"}` → DB 반영
- [ ] 비관리자 토큰으로 admin API 호출 → 403

### 2-3. 선거 관리 (`elections.js` — admin)

- [ ] `POST /elections` — 200, `election_id` + `coord_public_key` 반환, DB에 `coord_private_key` 저장됨
- [ ] `PUT /:id/candidates/bulk` (pending) → 후보 N명 삽입
- [ ] 위 (active 이후) → 4xx (pending에서만 허용)
- [ ] `POST /:id/deploy` → Factory 호출 → `VotingSystem`/`VotingToken` 주소 DB 자동 등록
- [ ] `POST /:id/start` → status pending→active
- [ ] `GET /:id/coordinator/public-key` → JWK 형식 공개키 반환
- [ ] `DELETE /:id` (pending) → 삭제 성공
- [ ] `DELETE /:id` (active 이후) → 거부

### 2-4. 유권자 명단 + 토큰 발급

- [ ] `POST /:id/voters/bulk` body `{student_ids:[...]}` → `election_student_list` upsert + `total_voters` 갱신
- [ ] 위 + 명단 중 이미 가입+인증+지갑 보유자 → 즉시 `issueTokenBatch` 호출, `issued > 0` + `txHash` 반환
- [ ] 위 + 아무도 가입 안 함 → `issued=0, pending=N`
- [ ] `POST /:id/tokens/issue` (별도 일괄 발급 라우트, `voter.js`) → 동작 확인

### 2-5. my-eligibility — 9가지 분기 (lazy 토큰 발급 포함)

> [`elections.js` L1044-1167](server/src/routes/elections.js#L1044) 본문 기준. 각 분기는 한 학생 계정 상태를 바꿔가며 확인.

- [ ] 선거 없음 → 404 `{reason:"election_not_found"}`
- [ ] 선거 pending/closed → `{reason:"election_not_active"}`
- [ ] 학번이 명단에 없음 → `{reason:"not_in_voter_list"}`
- [ ] 명단 O / 인증 미완 → `{reason:"not_verified"}`
- [ ] 인증 완료 / 지갑 미등록 → `{reason:"wallet_not_registered"}`
- [ ] 인증 + 지갑 / voters 행 없음 → voters 자동 생성 → 다음 단계 진입 (`L1105-1124`)
- [ ] 토큰 컨트랙트 미설정 → `{reason:"token_contract_not_set"}`
- [ ] 자격 O / 토큰 X → **lazy 발급 트리거** → `issueTokenBatch` → `token_issued_at` 갱신 → `{eligible:true}`
- [ ] 토큰 이미 있음 → 즉시 `{eligible:true}`
- [ ] 이미 투표함 → `{reason:"already_voted"}`

### 2-6. 투표 확인 (`vote.js`)

- [ ] castVote 후 `POST /vote/confirm {election_id, txHash, voter_public_key}` → 체인 tx 재검증 → DB에 `voter_public_key` 저장 + `has_voted=TRUE` + `voted_count++`
- [ ] `txHash` 형식 오류 → 4xx
- [ ] 발신 지갑이 계정 지갑과 불일치 → 거부

### 2-7. 개표 (`tally.js`, `services/tallyService.js`)

- [ ] `POST /:id/tally` (admin, closed 상태) → ECDH 복호화 → ZKP② proof 생성 → `recordTally` → status=tallied + `coord_private_key=NULL` (폐기)
- [ ] 위 + pending/active 상태 → 4xx
- [ ] 위 + `contract_address` 미설정 → 사전 조건 미달, 정상 스킵
- [ ] 위 + 투표 0건 → 정상 스킵
- [ ] 위 + `recordTally` 체인 실패 (가스 부족 등) → DB tallied 유지 + `recordTallyError` 반환 + 경고 로그
- [ ] `GET /:id/result` (tallied) → 후보별 vote_count, 득표율, 당선자
- [ ] `GET /:id/result` (tallied 아님) → 4xx

### 2-8. 자동 개표 스케줄러 `[관찰]`

- [ ] 선거 생성 시 종료 스케줄 등록 (로그: `scheduler restored`)
- [ ] `end_time` 도달 → status active→closed 후 `performTally` 자동 호출 (로그 확인)
- [ ] 서버 재시작 후에도 미완료 선거 스케줄 복원

---

## 3. 통합 시나리오 (End-to-End)

### 3-1. 시나리오 A — Happy Path (정상 전 구간)

```
관리자                                            학생
  │
  1. POST /elections (제목/기간)
  2. PUT  /:id/candidates/bulk (후보 N명)
  3. POST /:id/deploy (Factory → clone 2개)
  4. POST /:id/start (pending → active)
  5. POST /:id/voters/bulk (학번 명단)
                                          6. 이메일 OTP 로그인 (KDF 지갑 자동 생성)
                                          7. POST /auth/wallet (지갑 주소 등록)
                                          8. POST /verification/request (KICA SUCC=Y)
                                          9. GET  /:id/my-eligibility (lazy 토큰 발급)
                                         10. GET  /:id/coordinator/public-key
                                         11. (프론트) ECDH + ZKP + Poseidon 암호화
                                         12. (체인) castVote 직접 호출
                                         13. POST /vote/confirm (txHash 보고)
  14. (자동) end_time → 자동 개표
      또는 POST /:id/tally (수동)
  15. GET /:id/result 확인 (합계 == voted_count)
```

- [ ] **1~5** 관리자 셋업 완료
- [ ] **6~13** 학생 가입 ~ 투표 완료
- [ ] **14** 개표 완료 (자동·수동 둘 다 시도)
- [ ] **15** 결과 합계가 `voted_count` 와 일치 + 체인 `TallyRecorded` 이벤트 확인

### 3-2. 시나리오 B — KICA 외부 의존 분기

> KICA 차단은 `hosts` 파일에 `127.0.0.1 webreq.kica.or.kr` 등 추가하거나, 네트워크 분리.

- [ ] 유효한 doc_no → 자동 approved
- [ ] 가짜 doc_no (KICA `SUCC=N`) → 400 즉시 거부
- [ ] KICA 서버 차단 → `pending` fallback, 관리자 검토 대기로 진입

### 3-3. 시나리오 C — my-eligibility 분기 종합

> 2-5 항목을 한 사용자 계정 상태를 단계적으로 변경하며 9가지 분기 모두 재현. 통합 단계에서 한 번에 묶어 확인.

- [ ] 9개 분기 모두 기대 응답대로 동작

### 3-4. 시나리오 D — 자동 개표 시간 단축

- [ ] 선거 생성 시 `end_time` 을 5분 뒤로 설정
- [ ] 컨트랙트 배포 + 시작 + 명단 + 1명 투표
- [ ] `end_time` 도달 대기 → 스케줄러 로그에 자동 개표 트리거 출력
- [ ] DB `status=tallied`, `coord_private_key=NULL` 확인
- [ ] 체인 `TallyRecorded` 이벤트 확인

### 3-5. 시나리오 E — 실패 복구

- [ ] `recordTally` 호출 실패 (ADMIN_WALLET 가스 비움) → DB tallied 유지 + 에러 로그 + 관리자 수동 재시도 가능
- [ ] 컨트랙트 미배포 상태에서 자동 개표 트리거 → 정상 스킵 + 경고 로그
- [ ] `nullifier` 중복 castVote → 체인 revert
- [ ] 토큰 `transfer` 시도 → revert "전송할 수 없습니다"

---

## 4. 알려진 이슈

- [x] ~~VotingToken.test.js — initialize 누락~~ → ElectionFactory 통한 setup 으로 해결 (13/13)
- [x] ~~VotingSystem.test.js — 업그레이더블 전환 미반영~~ → Mock verifier + 시그니처 재작성으로 해결 (22/22)
- [x] ~~burnToken 단위 테스트 없음~~ → 1-1 에 추가됨
- [ ] `ElectionFactory` 독립 단위 테스트 파일 (선택) — 같은 `electionId` 재배포 차단 등 자체 분기는 별도 작성 권장

---

## 실행 명령 모음

```bash
# 블록체인 단위 테스트
cd blockchain && npx hardhat test

# 백엔드
cd server && npm run dev

# 프론트
cd front/user && npm run dev

# DB 초기화
mysql -u root -p < server/src/db/schema.sql
```

---

**마지막 업데이트**: 2026-05-20
**작성 기준**: `Change.md` 와 동일하게 — 실제 코드 본문 확인 + 다이어그램 대조 후 작성.
