@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20.19+ or 22+ first, then reopen this file.
  pause
  exit /b 1
)
if not exist node_modules\.bin\vite.cmd (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
start "" "http://localhost:4173/"
node server\offline-launcher.js
pause
