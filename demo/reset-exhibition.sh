#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml down -v
sh demo/start-exhibition.sh
