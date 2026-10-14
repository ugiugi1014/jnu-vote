# jnu-vote — 프로젝트 컨텍스트 (Claude Code용)

제주대학교 캡스톤. 블록체인 기반 익명 전자투표. 이더리움 Sepolia 테스트넷.
**상태: E2E 해피패스 + 음성 케이스 통과 (2026-06-07).** 2026-10 보완: 집계 무결성(1단계) → BabyJubJub 회로 내 ECDH(2단계) → 익명 투표(3단계, 머클 트리 + relayer) → 배치 집계(4단계, 표 수 제한 없음). 각 단계 설명은 Change.md.

핵심 가치: 익명성(누가 누굴 뽑았는지 복원 불가), 검증가능성(ZKP), 위변조 저항(이중투표·집계조작 차단).

---

## 기술 스택

- 프론트: React + Vite, ethers.js, circomlibjs(BabyJubJub ECDH, Poseidon), snarkjs(Groth16, Web Worker)
- 백엔드: Node.js + Express, MySQL (mysql2 pool, `db.getConnection()` 트랜잭션)
- 컨트랙트: Solidity, ElectionFactory(EIP-1167 clone), VotingSystem(유권자 머클 트리 포함), PoseidonHasher(온체인 Poseidon), VotingToken(익명 전환 후 투표에 미사용), verifier 2종(VoteVerifier/TallyVerifier)
- ZKP: Circom 2.x + snarkjs, Groth16. voteProof.circom / tally.circom
- 외부: KICA(doculink) 재학증명 진위확인, OCR(Gemini/Ollama)

## 디렉터리 (루트: C:\Users\dlsrn\vote)

```
blockchain/contracts/   ElectionFactory.sol, VotingSystem.sol, VotingToken.sol,
                        TallyVerifier.sol(uint[160]), VoteVerifier.sol(uint[9]), PoseidonHasher.sol, mocks/
circuits/               voteProof.circom (VoteProof()), tally.circom (Tally(50,5)), test/babyjub_e2e.mjs
server/src/
  index.js              Express 엔트리. /elections 마운트, /api prefix 호환
  routes/               auth.js elections.js voter.js vote.js verification.js tally.js
  services/             ecdhDecrypt.js tallyService.js zkpServices.js electionScheduler.js
  blockchain/           votingContract.js (admin wallet 헬퍼 + closeElectionOnChain + fundVoterGas)
  db/                   MySQL pool, schema.sql
front/user/             Vite React 앱 (※ front/user 하위가 실제 앱)
  src/pages/            LoginPage VoteListPage VoteDetailPage VoteResultPage UploadPage AdminPage
  src/services/         walletService.js ecdhService.js zkpService.js voterIdService.js
  src/workers/          voteProofWorker.js (증명 생성 Web Worker)
  src/abi/              VotingSystem.json / VotingToken.json / ElectionFactory.json (배포 기준 전체 배열)
  public/               voteProof.wasm, voteProof_final.zkey (프론트 vote proof 아티팩트)
zkp/                    tally 산출물 (keys/tally_final.zkey[gitignore], build/tally_js/, keys/tally_verification_key.json)
                        VoteVerifier.sol (voteProof zkey에서 export, Remix 배포용)
```

## 키 설계 (요약)

- 인앱 지갑: `privateKey = HKDF(webmail + serverSecret)`. localStorage 없음, 로그인 시마다 동일 지갑 복원. 개인키는 브라우저 메모리에만. (createWallet은 `{address, privateKey, wallet(ethers.Wallet)}` 래퍼 반환 — VoteDetailPage는 `new ethers.Wallet(wallet.privateKey)`로 사용)
- **익명 신원 (3단계)**: 투표 화면 첫 진입 시 브라우저가 랜덤 `secret` 생성 → localStorage(`jnu-vote:voter-secret:<선거주소>`)에만 저장 → `commitment = Poseidon(secret)` 만 `POST /elections/:id/register-commitment` 로 전송 → 서버가 학번·자격 확인 후 `VotingSystem.registerVoter(commitment)` (학생 1명당 선거별 1회, DB 에는 등록 시각만, commitment 값은 체인에만). 컨트랙트가 깊이 16 증분 머클 트리(Poseidon) 유지, 최근 root 30개 인정.
- `nullifier = Poseidon(secret, scope)`, scope = 선거 컨트랙트 주소 (선거 간 연결 불가). 지갑 개인키 기반 secret 은 서버가 재계산 가능해서 제거.
- 투표 제출은 **relayer**: 프론트가 증명을 `POST /vote/relay` 로 **로그인 토큰 없이** 보내고, 서버 관리자 지갑이 castVote (staticCall 로 사전 검증 후 전송). 학생 지갑·토큰·가스 불필요. `/vote/confirm`(학번-표 연결 저장)은 410.
- 코디네이터 키(BabyJubJub): 선거 생성 시 자동 생성. `coord_private_key`=10진수 스칼라(DB), `coord_public_key`=JSON {x,y}. 선거 시작 시 `configureElection(x, y, numCandidates)`로 체인 고정. 개표(체인 기록 성공) 후 NULL 폐기. ADMIN_WALLET_PRIVATE_KEY(컨트랙트 서명용)와 별개.
- 투표 암호화: 임시 키 ephPriv → `ephPub = ephPriv*Base8`, `shared = ephPriv*coordPub` → `ciphertext = candidateID + Poseidon(shared.x, shared.y)` (mod p). nonce 없음(임시 키가 매번 새로움).
- ZKP①(voteProof): **유권자 트리 포함(누군지 비공개)** + nullifier + 후보 범위 + **암호문이 등록된 코디 키로 유효 후보를 암호화한 것**까지 증명. 공개 신호 9개 `[nullifier, merkleRoot, scope, numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY]`.
- ZKP②(tally, **배치**): 공유키를 입력으로 받지 않고 **회로 안에서 coordPriv*ephPub 로 계산**, coordPub=coordPriv*Base8 검증, 실제 표는 반드시 유효 후보 하나로 복호화. → 관리자가 표를 버리거나 옮길 수 없음.
  표를 50개씩 배치로 나눠 배치마다 증명(**표 수 제한 없음**). 배치 사이에는 `Poseidon(누적득표[5], salt)` 커밋먼트만 이어지고 최종 득표는 마지막 배치에서만 공개. salt_k = Poseidon(coordPriv, k+1) (결정적 → 실패 후 재실행 시 체인에 기록된 배치부터 이어서 진행).
