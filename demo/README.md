# jnu-vote 데모

데모 PC 한 대에서 명령 하나로 로컬 체인, DB, 서버, 화면을 띄우고, 심사위원이 안내만 보고 투표부터 개표 검증까지 직접 해 볼 수 있게 만든 환경이다.
실제 코드와 실제 영지식 증명을 그대로 쓰고, 외부 의존(Sepolia, 메일, KICA 재학증명, OCR)만 데모용으로 바꿨다.

## 준비물

- Docker Desktop (Windows/macOS 인텔·Linux x86_64. Foundry 이미지가 amd64 기준)
- 개표 회로 파일 (레포에 없음, 아래 참고)
  - `zkp/build/tally_js/` (tally.wasm, witness_calculator.js, generate_witness.js)
  - `zkp/keys/tally_final.zkey`
- 크롬 권장 (패스키가 `localhost` 에서 동작. 안 되면 복구 코드 방식으로 진행)

## 실행

| 동작 | Windows | macOS/Linux |
|---|---|---|
| 시작 | `demo\start.cmd` | `sh demo/start.sh` |
| 처음 상태로 초기화 (다음 심사위원용) | `demo\reset.cmd` | `sh demo/reset.sh` |
| 중지 (데이터 유지) | `demo\stop.cmd` | `sh demo/stop.sh` |

시작 후 http://localhost:5173 에 접속한다. 처음 시작은 이미지 빌드 때문에 몇 분 걸린다.

## 구성

| 서비스 | 내용 |
|---|---|
| anvil | 로컬 이더리움 (1초 블록, 상태는 볼륨에 저장) |
| deployer | 검증 컨트랙트 2개 → VotingToken·VotingSystem 원본 → PoseidonHasher → ElectionFactory 배포 (이미 있으면 건너뜀) |
| mysql | `server/src/db/schema.sql` 로 초기화 |
| server | `DEMO_MODE=1` 서버 (`demo/demo.env`) |
| seed | 데모 학생 재학 인증 승인 + 선거 3개(진행 중 1, 예정 1, 개표 완료 1) 생성·배포·명단 등록. "미리 투표한 학생"(`seed_voters`)이 실제 투표 증명으로 진행 중 선거에 3표, 개표 완료 선거에 6표를 넣고, 개표 완료 선거는 종료·개표까지 한다 (처음 실행 시 2~3분) |
| front | 화면 (오른쪽 아래 '체험 안내' 패널, '체인 검증 보기') |

## 데모 모드에서 달라지는 것 (`DEMO_MODE=1` 일 때만)

- 로그인: 메일을 보내지 않고 인증 코드를 화면에 자동 입력. `demo/accounts.json` 의 계정만 허용
- 재학 인증: 데모 학생은 처음부터 승인 상태 (KICA 호출 없음)
- OCR: 사용 안 함 (직접 입력)
- 그 밖의 흐름(투표 키, 투표 증명, relay, 개표 증명, 체인 기록)은 운영 코드와 같다

계정과 선거 내용은 `demo/accounts.json` 에서 바꾼다.

## 체험 순서 (화면의 '체험 안내'와 같음)

1. 학생 1로 로그인 → '2026 총학생회장 선거' → 투표 키 만들기 → 투표
2. 같은 계정으로 다시 투표 → 이중투표로 거절
3. 다른 학생들로 투표, 명단 밖 학생은 자격 없음으로 막힘
4. 관리자로 로그인 → 선거 종료 → 개표
5. '체인 검증 보기': 표는 암호문만 보이고, 개표 증명 기록과 득표 합계가 체인에서 확인됨
6. '예정' 탭의 학과 대표 선거: 투표 키 미리 등록, 키를 잃었다고 가정하고 새 키로 다시 등록

## 자동 점검

데모를 띄운 상태에서 (Node 22 필요):

```
cd front/user
npm install
node scripts/demo-e2e.mjs            # 학생 투표·거절·예정 선거 교체
node scripts/demo-e2e.mjs --tally    # + 관리자 종료·개표·결과 확인 (진행 중 선거를 닫으므로 끝나면 reset)
```

## 개표 회로 파일

`zkp/build`, `zkp/keys/*.zkey` 는 gitignore 대상이라 레포에 올라가지 않는다. 데모 PC 에 직접 있어야 한다.

- 2026-11-22 에 기존 tally zkey 를 잃어버려 새로 만들었다: 로컬 powers of tau(2^17) → `circom --O2`(129,140 제약) → groth16 setup → contribute.
- 이 zkey 에서 export 한 `blockchain/contracts/TallyVerifier.sol`, `zkp/keys/tally_verification_key.json`, Foundry fixture `tally_e2e.json`(`server/scripts/regenTallyFixture.js`)을 함께 교체했다. 셋이 zkey 와 짝이 안 맞으면 개표 기록이 거절된다.
- 투표 회로 키와 마찬가지로 개발용 로컬 셋업이다. 운영 전에는 공개 ptau 로 다시 생성한다.

다시 만들 때 (리눅스/WSL, ptau 준비 후):

```
circom circuits/tally.circom --r1cs --wasm --O2 -o zkp/build
snarkjs groth16 setup zkp/build/tally.r1cs pot17_final.ptau tally_0000.zkey
snarkjs zkey contribute tally_0000.zkey zkp/keys/tally_final.zkey --name="..." -e="<랜덤>"
snarkjs zkey export verificationkey zkp/keys/tally_final.zkey zkp/keys/tally_verification_key.json
snarkjs zkey export solidityverifier zkp/keys/tally_final.zkey blockchain/contracts/TallyVerifier.sol
cd server && node scripts/regenTallyFixture.js
```

## 문제 해결

- 포트 충돌: 8545(체인), 3306 은 쓰지 않음(내부), 8080(서버), 5173(화면) 이 비어 있어야 한다
- 화면은 뜨는데 선거가 없음: `docker compose -f demo/docker-compose.yml logs seed`
- 체인과 DB 가 어긋남(예: 한쪽만 지움): `reset` 으로 둘 다 초기화
