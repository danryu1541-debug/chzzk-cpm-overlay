@echo off
cd /d "%~dp0"

echo ========================================
echo CHZZK CPM Overlay Setup
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js LTS first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Please reinstall Node.js LTS:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo.
  echo Enter your CHZZK Client ID and Client Secret in the Notepad window.
  echo Keep CHZZK_REDIRECT_URI as http://localhost:8787/auth/callback for local use.
  echo.
  pause
  notepad ".env"
) else (
  echo .env already exists.
)

echo.
echo Installing packages...
npm.cmd install
if errorlevel 1 (
  echo.
  echo Package installation failed.
  pause
  exit /b 1
)

echo.
echo Setup complete.
echo Next time, run start.bat.
echo.
pause
