@echo off
chcp 65001 >nul
rem 데모 중지 (데이터 유지, 다시 start 하면 이어서)
cd /d "%~dp0.."
docker compose -f demo/docker-compose.yml stop
