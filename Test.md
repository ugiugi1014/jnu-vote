# 테스트 진행표

> 기준: 실제 코드(`blockchain/contracts`, `server/src/routes`, `server/src/services`)를 확인해 작성한 단위/통합 테스트 체크리스트.
> 구분: **[자동]** = 명령어로 실행, **[수동]** = curl/Postman/UI 호출, **[관찰]** = 로그/DB/체인 상태 확인.
> 진행 순서: 0 환경 준비 -> 1 블록체인 단위 테스트 -> 2 백엔드 API 테스트 -> 3 통합 시나리오.

---

## 현재 요약

- [x] 블록체인 컨트랙트 단위 테스트 완료: `40/40 PASS` (2026-06-03)
- [x] `VotingToken`, `VotingSystem`, `ElectionFactory` 단위 테스트 커버리지 추가
- [x] vote ZKP verifier / tally ZKP verifier mock 분기 테스트 완료
- [x] 개표 결과 `recordTally` 체인 기록 시 tally proof 검증 흐름 테스트 완료
- [ ] 백엔드 API 테스트 대기: `server/.env`, MySQL 실행, DB schema 적용 필요
- [ ] E2E Happy Path 테스트 대기: 백엔드 API 테스트 완료 후 진행 권장

---

## 0. 환경 준비

백엔드 API와 통합 테스트 전 필수 조건이다. 하나라도 빠지면 Section 2 이후 테스트는 신뢰하기 어렵다.

- [ ] MySQL 8 실행
- [ ] DB schema 적용: `mysql -u root -p < server/src/db/schema.sql`
- [ ] 필요 시 migration 적용: `server/src/db/migrations/*.sql`
- [ ] `server/.env` 작성: `.env.example` 복사 후 실제 값 입력
- [ ] 필수 환경 변수 입력
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - `JWT_SECRET`
  - `MAIL_USER`, `MAIL_PASS`
  - `RPC_URL`
  - `ADMIN_WALLET_PRIVATE_KEY`
  - `FACTORY_ADDRESS`
- [ ] 관리자 지갑 가스비 확인
- [ ] vote verifier, tally verifier, ElectionFactory 배포 완료
- [ ] `FACTORY_ADDRESS`가 최신 Factory 주소를 가리키는지 확인
- [ ] ZKP tally 산출물 존재 확인
  - `zkp/build/tally.wasm`
  - `zkp/build/generate_witness.js`
  - `zkp/keys/tally_final.zkey`
- [ ] 백엔드 실행: `cd server && npm run dev`
- [ ] 프론트 실행: `cd front/user && npm run dev`

현재 로컬 확인 결과:

- `server/.env` 없음
- MySQL 프로세스 확인 안 됨
- `mysql` CLI 확인 안 됨

---

## 1. 블록체인 컨트랙트 단위 테스트 [자동]

실행 명령:

```bash
cd blockchain
npx hardhat test
```

최근 결과:

- 날짜: 2026-06-03
- 결과: `40 passing`
- 구성:
  - `VotingToken`: 13개
  - `VotingSystem`: 22개
  - `ElectionFactory`: 5개

### 1-1. VotingToken 13/13 PASS

- [x] 관리자가 토큰 발급 시 잔액이 1
- [x] 토큰 보유 시 `isTokenValid = true`
- [x] 토큰 미보유 시 `isTokenValid = false`
- [x] 관리자가 아니면 토큰 발급 불가
- [x] 같은 유권자에게 중복 발급 불가
- [x] `transfer` 차단
- [x] `decimals = 0`
- [x] `approve` 차단
- [x] `issueTokenBatch` 일괄 발급
- [x] 일괄 발급 중 이미 토큰이 있는 유권자는 skip
- [x] 관리자가 아니면 일괄 발급 불가
- [x] 빈 배열 일괄 발급 허용
- [x] VotingSystem이 아닌 주소에서 `burnToken` 호출 시 revert

### 1-2. VotingSystem 22/22 PASS

관리자/상태:

- [x] 초기화 후 `electionAdmin` 설정
- [x] owner가 `setElectionAdmin` 가능
- [x] owner가 아니면 `setElectionAdmin` 불가
- [x] 관리자가 선거 시작 가능
- [x] 관리자가 선거 종료 가능
- [x] 관리자가 아니면 선거 시작 불가
- [x] 이미 시작된 선거 재시작 불가
- [x] 열리지 않은 선거 종료 불가

투표:

- [x] 토큰 보유 유권자가 선거 중 투표 가능
- [x] `castVote` 성공 시 토큰 1개 burn
- [x] 토큰 없는 유권자는 투표 불가
- [x] 선거가 열리지 않으면 투표 불가
- [x] 같은 nullifier 재사용 불가
- [x] 다른 nullifier는 독립 투표 가능
- [x] vote verifier가 false면 `castVote` revert

개표:

- [x] 선거 종료 후 관리자가 `recordTally` 호출 가능
- [x] 선거 진행 중 `recordTally` 불가
- [x] 후보/득표 배열 길이 불일치 시 실패
- [x] 후보 수가 tally 회로 기준과 다르면 실패
- [x] publicSignals의 voteCount 매핑 불일치 시 실패
- [x] tally verifier가 false면 `recordTally` revert
- [x] 관리자가 아니면 `recordTally` 불가

