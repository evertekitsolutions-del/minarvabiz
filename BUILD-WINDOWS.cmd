@echo off
cd /d "%~dp0"
echo Minarva Biz Windows Build
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
echo.
pause
