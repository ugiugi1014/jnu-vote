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
---

## 집계 무결성 보완 (branch: fix/tally-integrity)

배경: ZKP②(tally proof)는 "관리자를 믿지 않아도 집계가 맞다"를 보장해야 하는데, 기존 회로/컨트랙트에서는 아래 공격이 가능했다.

### 발견한 문제
1. **표 누락 공격**: tally.circom의 `sharedKeys`는 비공개 입력이고 ECDH 결과인지 검증하지 않는다. 관리자가 특정 표에 가짜 공유키를 넣으면 그 표는 거대값으로 복호화되어 어느 후보에도 집계되지 않고, 증명은 정상 통과한다. (witness 테스트로 재현: 기존 회로 PASS)
2. **비트 분해 aliasing**: `Num2Bits(254)`는 x와 x+p 두 가지 분해를 허용한다. 증명자가 다른 분해를 고르면 XOR 복호화 결과가 바뀔 수 있다 (일부 표에서 후보 변경 가능).
3. **개표 DoS (컨트랙트)**: castVote가 `encryptedData` 형식을 확인하지 않아, 형식이 깨진 데이터 1건만 들어와도 recordTally의 `abi.decode`가 영구 revert. 필드 범위(p) 이상 값이나 51번째 표도 같은 결과.

### 수정
- `circuits/tally.circom`
  - 실제 표(nonce, ciphertext가 모두 0이 아닌 슬롯)는 반드시 후보 0~4 중 정확히 하나로 복호화되어야 한다는 제약 추가. 패딩 슬롯(0,0)만 예외.
  - `Num2Bits(254)` -> `Num2Bits_strict()`.
  - 공개 입력 개수/순서 변경 없음 (여전히 105개) -> 백엔드/프론트 코드 수정 불필요.
  - constraint 수: 50,600 -> 76,950.
- `blockchain/contracts/VotingSystem.sol`
  - castVote: `abi.decode(uint256,uint256)` 형식 검증, (0,0) 거절, 필드 범위 검사, 용량(50표) 초과 거절.
  - recordTally: 득표 합계 == 투표 수 검사 (회로 제약과 이중 방어).
- 테스트: `circuits/test/tally_integrity.js`(회로 공격 재현), `blockchain/test/VotingSystem.test.js`(105 슬롯/5후보 레이아웃으로 정리 + 무결성 테스트 4개).

### 재배포 시 필요한 작업 [구현필요]
1. `circom circuits/tally.circom --r1cs --wasm -o zkp/build`
2. 기존에 쓰던 ptau(2^17 이상)로 `snarkjs groth16 setup` -> `zkey contribute` -> `zkey export verificationkey` -> `zkey export solidityverifier` (TallyVerifier.sol 교체)
3. VotingSystem impl, TallyVerifier, ElectionFactory 재배포 (CLAUDE.md 재배포 순서 참고), FACTORY_ADDRESS / ABI 교체

### 남은 한계 (다음 단계)
- 투표자가 일부러 유효하지 않은 후보 번호를 암호화해 넣으면 tally 회로를 만족시킬 수 없어 개표가 막힌다. ZKP①(voteProof)이 암호문과 묶여 있지 않기 때문. -> 2단계(BabyJubJub ECDH + voteProof 내 암호화 검증)에서 해결.
- 개표 용량 50표 -> 3단계(배치 집계 + 공개 입력 해시 압축)에서 해결.

---

## 2단계: BabyJubJub ECDH + 회로 내 공유키 계산 (branch: feat/babyjub-ecdh)

배경: 1단계 이후에도 (a) ZKP①이 암호문과 묶여 있지 않아 투표자가 무효 값을 넣으면 개표가 막히고, (b) tally 회로가 공유키를 비공개 입력으로 받아 "아무 공유키"나 넣을 수 있었다. P-256(Web Crypto)은 회로 안에서 계산할 수 없어서 생긴 구조적 한계.

