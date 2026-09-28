@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is needed. Install it from https://nodejs.org/ once.
  pause
  exit /b 1
)
if exist skybreak-lan.cjs (
  node skybreak-lan.cjs
) else (
  if not exist node_modules\ws\package.json (
    echo Initial setup needed: open a terminal here and run npm ci, then npm run build.
    echo Once setup is complete this launcher works without internet.
    pause
    exit /b 1
  )
  if not exist dist\index.html (
    echo Built game is missing. Run npm run build once, then reopen this launcher.
    pause
    exit /b 1
  )
  node server\lan-launcher.js
)
if errorlevel 1 pause
endlocal
