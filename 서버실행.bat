@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 온라인 예산정책이슈 서버
echo 서버를 시작합니다...
echo 브라우저에서 아래 주소로 접속하세요.
echo   http://localhost:5173
echo.
echo 종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
call npm.cmd start
pause
