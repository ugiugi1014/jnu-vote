#!/bin/sh
# 전시 모드 시작. 심사 모드(start.sh)와 데이터가 따로 저장된다.
cd "$(dirname "$0")/.." || exit 1
[ -f demo/.env ] || echo "[전시] demo/.env 가 없습니다. demo/.env.example 을 복사해 운영자 코드를 넣어 주세요."
export EXHIBITION_MODE=1
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml up -d --build || exit 1
echo "[전시] 전시 투표 준비를 기다리는 중..."
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml wait seed >/dev/null 2>&1 || true
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml logs seed | tail -8
echo "[전시] 준비 완료: http://localhost:5173"
