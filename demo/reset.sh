#!/bin/sh
# 데모를 처음 상태로 (체인·DB 모두 지우고 다시 시작)
set -e
cd "$(dirname "$0")/.."
docker compose -f demo/docker-compose.yml down -v
sh demo/start.sh
