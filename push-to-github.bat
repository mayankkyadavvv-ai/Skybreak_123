@echo off
echo ========================================================
echo   Skybreak Flight Combat - 1-Click Push to GitHub
echo ========================================================
echo.
set /p REPO="Paste your GitHub Repository URL (e.g. https://github.com/username/repo.git): "
if "%REPO%"=="" (
  echo No URL entered. Exiting.
  pause
  exit /b
)

git init
git add .
git commit -m "Skybreak Flight Combat - Complete Working Build"
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin %REPO%
echo.
echo Pushing to GitHub...
git push -u origin main
echo.
echo ========================================================
echo   Done! Your project is now on GitHub!
echo ========================================================
pause
