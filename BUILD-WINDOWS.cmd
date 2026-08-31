@echo off
cd /d "%~dp0"
title Minarva Biz Windows Build
echo.
echo Minarva Biz - Windows installer build
echo Please wait. First run can take 10-20 minutes.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
echo.
echo Done. Press any key to close.
pause >nul
