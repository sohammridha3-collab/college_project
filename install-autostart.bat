@echo off
title Configure Auto-Start on Windows Login
cd /d "%~dp0"

echo =======================================================
echo   Student Admission Portal - Windows Auto-Start Setup
echo =======================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0setup-autostart.ps1"
echo.
pause