### 1-3. ElectionFactory 5/5 PASS

- [x] `createElection`은 owner만 호출 가능
- [x] VotingSystem clone 생성 확인
- [x] VotingToken clone 생성 확인
- [x] 같은 `electionId` 재배포 차단
- [x] VotingSystem에 vote verifier / tally verifier 주소 주입 확인
- [x] VotingToken에 VotingSystem 소각 권한 연결 확인

### 1-4. 테스트 커밋

- `8c286c2 test: add blockchain unit test coverage`
- `1293a8a test: add election factory unit coverage`

---

## 2. 백엔드 API 단위 테스트 [수동]

Postman 또는 curl로 진행한다. 보호된 API는 `Authorization: Bearer <token>` 헤더가 필요하다.
관리자 API는 `ADMIN_EMAILS`에 포함된 이메일로 로그인해 발급받은 JWT가 필요하다.

### 2-1. 인증 흐름 (`server/src/routes/auth.js`)

- [ ] `POST /auth/send-code`: 제주대 학생 이메일 또는 관리자 이메일이면 200
- [ ] 일반 외부 이메일은 4xx
- [ ] 관리자 화이트리스트 이메일은 도메인 예외로 200
- [ ] OTP 5회 실패 시 잠금 처리 확인
- [ ] `POST /auth/verify-code`: 정상 코드면 `{ token, serverSecret, walletAddress, verification, role }` 반환
- [ ] 만료 코드면 4xx
- [ ] `POST /auth/wallet`: 최초 지갑 주소 등록 성공
- [ ] 다른 지갑 주소로 재등록 시 409
- [ ] 같은 지갑 주소 재호출은 성공 처리
- [ ] `GET /auth/me`: 세션 복원용 사용자 정보 반환

### 2-2. 재학증명서 인증 (`server/src/routes/verification.js`)

- [ ] `POST /verification/request`: 파일 + `student_id` + `doc_no` 제출
- [ ] `doc_no` 중복 사용 시 409
- [ ] KICA 검증 성공 시 `approved`
- [ ] KICA 검증 실패 시 400
- [ ] KICA 서버 접근 실패 시 `pending` fallback
- [ ] `GET /verification/me`: 내 인증 상태 조회
- [ ] `GET /verification/admin?status=pending`: 관리자 대기 목록 조회
- [ ] `GET /verification/admin/:id/file`: 업로드 파일 조회
- [ ] `PATCH /verification/admin/:id`: 승인/거절 상태 변경
- [ ] 비관리자 토큰으로 관리자 API 호출 시 403

### 2-3. 선거 관리 (`server/src/routes/elections.js`)

- [ ] `POST /elections`: 선거 생성, `election_id`, `coord_public_key` 반환
- [ ] DB에 `coord_private_key` 저장 확인
- [ ] `PUT /elections/:id/candidates/bulk`: pending 상태에서 후보 일괄 등록
- [ ] active 이후 후보 수정 제한 확인
- [ ] `POST /elections/:id/deploy`: Factory 호출 후 VotingSystem/VotingToken 주소 DB 저장
- [ ] `POST /elections/:id/start`: pending -> active
- [ ] `POST /elections/:id/close`: active -> closed
- [ ] `GET /elections/:id/coordinator/public-key`: 프론트 암호화용 공개키 반환
- [ ] `DELETE /elections/:id`: pending 상태만 삭제 가능

### 2-4. 유권자 명단 + 토큰 발급

- [ ] `POST /elections/:id/voters/bulk`: 학생 식별자 명단 upsert
- [ ] 명단 중 인증+지갑 보유자는 즉시 `issueTokenBatch` 호출
- [ ] 아직 인증/지갑 조건이 안 된 사용자는 pending으로 남김
- [ ] `POST /elections/:id/tokens/issue`: 별도 일괄 발급 API 동작 확인
- [ ] 발급 성공 시 `issued`, `pending`, `txHash` 확인

### 2-5. 투표 자격 조회 (`GET /elections/:id/my-eligibility`)

- [ ] 선거 없음: `reason = election_not_found`
- [ ] 선거가 active가 아님: `reason = election_not_active`
- [ ] 유권자 명단에 없음: `reason = not_in_voter_list`
- [ ] 인증 미완료: `reason = not_verified`
- [ ] 지갑 미등록: `reason = wallet_not_registered`
- [ ] 인증+지갑 완료지만 voters row 없음: 자동 생성
- [ ] 토큰 컨트랙트 미설정: `reason = token_contract_not_set`
- [ ] 자격 있음 + 토큰 없음: lazy token issue 후 eligible
- [ ] 이미 토큰 있음: 즉시 eligible
- [ ] 이미 투표함: `reason = already_voted`

### 2-6. 투표 확인 (`server/src/routes/vote.js`)

