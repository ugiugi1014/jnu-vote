# jnu-vote
jnu blockchain e-voting system

제주대학교 캡스톤. 이더리움 Sepolia 테스트넷 위에서 동작하는 영지식 증명(ZKP) 기반 익명 전자투표 시스템.

## 데모

로컬 체인·DB·서버·화면을 명령 하나로 띄워서 투표부터 개표 검증까지 체험할 수 있다. [demo/README.md](demo/README.md) 참고 (`demo\start.cmd` / `sh demo/start.sh`).

## 2026-10 보완 사항

자세한 설계, 검증 결과, 수치는 [Change.md](Change.md) 참고.

| 단계 | 내용 | 해결한 문제 |
|---|---|---|
| 1. 집계 무결성 | tally 회로에 "실제 표는 정확히 한 후보로 복호화" 제약 추가, `Num2Bits_strict` 적용, castVote 입력 형식 검사 | 관리자의 표 누락, 비트 분해 aliasing, 형식이 깨진 표 1건으로 개표가 막히는 문제 |
| 2. BabyJubJub ECDH | P-256을 BabyJubJub로 교체하고 공유키를 회로 안에서 계산. voteProof가 암호문까지 검증 | 투표자가 무효 값을 넣어 개표를 막는 문제, 관리자가 임의 공유키를 넣는 문제 |
| 3. 익명 투표 | 브라우저 랜덤 secret, 온체인 유권자 머클 트리(Poseidon), relayer 제출, 학번-표 연결 데이터 삭제 | 서버가 DB 와 계산만으로 학번과 표를 연결할 수 있던 문제 (relayer 를 서버가 맡으므로 서버 신뢰는 남는다, 아래 신뢰 모델 참고) |
| 4. 배치 집계 | 50표씩 배치로 증명하고 배치 사이에는 누적 득표 커밋먼트만 전달, 최종 결과는 마지막 배치에서만 공개 | 선거당 50표까지만 받을 수 있던 제한 (제거됨, 이제 표 수 제한 없음) |

### 신뢰 모델
- **집계 무결성은 검증으로 보장한다.** 서버(관리자)가 표를 버리거나 바꾸면 tally 증명이 만들어지지 않거나 컨트랙트가 거절한다.
- **표 내용의 기밀성과 익명성은 서버를 신뢰한다.** 서버는 코디네이터 개인키로 개표 때 표 내용을 볼 수 있다. relayer 도 서버라서, 서버가 요청 IP·시간을 기록하지 않는다고 가정한다. 배치 사이 누적 득표를 커밋먼트로 가리는 것도 체인을 보는 외부인에 대한 것이고, 서버는 그 값을 안다.
- 서버에 대해서도 기밀성을 지키려면 코디네이터 키를 여러 수탁자에게 나누는 방식이 필요하다 (향후 과제).

## 2026-11 보완 사항

| 내용 | 해결한 문제 |
|---|---|
| 투표 키를 패스키(PRF) 또는 복구 코드에서 만든다. localStorage 는 캐시로만 쓴다 | 브라우저를 바꾸거나 기록을 지우면 그 선거에 투표할 수 없던 문제 |
| 선거 시작 전에는 투표 키 교체(`replaceVoter`) 허용, 학생은 시작 전에도 미리 등록 가능 | 패스키·복구 코드까지 잃은 경우, 시작 전 등록 화면이 없던 문제 |
| 재학증명서 OCR 을 서버(`POST /verification/ocr`)로 이동 | Gemini API 키가 프론트 번들에 노출되던 문제 |
| `/vote/relay`(IP), `/verification/ocr`(사용자) 요청 횟수 제한 | 로그인 없는 relay 로 RPC 사용량을 소진시킬 수 있던 문제 |
| 코디네이터 개인키를 DB 에 AES-256-GCM 으로 암호화 저장 (`COORD_KEY_ENCRYPTION_KEY`) | DB 유출 시 진행 중인 선거의 표를 풀 수 있던 문제 |
| 명단 업로드 시 토큰·가스 발급 제거, `/tokens/issue` 410 | 쓰지 않는 토큰 발급과 ETH 송금이 계속 일어나던 문제 |

### 재배포 시 주의
- 기존에 배포된 선거, 컨트랙트와 호환되지 않으므로 재배포가 필요하다. (2026-11: `VotingSystem.replaceVoter` 추가 → VotingSystem impl 과 ElectionFactory 재배포)
- DB 마이그레이션 `server/src/db/migrations/20261014_anonymous_voting.sql`, `20261122_commitment_replace.sql` 적용이 필요하다.
- `server/.env` 에 `COORD_KEY_ENCRYPTION_KEY`, OCR 설정(`OCR_PROVIDER`, `GEMINI_API_KEY` 등)을 옮겨 넣는다. 프론트 `.env` 의 `VITE_GEMINI_API_KEY` 는 지우고, 한 번이라도 배포에 들어갔다면 그 키는 폐기 후 재발급한다.
- 패스키는 도메인에 묶이므로 운영 도메인을 고정한다.
- 레포의 zkey와 verifier는 개발용 로컬 셋업으로 만들었다. 운영 전 공개 ptau로 다시 생성해야 한다.
