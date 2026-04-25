@echo off
cd /d "%~dp0"
echo Stopping Lyceum Docker services...
docker compose down
echo Done.
pause
