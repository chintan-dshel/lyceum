@echo off
cd /d "%~dp0homeuni-api"
echo.
if not exist "node_modules" (
    echo Installing dependencies first...
    call npm install
)
node setup.js
pause
