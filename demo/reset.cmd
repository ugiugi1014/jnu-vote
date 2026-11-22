@echo off
chcp 65001 >nul
rem 데모를 처음 상태로 (체인과 DB를 모두 지우고 다시 시작)
cd /d "%~dp0.."
docker compose -f demo/docker-compose.yml down -v
call demo\start.cmd
