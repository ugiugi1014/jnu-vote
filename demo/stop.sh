#!/bin/sh
# 데모 중지 (데이터는 유지, 다시 start 하면 이어서)
cd "$(dirname "$0")/.."
docker compose -f demo/docker-compose.yml stop
