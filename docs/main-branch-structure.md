# JNU Vote Main Branch Structure

이 문서는 `main` 브랜치 통합 기준 폴더 구조를 정의한다.
각 기능 브랜치의 작업물은 아래 구조에 맞춰 병합한다.

## Target Tree

```text
jnu-vote/
├── user/                    # React 프론트엔드 앱
│   ├── public/
│   │   ├── voteProof.wasm
│   │   └── voteProof_final.zkey
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── data/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   ├── package.json
│   └── vite.config.js
│
├── server/                  # Express 백엔드 API 서버
│   ├── src/
│   │   ├── blockchain/      # ethers 컨트랙트 연결 코드
│   │   ├── db/              # DB 연결 및 schema.sql
│   │   ├── middleware/      # auth/admin middleware
│   │   ├── routes/          # auth, elections, vote, voter, tally, verification
│   │   └── services/        # scheduler, zkp, crypto helper
│   ├── uploads/             # 런타임 업로드 파일, git 제외
│   ├── .env.example
│   └── package.json
│
├── blockchain/              # Hardhat 스마트컨트랙트
│   ├── contracts/
│   │   ├── VotingSystem.sol
│   │   └── VotingToken.sol
│   ├── scripts/             # 배포 스크립트
│   ├── test/
│   ├── hardhat.config.js
│   └── package.json
│
├── circuits/                # Circom 회로 원본
│   ├── tally.circom
│   └── voteProof.circom
│
├── zkp/                     # 회로 빌드 산출물 및 검증 키
│   ├── inputs/              # 예시 input JSON
│   ├── keys/                # verification_key JSON
│   ├── proofs/              # 예시 proof/public JSON
│   └── build/               # wasm, zkey, witness 등 로컬 빌드 산출물
│
├── docs/                    # 통합 문서, API 명세, 발표 자료
│   ├── api/
│   ├── integration/
│   └── diagrams/
│
├── docker-compose.yml       # 로컬 DB 등 공통 개발 인프라
├── package.json             # 루트 공통 스크립트
├── .gitignore
├── LICENSE
└── README.md
```

## Branch Mapping

| Source branch | Keep in main | Notes |
| --- | --- | --- |
| `front` | `user/` | 실제 사용자/관리자 프론트 앱. `web/`, `wallet/`, `ecdh-test/`는 실험 코드로 분류한다. |
| `back` | `server/`, `blockchain/`, `docker-compose.yml` | 백엔드 API, DB schema, 컨트랙트, 로컬 인프라 기준. |
| `circuits` | `circuits/`, `zkp/inputs`, `zkp/keys`, `zkp/proofs` | 회로 원본은 `circuits/`, 실행/검증 자료는 `zkp/` 아래로 분리한다. |
| `main` | `README.md`, `LICENSE`, `.gitignore` | 최종 통합 기준 브랜치. |

## Integration Rules

1. 프론트 코드는 `user/` 아래에만 둔다.
2. 백엔드 코드는 `server/` 아래에만 둔다.
3. 컨트랙트 코드는 `blockchain/` 아래에만 둔다.
4. 회로 원본은 `circuits/`, 회로 산출물은 `zkp/`로 분리한다.
5. `node_modules/`, `artifacts/`, `cache/`, `server/uploads/`, `.env`는 커밋하지 않는다.
6. 실험 코드인 `ecdh-test/`, `wallet/`, `web/`는 main 병합 대상에서 제외하거나 `docs/references/`로 옮길 때만 포함한다.
7. 백엔드와 프론트 통합 API는 `/api/...` prefix를 기준으로 맞춘다.

## Current Alignment Decisions

- Module system: backend는 CommonJS 기준.
- Election status: `pending -> active -> closed -> tallied`.
- Student verification status: `none -> pending -> approved/rejected`.
- Candidate index: circuits 기준 0-based, 즉 `0, 1, 2`.
- Tally circuit default: `Tally(10, 3)`.
- Wallet address: 계정 단위로 저장하며 최초 등록 후 변경하지 않는다.
- Student verification upload files: 승인/거절 후 실제 파일은 삭제하고 상태만 DB에 남긴다.
- Election close/tally: `end_time` 기준으로 백엔드가 자동 예약한다.
