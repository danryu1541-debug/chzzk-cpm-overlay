@echo off
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo Please enter CHZZK_CLIENT_ID and CHZZK_CLIENT_SECRET in .env.
  notepad ".env"
)

if not exist "node_modules" (
  echo Installing packages...
  npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting CHZZK CPM overlay server...
npm.cmd start
pause
