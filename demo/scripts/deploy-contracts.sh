#!/bin/sh
# 로컬 체인(Anvil)에 컨트랙트 일괄 배포 (Remix 수동 배포 순서와 같음)
#   VoteVerifier → TallyVerifier → VotingToken 원본 → VotingSystem 원본 → PoseidonHasher → ElectionFactory
# 결과 주소는 $OUT (기본 /shared/deployment.env) 에 남긴다. 서버가 이 파일을 읽는다.
#
# 환경변수: RPC_URL (기본 http://anvil:8545), DEPLOYER_KEY (Anvil 0번 계정 = 서버 관리자 지갑)
set -eu

RPC_URL="${RPC_URL:-http://anvil:8545}"
DEPLOYER_KEY="${DEPLOYER_KEY:?DEPLOYER_KEY 필요}"
OUT="${OUT:-/shared/deployment.env}"
ROOT="${FOUNDRY_ROOT:-/repo/demo/foundry}"   # 테스트(forge-std) 없이 컨트랙트만 빌드하는 전용 설정
C="../../blockchain/contracts"

echo "[deploy] 체인 대기: $RPC_URL"
for i in $(seq 1 60); do
  cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break
  sleep 1
done

deploy() {
  # $1 = 경로:컨트랙트명, 나머지 = 생성자 인자
  target="$1"; shift
  if [ "$#" -gt 0 ]; then
    res=$(forge create --root "$ROOT" --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --broadcast --json "$target" --constructor-args "$@")
  else
    res=$(forge create --root "$ROOT" --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --broadcast --json "$target")
  fi
  addr=$(printf '%s' "$res" | tr -d '\n ' | sed -n 's/.*"deployedTo":"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p')
  if [ -z "$addr" ]; then
    echo "[deploy] 실패: $target" >&2
    printf '%s\n' "$res" >&2
    exit 1
  fi
  echo "$addr"
}

VOTE_VERIFIER=$(deploy "$C/VoteVerifier.sol:Groth16Verifier")
echo "[deploy] VoteVerifier   $VOTE_VERIFIER"
TALLY_VERIFIER=$(deploy "$C/TallyVerifier.sol:Groth16Verifier")
echo "[deploy] TallyVerifier  $TALLY_VERIFIER"
TOKEN_IMPL=$(deploy "$C/VotingToken.sol:VotingToken")
echo "[deploy] VotingToken    $TOKEN_IMPL"
SYSTEM_IMPL=$(deploy "$C/VotingSystem.sol:VotingSystem")
echo "[deploy] VotingSystem   $SYSTEM_IMPL"
HASHER=$(deploy "$C/PoseidonHasher.sol:PoseidonHasher")
echo "[deploy] PoseidonHasher $HASHER"
FACTORY=$(deploy "$C/ElectionFactory.sol:ElectionFactory" "$SYSTEM_IMPL" "$TOKEN_IMPL" "$VOTE_VERIFIER" "$TALLY_VERIFIER" "$HASHER")
echo "[deploy] ElectionFactory $FACTORY"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<ENV
FACTORY_ADDRESS=$FACTORY
VOTE_VERIFIER_ADDRESS=$VOTE_VERIFIER
TALLY_VERIFIER_ADDRESS=$TALLY_VERIFIER
POSEIDON_HASHER_ADDRESS=$HASHER
ENV
echo "[deploy] 완료 → $OUT"
