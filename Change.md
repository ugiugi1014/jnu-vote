# 설계 변경 정리 (원래 설계 → 현재 목표설계)

> 다이어그램 작업하면서 코드 확인 + 설계 보완으로 달라진 점 정리.
> 구분: **[구현필요]** = 코드 작업 해야 함 / **[명확화]** = 코드는 그대로, 이해/표기만 정리.

---

## 1. 컨트랙트 구조 — ElectionFactory 도입

- **원래**: prompt.md엔 "ElectionFactory 배포"가 있었지만 **실제 코드엔 팩토리 없음**. VotingSystem/VotingToken을 선거마다 수동 배포(Remix) 후 `POST /:id/contract`로 주소 등록.
- **변경 [구현필요]**: `ElectionFactory` 컨트랙트 신규. 선거마다 VotingSystem·VotingToken을 **EIP-1167 minimal proxy(clone)** 로 생성. `verifier.sol`은 **1회 배포 후 전 선거 공유**.
- **이유**: 선거별 격리(투표 상태·자격)는 필수인데 매번 풀 배포는 가스·관리 부담. clone이면 격리 유지 + 배포 비용 최소.
- **영향**: 새 `ElectionFactory.sol`, 백엔드 배포 로직, 다이어그램 `05`/`04`.

## 2. VotingToken 격리 방식

- **원래**: prompt.md는 `hasToken[electionId][addr]`로 선거별 토큰 관리. 실제 코드는 **electionId 없는 단일 ERC20**(잔액 기반) → 안 쓴 토큰이 다음 선거로 넘어가는 오염 위험.
- **변경 [구현필요]**: 토큰을 **선거별 clone**으로 격리(컨트랙트 자체가 격리 경계). electionId 매핑 불필요, 평범한 soulbound ERC20 유지.
- **이유**: 캡스톤 선거는 독립·순차라 "통합 명부"가 요구사항 아님 → 단순·완벽 격리가 유리.
- **참고**: soulbound = `transfer`/`approve`/`transferFrom` revert, decimals=0.

## 3. 배포·종료 흐름 (비대칭이 의도)

- **변경 [구현필요]**: 컨트랙트 배포 = **관리자 클릭(`POST /:id/deploy`) → 백엔드가 `createElection()` 자동 호출** (수동 Remix 배포 제거). 종료 = **스케줄러 자동(`end_time` 타임아웃)**.
- **이유**: 종료는 시간 조건이라 자동이 맞지만, 배포는 후보·명단·코디키 준비 완료라는 사람 판단이 선행돼야 함 → 트리거는 사람, 실행은 자동. (비대칭이 합리적)

## 4. 토큰 발급 모델 — 명단 기반 + lazy 발급 (가장 큰 변경)

- **원래**: "인증 완료자 전부에게 일괄 발급" → 선거별 자격 구분이 없음(공대 선거에 전교생 발급되는 문제).
- **변경 [구현필요]**:
  1. 관리자가 **학번 명단 업로드**(`POST /:id/voters`) → `voters`에 `(election_id, student_id)` 생성 = **선거별 자격 명단**, `total_voters` = 명단 수.
  2. 명단 중 **이미 등록(지갑 보유)+인증 완료자**만 즉시 `issueTokenBatch`.
  3. **미등록·신규 등록자**는 투표 진입 시 **lazy 발급**: `GET /:id/my-eligibility` → 백엔드가 명단·인증·토큰 판정 → 자격 O·토큰 X면 그 자리서 발급(체인 확정 대기) → 통과.
- **강제 로그아웃 안 함** (재로그인으로 토큰 받기 X — 타이밍 문제 못 풀고 UX 나쁨).
- **이유**: 선거별 자격 + 발급 시점(선거 준비 후) 문제를 동시 해결. "리스트만 받아 일괄 발급" 욕구 충족.
- **영향**: 새 엔드포인트 `POST /:id/voters`, `GET /:id/my-eligibility`. 다이어그램 `04`/`02`/`09`.

