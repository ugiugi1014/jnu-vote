#!/bin/sh
# 데모 시작 (Docker 필요). 레포 루트 또는 demo/ 어디서 실행해도 된다.
set -e
cd "$(dirname "$0")/.."
if [ ! -f zkp/keys/tally_final.zkey ] || [ ! -f zkp/build/tally_js/tally.wasm ]; then
  echo "[demo] 개표 회로 파일이 없습니다: zkp/keys/tally_final.zkey, zkp/build/tally_js/"
  echo "[demo] 투표까지는 되지만 개표는 실패합니다. demo/README.md 의 '개표 회로 파일' 참고."
fi
docker compose -f demo/docker-compose.yml up -d --build
echo "[demo] 데모 데이터 준비를 기다리는 중..."
docker compose -f demo/docker-compose.yml wait seed >/dev/null 2>&1 || true
docker compose -f demo/docker-compose.yml logs seed | tail -5
echo "[demo] 준비 완료 → http://localhost:5173"
