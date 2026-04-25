@echo off
setlocal

cd /d "%~dp0"

echo.
echo  Lyceum — Dev Environment
echo  =========================
echo.

REM ── Install dependencies if node_modules missing ───────────────────────────
if not exist "homeuni-api\node_modules" (
    echo [1/2] Installing API dependencies...
    cd homeuni-api
    call npm install
    cd ..
) else (
    echo [1/2] API dependencies OK
)

if not exist "homeuni-ui\node_modules" (
    echo [2/2] Installing UI dependencies...
    cd homeuni-ui
    call npm install
    cd ..
) else (
    echo [2/2] UI dependencies OK
)

echo.
echo  Starting API on http://localhost:3001
start "Lyceum API" cmd /k "cd /d %~dp0homeuni-api && npm run dev"

echo  Starting UI on http://localhost:5173
start "Lyceum UI" cmd /k "cd /d %~dp0homeuni-ui && npm run dev"

echo  Waiting for UI to start...
timeout /t 4 /nobreak >nul
start chrome "http://localhost:5173"

echo.
echo  Two terminal windows have opened.
echo.
echo  First time? Run setup-db.bat first if you haven't already.
echo.
pause
endlocal