## 5. 재학 인증 vs 선거 자격 분리 [명확화]

- **인증**(KICA, `user_verifications`) = 전역·1회·영구. **선거 자격** = 명단(`voters`, 선거별).
- 최신 자격 판단은 **명단이 책임** (인증은 1회성이라 졸업/휴학 시점 문제는 캡스톤 범위에서 미처리).

## 6. 온체인 ZKP 검증 연결 [구현필요]

- **현재 코드**: `castVote`에 proof 파라미터 없음(`IVoteVerifier` 주석), `recordTally`도 tally proof 검증 안 함 → ZKP를 "만들기만" 하고 체인이 "검증"은 안 하는 상태.
- **목표설계(다이어그램 기준)**: `castVote(nullifier, proof, ...)` + `verifyProof` 실선 포함, `recordTally`도 tally proof 검증. (투표 테스트 후 개표 테스트 때 주석 해제 예정)
- **작업**: `snarkjs zkey export solidityverifier` → verifier 배포 → 컨트랙트 주석 해제·연결 → 프론트 castVote 호출부에 proof 추가.

## 7. 투표 흐름에 백엔드 confirm 단계 [명확화]

- 프론트가 체인에 `castVote` 직접 호출 → 받은 `txHash`를 `POST /vote/confirm`에 제출 → **백엔드가 체인에서 tx 재검증**(컨트랙트 주소·발신 지갑 일치) → `voter_public_key` 저장 + `has_voted` + `voted_count++`. (원래 다이어그램엔 없던 단계, 코드엔 있음)

## 8. 키 관리 명확화 [명확화]

- 백엔드가 쥔 키 **2종 구분**:
  - `ADMIN_WALLET_PRIVATE_KEY` (env): 컨트랙트 오너 지갑, 체인 서명용(토큰 발급·개표 기록).
  - `coord_private_key` (DB, 선거별): ECDH 복호화 키, **개표 후 NULL로 폐기**.
- **코디네이터 공개키는 온체인 등록 X** — 백엔드 DB 보관 + API 제공(`GET /:id/coordinator/public-key`). (prompt.md의 "체인 등록"에서 변경됨)

## 9. 기타 [명확화]

- **개표 트리거 2종**: 수동(`POST /:id/tally`) + 스케줄러 자동(`end_time`). 둘 다 `performTally`.
- **투표율 분모 = 명단 수**(`total_voters`). 미등록자는 미투표로 집계.
- **회로 고정 제약**: verifier 공유 → 전 선거가 같은 `vote.circom`/`tally.circom` 사용 → **후보 수 고정**(candidate_index 0~2, `tally.circom` CANDIDATES=3).
- **이중 격리**: 선거별 clone(컨트랙트 격리) + `secret=Poseidon(지갑키, electionID)`로 nullifier에 electionID 포함(매핑 격리) → 선거 간 간섭 불가.

---

## 구현 TODO 요약 (코드 작업 필요한 것)

- [ ] `ElectionFactory.sol` 작성 (clone 생성 + verifier 주입 + setVotingSystem)
- [ ] VotingToken/VotingSystem을 clone 가능하게 (constructor → initializer)
- [ ] 백엔드 `POST /:id/deploy` (팩토리 호출 + 주소 자동 등록)
- [ ] 백엔드 `POST /:id/voters` (학번 명단 → voters 생성 + total_voters)
- [ ] 백엔드 `GET /:id/my-eligibility` (명단·인증·토큰 판정 + lazy 발급)
- [ ] 온체인 ZKP 검증 연결 (verifier 배포 + castVote/recordTally 주석 해제 + 프론트 proof 전달)
- [ ] `voters`에 student_id 기반 명단 흐름 반영

## 영향받은 다이어그램

`02_seq_vote` · `04_seq_admin` · `05_contract_structure` · `08_election_state` · `09_data_model_erd` · `09a_data_model_worlds`