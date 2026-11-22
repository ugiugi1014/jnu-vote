#!/bin/sh
# 이미 배포돼 있고 체인에 팩토리 코드가 있으면 건너뛴다 (재시작 시 재배포 방지)
set -eu
OUT="${OUT:-/shared/deployment.env}"
RPC_URL="${RPC_URL:-http://anvil:8545}"
for i in $(seq 1 60); do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 1; done
if [ -f "$OUT" ]; then
  FACTORY=$(sed -n 's/^FACTORY_ADDRESS=//p' "$OUT")
  CODE=$(cast code --rpc-url "$RPC_URL" "$FACTORY" 2>/dev/null || echo 0x)
  if [ -n "$FACTORY" ] && [ "$CODE" != "0x" ]; then
    echo "[deploy] 이미 배포됨: $FACTORY (건너뜀)"
    exit 0
  fi
  echo "[deploy] 체인이 초기화됨 → 다시 배포"
fi
exec sh /repo/demo/scripts/deploy-contracts.sh
