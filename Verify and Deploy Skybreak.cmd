@echo off
setlocal EnableExtensions
title Skybreak - Verify and Publish
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\release.mjs
set "SKYBREAK_RESULT=%ERRORLEVEL%"
if not "%SKYBREAK_RESULT%"=="0" goto stopped
start "" "https://skybreak-iota.vercel.app"
echo Published build verified. The game has opened in your browser.
popd
pause
exit /b 0
:missing_node
echo Install Node.js 22 or newer, then run this file again.
:stopped
echo Verification or deployment stopped. Keep this window open to see the error.
echo Diagnostic files are in qa-artifacts. Do not share passwords or login codes.
popd
pause
exit /b 1
