@echo off
cd /d "%~dp0homeuni-api"
echo Running database migrations...
node src/db/migrate.js
pause
