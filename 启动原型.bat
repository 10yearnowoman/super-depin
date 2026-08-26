@echo off
setlocal
cd /d "%~dp0"
echo 正在启动求职老师工作台...
start "求职老师API" /min cmd /c "pnpm dev:api"
timeout /t 2 /nobreak >nul
start "求职老师网页" cmd /c "pnpm dev:web"
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
echo 已打开 http://localhost:5173
echo 关闭网页后，可在此窗口按 Ctrl+C；API 窗口会保持最小化运行。
pause
