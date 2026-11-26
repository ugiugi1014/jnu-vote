@echo off
chcp 65001 >nul
rem 전시 모드 시작 (Docker Desktop 필요). 심사 모드(start.cmd)와 데이터가 따로 저장된다.
cd /d "%~dp0.."
if not exist demo\.env echo [전시] demo\.env 가 없습니다. demo\.env.example 을 복사해 운영자 코드를 넣어 주세요.
set EXHIBITION_MODE=1
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml up -d --build
if errorlevel 1 exit /b 1
echo [전시] 전시 투표 준비를 기다리는 중...
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml wait seed >nul 2>&1
docker compose -p jnu-vote-exhibit -f demo/docker-compose.yml logs seed
echo [전시] 준비 완료: http://localhost:5173
start http://localhost:5173
