@echo off
chcp 65001 >nul
rem 데모 시작 (Docker Desktop 필요)
cd /d "%~dp0.."
if not exist zkp\keys\tally_final.zkey echo [demo] 개표 회로 파일이 없습니다. 투표까지는 되지만 개표는 실패합니다. demo\README.md 참고.
docker compose -f demo/docker-compose.yml up -d --build
if errorlevel 1 exit /b 1
echo [demo] 데모 데이터 준비를 기다리는 중...
docker compose -f demo/docker-compose.yml wait seed >nul 2>&1
docker compose -f demo/docker-compose.yml logs seed
echo [demo] 준비 완료: http://localhost:5173
start http://localhost:5173