- 프론트 증명 생성은 `src/workers/voteProofWorker.js` (Web Worker). 회로 파일은 투표 화면 진입 시 미리 로드.
- **익명성/이중투표**: 1인1표 = 학번당 commitment 1개(서버가 등록 시 확인) + nullifier 중복 차단(컨트랙트). 서버는 누가 등록했는지는 알지만, 어떤 표가 어떤 commitment 인지는 모름. 남는 가정: relayer(=서버)가 요청 IP·시간으로 추측하지 않는다, 등록 직후 바로 투표하면 시점으로 추측될 여지(일찍 등록 권장).
- secret 을 잃으면(브라우저 변경/기록 삭제) 그 선거엔 투표 불가 (재등록 허용 시 2표 가능해지므로 막음).

## 자격 모델 (익명 투표 전환 후)

자격 2층: **재학인증(전역, user_verifications)** + **선거자격(명단, election_student_list, 선거별)**.
- 관리자가 학번 명단 업로드(`POST /:id/voters/bulk`) → election_student_list 생성.
- 학생은 투표 화면 진입 시 `GET /:id/my-eligibility`(자격 + 등록 여부) → 미등록이면 브라우저가 secret 생성 후 `POST /:id/register-commitment`.
- 투표는 relayer 제출이라 토큰·가스 드립 불필요. (기존 issueToken/fundVoterGas 코드는 남아 있으나 투표 경로에서 사용하지 않음 — 정리 대상)
- 관리자 유권자 목록은 "투표 키 등록 여부"만 표시 (개인별 투표 여부는 알 수 없음).

---

## 회로/검증자 사이즈 — tally 배치(50표, 5후보) pubSignals 160

| 회로 | constraints | 공개 신호 | 필요 ptau |
|---|---|---|---|
| voteProof (머클 16) | 7,682 | 9 | 2^13 |
| tally 배치 (50,5) | 129,140 | 160 | 2^17 |

tally public 순서 = coordPubX, coordPubY → ciphertexts[50] → ephPubX[50] → ephPubY[50] → prevCommit → newCommit → isFinal → result[5].
VotingSystem.recordTallyBatch(batchIndex, ..., uint[160]) 가 배치 순서, 저장된 표/키, 커밋먼트 연결, final 플래그를 대조. 패딩 슬롯 = (ciphertext 0, ephPub (0,1)).
초기 커밋먼트 = Poseidon(0,0,0,0,0,0) (컨트랙트 INITIAL_TALLY_COMMIT, initialize 에서 설정 — clone 이라 선언부 초기값 불가).
배치 증명 1개 약 13s (2코어), 병렬 생성 TALLY_PROOF_CONCURRENCY(기본 2). recordTallyBatch 가스: 꽉 찬 배치 약 2.1M, 마지막 배치 약 1.6M.

관련 상수: `.env` TALLY_CIRCUIT_VOTES=50(배치 크기) / TALLY_CIRCUIT_CANDIDATES=5, tallyService publicSignals 160, votingContract recordTallyBatch uint[160], elections.js candidate_index 0~4.

---

## 컨트랙트 재배포 순서 (Remix) — 현재 1회 배포 완료, 재배포 시 참고

전제: **MetaMask 배포 계정 = server/.env ADMIN_WALLET_PRIVATE_KEY 지갑** (Factory owner여야 deploy onlyOwner 통과). 개인키는 64hex(주소 아님).