- [ ] `POST /vote/confirm`: castVote txHash 검증 후 DB 반영
- [ ] 정상 처리 시 `voter_public_key` 저장
- [ ] 정상 처리 시 `has_voted = TRUE`
- [ ] 정상 처리 시 `voted_count` 증가
- [ ] txHash 형식 오류는 4xx
- [ ] tx 발신 지갑이 계정 지갑과 다르면 거절

### 2-7. 개표 (`server/src/routes/tally.js`, `server/src/services/tallyService.js`)

- [ ] `POST /elections/:id/tally`: closed 상태에서만 개표 가능
- [ ] ECDH 복호화 후 후보별 득표 집계
- [ ] tally ZKP proof 생성
- [ ] `recordTally` 호출 시 proof + publicSignals를 체인에 전달
- [ ] 체인에서 tally proof 검증 성공 시 `TallyRecorded` 기록
- [ ] DB `tally_results` 저장
- [ ] DB `elections.status = tallied`
- [ ] DB `coord_private_key = NULL`로 폐기
- [ ] pending/active 상태에서는 개표 거절
- [ ] 컨트랙트 주소 미설정 시 개표 거절
- [ ] 투표 데이터 0건이면 정상 skip 또는 정책대로 처리 확인
- [ ] 체인 기록 실패 시 DB 상태가 잘못 tallied로 고정되지 않는지 확인
- [ ] `GET /elections/:id/result`: tallied 상태에서 후보별 득표/당선자 반환
- [ ] tallied 전 결과 조회는 4xx

### 2-8. 자동 개표 스케줄러 (`server/src/services/electionScheduler.js`) [관찰]

- [ ] 서버 시작 시 미완료 선거 스케줄 복원 로그 확인
- [ ] `end_time` 도달 시 active -> closed
- [ ] `performTally` 자동 호출 확인
- [ ] 자동 개표 후 DB `status = tallied`
- [ ] 자동 개표 후 DB `coord_private_key = NULL`
- [ ] 체인 `TallyRecorded` 이벤트 확인

---

## 3. 통합 시나리오

### 3-1. Happy Path

```text
관리자
1. POST /elections
2. PUT /elections/:id/candidates/bulk
3. POST /elections/:id/deploy
4. POST /elections/:id/start
5. POST /elections/:id/voters/bulk

학생
6. POST /auth/send-code
7. POST /auth/verify-code
8. POST /auth/wallet
9. POST /verification/request
10. GET /elections/:id/my-eligibility
11. GET /elections/:id/coordinator/public-key
12. 프론트에서 ECDH 암호화 + vote ZKP 생성
13. 체인 castVote 직접 호출
14. POST /vote/confirm

개표
15. end_time 도달 자동 개표 또는 POST /elections/:id/tally
16. GET /elections/:id/result
17. DB 결과 합계와 voted_count 일치 확인
18. 체인 TallyRecorded 이벤트 확인
```

- [ ] 관리자 1~5 완료
- [ ] 학생 6~14 완료
- [ ] 개표 15 완료
- [ ] 결과 조회 16 완료
- [ ] 결과 합계와 `voted_count` 일치
- [ ] 체인 기록 확인

### 3-2. KICA 검증 분기

- [ ] 유효한 `doc_no`: 자동 승인
- [ ] 유효하지 않은 `doc_no`: 즉시 거절
- [ ] KICA 서버 접근 실패: pending fallback
- [ ] 관리자 수동 승인/거절 가능

### 3-3. 투표 자격 분기

- [ ] 선거 없음
- [ ] 선거 비활성
- [ ] 명단 없음
- [ ] 인증 미완료
- [ ] 지갑 미등록
- [ ] 토큰 컨트랙트 미설정
- [ ] lazy token issue 성공
- [ ] 이미 투표함

### 3-4. 자동 개표

- [ ] `end_time`을 짧게 설정한 선거 생성
- [ ] 후보 등록, 컨트랙트 배포, 선거 시작
- [ ] 유권자 1명 이상 투표
- [ ] 종료 시각 도달 후 스케줄러 로그 확인
- [ ] DB `status = tallied`
- [ ] DB `coord_private_key = NULL`
- [ ] 체인 `TallyRecorded` 이벤트 확인

### 3-5. 실패 복구

- [ ] `recordTally` 체인 호출 실패 시 에러 로그 확인
- [ ] 체인 호출 실패 시 결과 상태가 잘못 완료 처리되지 않는지 확인
- [ ] 컨트랙트 미배포 상태에서 자동 개표가 안전하게 skip되는지 확인
- [ ] nullifier 중복 투표 시 체인 revert
- [ ] 토큰 transfer 시 revert

---

## 4. 다음 추천 순서

1. `server/.env` 작성
2. MySQL 설치/실행 및 schema 적용
3. 백엔드 서버 실행 확인
4. Section 2-1 인증 API부터 순서대로 테스트
5. Section 2 전체 통과 후 Happy Path 진행

---

## 5. 실행 명령 모음

```bash
# 블록체인 단위 테스트
cd blockchain
npx hardhat test

# 백엔드 실행
cd server
npm run dev

# 프론트 실행
cd front/user
npm run dev

# DB 초기화
mysql -u root -p < server/src/db/schema.sql
```

---

마지막 업데이트: 2026-06-03
