@echo off
chcp 65001 >nul
rem 전시 모드 멈춤 (데이터는 남음)
cd /d "%~dp0.."
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml stop