0. **ZKP 키 재생성 (회로 변경 시)**: 공개 ptau(Hermez powersOfTau28_hez_final_17.ptau 등)로 voteProof/tally zkey 생성 → verifier export. 레포의 voteProof_final.zkey / VoteVerifier.sol 은 개발용 로컬 셋업이므로 실제 운영 전 반드시 교체.
1. VoteVerifier.sol(uint[9]) 배포(생성자 인자 없음, value 0) → 주소 A
2. TallyVerifier.sol(uint[160]) 배포 → 주소 B
3. VotingToken impl 배포 → C
4. VotingSystem impl 배포 → D
4-1. PoseidonHasher.sol 배포 (생성자 인자 없음) → 주소 H
5. ElectionFactory(D, C, A, B, H) 배포 → F  (검증자·해셔 주소가 immutable로 clone에 주입됨)
6. `server/.env` FACTORY_ADDRESS = F
7. VotingSystem.sol 컴파일 ABI 전체를 front/user/src/abi/VotingSystem.json에 교체 (드롭다운에서 VotingSystem 선택 — Groth16Verifier 아님)
7-1. DB 마이그레이션 `server/src/db/migrations/20261014_anonymous_voting.sql` 적용 (voters.commitment_registered_at 추가, 기존 학번-표 연결 데이터 삭제)
8. tally 산출물(zkp/build/tally_js wasm, zkp/keys/tally_final.zkey, tally_verification_key.json)이 새 회로(배치, 160 공개 신호)인지 확인

배포 후: AdminPage `POST /:id/deploy` → Factory.createElection → VotingSystem+VotingToken clone + 주소 자동 등록.

---

## E2E 결과 (2026-06-07, 통과)

해피패스(선거1): 등록→KDF지갑→관리자셋업(생성/배포/시작/명단)→토큰 lazy발급→castVote(vote proof)→close→tally(tally proof)+recordTally→결과→coord_private_key 폐기. 온체인=DB 일치.

음성 케이스(선거2): 비자격자 `not_in_voter_list`, 토큰없음 castVote `voting token required`, 투표후 토큰 burn, 재투표 `already_voted`, nullifier 기록 확인.

이번 세션 수정(origin/main 반영, 커밋 14c3441/637c431/460523e):
- pi_b inner-pair **swap 필요 확정**(walletService.castVote, tallyService.toSolidityProof) — 온체인 proof 통과로 실증
- (50,5) 전환 (회로/컨트랙트/백엔드/ABI 전반)
- ecdhDecrypt.parseEncryptedData: utf8/JSON → **abi-decode(uint256,uint256)** (프론트/컨트랙트 정합)
- zkpServices: 후보수 검증 `!==`→`>`, snarkjs를 `node + path.dirname(require.resolve('snarkjs'))/cli.cjs`로 실행(PATH 비의존)
- VoteDetailPage: `wallet.connect` → `new ethers.Wallet(privateKey)`
- **/close + 스케줄러가 체인 closeElection() 호출**(closeElectionOnChain) — 안 하면 recordTally가 whenElectionClosed로 revert
- **fundVoterGas** 가스 드립 추가
- 라이브 DB에 election_student_list 테이블 생성(스키마 드리프트)

### 남은 테스트 (TODO)
- 다중 유권자(3~5명) 집계 정확성 + 투표율 분모
- KICA 오류→수동 승인 경로(pending 탭)
- 엣지: 동일 학번이 여러 이메일에 인증된 경우 자격조회 교차매칭 여지(보통 학번=1인이라 무해)

---

## 해결됨 / 논의 대기

- **(해결) RPC URL 브라우저 노출**: 프론트가 VITE_RPC_URL을 클라이언트 번들에 그대로 넣어 Alchemy 키가 유출되던 문제 → front/user/.env의 VITE_RPC_URL을 **키 없는 공개 Sepolia RPC(`https://ethereum-sepolia-rpc.publicnode.com`)** 로 교체. Alchemy 키는 서버 RPC_URL에만 보관. 프론트는 castVote 전송(VoteDetailPage:95) 한 곳만 RPC를 쓰므로 공개 RPC로 충분. 레이트리밋 걸리면 `https://1rpc.io/sepolia`·`https://sepolia.drpc.org`로 교체하거나 백엔드 프록시로 승급. (front .env는 gitignore라 환경마다 별도 설정 필요)
- **가스 모델**: fundVoterGas는 드립 방식. 운영은 릴레이어/메타트랜잭션 고려.
- **CLAUDE.md/익명성 모델 서술**: 과거 "다른 지갑 동일인→nullifier 동일"은 부정확(위 키 설계 참고).

## 작업 원칙

- 업로드/지정된 파일만 검토·수정. 가정한 아키텍처 말고 실제 코드 기준.
- 큰 생성 작업 전 확인받기. 직접적 추천 + 근거 먼저.
- 응답은 간결하게. 이모지 금지.
- git: `git push origin HEAD:branch` / `git pull origin branch` (checkout/switch 안 씀). (단 새 브랜치 커밋 등 필요 시 checkout -b 허용)
- ZKP 회로 컴파일은 1회성. 산출물 커밋. zkey는 .gitignore 후 커밋.
- `.env`(server/front) gitignore — 비밀/대용량 커밋 금지. `.env` 수정 시 백엔드 재시작 필요(dotenv 1회 로드).