### 설계
- 곡선 교체: Web Crypto P-256 -> **BabyJubJub** (BN254 스칼라 필드 위의 곡선, 회로 내 연산 가능). circomlibjs 에 이미 포함 -> 추가 번들 없음.
- 암호화: `ciphertext = candidateId + Poseidon(shared.x, shared.y)` (mod p). XOR/비트분해 제거, nonce 제거(임시 키가 매번 새로움).
- **voteProof.circom**: nullifier + 후보 범위(Num2Bits(8) 선행으로 8비트 비교기 우회 차단) + `ephPub = ephPriv*Base8` + `shared = ephPriv*coordPub` + 암호문 바인딩.
- **tally.circom**: `coordPub = coordPriv*Base8` 검증, 표마다 `shared = coordPriv*ephPub` 를 회로 안에서 계산, 실제 표는 정확히 한 후보로 복호화.
- **VotingSystem**: `configureElection(coordPubX, coordPubY, numCandidates)` (시작 전 1회, 표가 들어오면 변경 불가), castVote 형식/필드/패딩 표식 검사 + voteProof 공개 신호를 체인 저장값과 대조, recordTally 는 157개 공개 신호를 저장된 표와 하나씩 대조, `tallied` 후 재기록 불가.
- **서버**: BabyJubJub 키 생성/복호화, 선거 시작 시 configureElection, **체인 기록 성공 후에만 DB 커밋 + 코디 개인키 폐기** (기존: 키를 먼저 지우고 체인 실패 시 재시도 불가).
- **프론트**: 코디 공개키를 서버가 아니라 체인에서 읽음, 증명은 Web Worker(`src/workers/voteProofWorker.js`) + 화면 진입 시 회로 파일 미리 로드, 단계별 진행 문구.

### 검증 결과
| 항목 | 결과 |
|---|---|
| 회로 witness 테스트 (`circuits/test/babyjub_e2e.mjs`) | 정상 7표 통과 / 암호문 바꿔치기, 범위 밖 후보, p-1 우회, 임시키 불일치, 다른 코디 키 -> 모두 거절 / 표 이동, 표 누락, 다른 개인키 -> 모두 거절 |
| 실제 Groth16 증명 + 실제 VoteVerifier (Foundry) | 정상 3표 통과, 암호문 1 변경 시 거절, 다른 코디 키로 설정된 선거에서 거절 |
| 컨트랙트 무결성 (Foundry 11개) | 설정 전 시작 불가, 설정 잠금, 형식/필드/패딩 표식 거절, 50표 용량, 합계 불일치, 실제 표를 패딩으로 위장, 코디 키 불일치, 재기록 -> 모두 거절 |
| 실제 집계 증명 + 실제 TallyVerifier (Foundry) | 실제 투표 증명 3개로 castVote -> 서버 코드(decryptVote, generateTallyZkpInput)로 만든 실제 tally 증명 -> recordTally 통과, 결과 1/1/1 일치. 증명 그대로 두고 결과만 바꾸면 거절 |
| 서버 개표 흐름 (DB/체인 mock) | 복호화 결과 = 실제 표, 157개 공개 신호 레이아웃 = 체인 저장값, 체인 기록 후 커밋 |
| 브라우저(Chromium) 워커 | 증명 1.57s, 최대 프레임 간격 19ms (메인 스레드에서 돌리면 192ms 멈춤) |

### 수치
| 항목 | 이전 | 1단계 | 2단계 |
|---|---|---|---|
| voteProof constraints | 약 300 | - | 3,554 |
| tally constraints (50표) | 50,600 | 76,950 | 128,426 |
| tally 공개 신호 | 105 | 105 | 157 |
| TallyVerifier 검증 가스 | 약 0.91M | 약 0.91M | 약 1.27M |
| castVote 가스 (실제 증명 검증 포함) | - | - | 약 384k |
| recordTally 가스 (실제 증명, 157 신호) | - | - | 약 1.63M |
| 투표 증명 생성 (브라우저 워커) | - | - | 약 1.6s |
| 집계 증명 생성 (서버, 2코어) | - | - | 약 12.9s |

tally 회로가 커진 이유: 표마다 BabyJubJub 스칼라 곱(약 2,500 constraints)을 회로 안에서 수행. 대신 관리자 신뢰가 필요 없어짐.

### 주의
- 레포의 `front/user/public/voteProof_final.zkey`, `blockchain/contracts/VoteVerifier.sol`, `blockchain/contracts/TallyVerifier.sol`, `zkp/keys/*_verification_key.json` 은 **개발용 로컬 셋업**(단일 기여자 ptau)으로 만든 것. 운영 배포 전 공개 ptau(Hermez)로 다시 생성할 것.
- `zkp/keys/tally_final.zkey`(66MB)는 gitignore 대상이라 커밋하지 않음. TallyVerifier.sol 과 짝이 맞는 zkey 는 별도로 전달. verifier 와 zkey 는 반드시 같은 셋업에서 나온 것을 써야 한다.
- Foundry 테스트: `blockchain/foundry` (실제 증명 fixture 포함). 사용법은 foundry.toml 주석 참고.
- 기존에 배포된 선거/컨트랙트와 호환되지 않음 (재배포 필요). DB 의 기존 JWK 형식 코디 키도 사용 불가.
- `POST /vote/confirm` 이 voters 행에 임시 공개키를 저장 -> 서버가 학번과 표를 연결할 수 있음. 3단계(머클 트리 + relayer)에서 제거.
