# jnu-vote — 프로젝트 컨텍스트 (Claude Code용)

제주대학교 캡스톤. 블록체인 기반 익명 전자투표. 이더리움 Sepolia 테스트넷.
**상태: E2E 해피패스 + 음성 케이스 통과 (2026-06-07).** tally 회로는 **(50,5)** 운영.

핵심 가치: 익명성(누가 누굴 뽑았는지 복원 불가), 검증가능성(ZKP), 위변조 저항(이중투표·집계조작 차단).

---

## 기술 스택

- 프론트: React + Vite, ethers.js, Web Crypto API(ECDH P-256), circomlibjs(Poseidon), snarkjs(Groth16)
- 백엔드: Node.js + Express, MySQL (mysql2 pool, `db.getConnection()` 트랜잭션)
- 컨트랙트: Solidity, ElectionFactory(EIP-1167 clone), VotingSystem, VotingToken(soulbound ERC20), verifier 2종(VoteVerifier/TallyVerifier)
- ZKP: Circom 2.x + snarkjs, Groth16. voteProof.circom / tally.circom
- 외부: KICA(doculink) 재학증명 진위확인, OCR(Gemini/Ollama)

## 디렉터리 (루트: C:\Users\dlsrn\vote)

```
blockchain/contracts/   ElectionFactory.sol, VotingSystem.sol, VotingToken.sol,
                        TallyVerifier.sol(uint[105]), VoteVerifier.sol(uint[1]), mocks/
circuits/               voteProof.circom (VoteProof(50)), tally.circom (Tally(50,5))
server/src/
  index.js              Express 엔트리. /elections 마운트, /api prefix 호환
  routes/               auth.js elections.js voter.js vote.js verification.js tally.js
  services/             ecdhDecrypt.js tallyService.js zkpServices.js electionScheduler.js
  blockchain/           votingContract.js (admin wallet 헬퍼 + closeElectionOnChain + fundVoterGas)
  db/                   MySQL pool, schema.sql
front/user/             Vite React 앱 (※ front/user 하위가 실제 앱)
  src/pages/            LoginPage VoteListPage VoteDetailPage VoteResultPage UploadPage AdminPage
  src/services/         walletService.js ecdhService.js zkpService.js poseidonService.js crypto.js
  src/abi/              VotingSystem.json / VotingToken.json / ElectionFactory.json (배포 기준 전체 배열)
  public/               voteProof.wasm, voteProof_final.zkey (프론트 vote proof 아티팩트)
zkp/                    tally 산출물 (keys/tally_final.zkey[gitignore], build/tally_js/, keys/tally_verification_key.json)
                        VoteVerifier.sol (voteProof zkey에서 export, Remix 배포용)
```

## 키 설계 (요약)

- 인앱 지갑: `privateKey = HKDF(webmail + serverSecret)`. localStorage 없음, 로그인 시마다 동일 지갑 복원. 개인키는 브라우저 메모리에만. (createWallet은 `{address, privateKey, wallet(ethers.Wallet)}` 래퍼 반환 — VoteDetailPage는 `new ethers.Wallet(wallet.privateKey)`로 사용)
- `secret = Poseidon(walletPrivateKey, electionID)` (프론트 zkpService). `nullifier = Poseidon(secret)` (voteProof.circom 내부).
- 코디네이터 ECDH 키: 선거 생성 시 자동 생성, `elections.coord_private_key`(DB). 개표 후 NULL 폐기. ADMIN_WALLET_PRIVATE_KEY(컨트랙트 서명용)와 별개.
- 투표 암호화: 임시 ECDH 키쌍 → 코디 공개키와 공유키 도출 → `keystream=Poseidon(공유키,nonce)` → `암호문 = candidateID XOR keystream`.
- **익명성/이중투표 실질 보장**: nullifier가 walletPrivateKey 기반이라 "다른 지갑=다른 nullifier". KDF로 1인=1지갑이므로, 1인1표는 **학번당 토큰 1개 + soulbound burn**이 핵심. nullifier 매핑은 같은 nullifier 재사용 차단(방어 심화).

## 토큰 모델

자격 2층: **재학인증(전역, user_verifications)** + **선거자격(명단, election_student_list, 선거별)**.
- 관리자가 학번 명단 업로드(`POST /:id/voters/bulk`) → election_student_list 생성(선거별), total_voters=명단수. 즉시발급 대상엔 토큰+가스 발급.
- 미가입/신규는 투표 진입 시 lazy 발급(`GET /:id/my-eligibility`) — 토큰 발급과 함께 가스(ETH)도 발급.
- castVote는 투표자 지갑이 직접 가스 지불 → `fundVoterGas`가 ADMIN_WALLET에서 가스 드립(잔액<VOTER_GAS_AMOUNT, 기본 0.002 ETH일 때만). 릴레이어 아님.

---

## 회로/검증자 사이즈 (50,5) — pubSignals 105

tally.circom: `Tally(50, 5)`. public 순서 = nonces[50] → ciphertexts[50] → adminResult[5] = **105개**.
VotingSystem.sol recordTally(uint[105]) / TallyVerifier(uint[105]) 기대:
- pubSignals[0..49] == nonce[i]
- pubSignals[50..99] == ciphertext[i]
- pubSignals[100..104] == voteCounts[c]
→ voteCounts와 adminResult 둘 다 c=0..4 동일 순서·값. 후보 3명이면 index 3,4는 0 패딩.

관련 상수 통일: `.env` TALLY_CIRCUIT_VOTES=50 / TALLY_CIRCUIT_CANDIDATES=5, zkpServices 기본값 50/5, tallyService publicSignals 105·TALLY_CANDIDATES=5, votingContract recordTally uint[105], elections.js candidate_index 0~4(bulk≤5).

패딩 더미표(sharedKey=nonce=ciphertext=0): 회로에서 candidateId=Poseidon(0,0)XOR0=거대값 → 후보 0~4에 안 잡혀 집계 0. 안전.

---

## 컨트랙트 재배포 순서 (Remix) — 현재 1회 배포 완료, 재배포 시 참고

전제: **MetaMask 배포 계정 = server/.env ADMIN_WALLET_PRIVATE_KEY 지갑** (Factory owner여야 deploy onlyOwner 통과). 개인키는 64hex(주소 아님).

1. VoteVerifier.sol 배포(생성자 인자 없음, value 0) → 주소 A
2. TallyVerifier.sol(uint[105]) 배포 → 주소 B  (※ uint[1050]짜리 옛 버전은 24KB 한도 초과로 배포 불가)
3. VotingToken impl 배포 → C
4. VotingSystem impl 배포 → D
5. ElectionFactory(D, C, A, B) 배포 → F  (검증자 주소가 immutable로 clone에 주입됨)
6. `server/.env` FACTORY_ADDRESS = F
7. VotingSystem.sol 컴파일 ABI 전체를 front/user/src/abi/VotingSystem.json에 교체 (드롭다운에서 VotingSystem 선택 — Groth16Verifier 아님)
8. tally 산출물(zkp/build/tally_js wasm, zkp/keys/tally_final.zkey, tally_verification_key.json)이 (50,5)인지 확인

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
