@echo off
chcp 65001 >nul
rem 전시 모드를 처음 상태로 (전시 체인과 DB를 모두 지우고 exhibition.json 으로 다시 만든다)
cd /d "%~dp0.."
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml down -v
call demo\start-exhibition.cmd
