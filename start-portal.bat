@echo off
title Student Admission Portal Launcher
cd /d "%~dp0"

echo =======================================================
echo    Student Admission Portal - Starting System
echo =======================================================

:: Check if port 3000 is already running
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Backend server is already running on port 3000.
) else (
    echo [INFO] Launching backend server on http://localhost:3000...
    start "Admission Portal Backend" cmd /c "node server/src/server.js"
    :: Give the server a moment to initialize
    timeout /t 2 /nobreak >nul
)

:: Open the portal in default browser
echo [INFO] Opening portal in browser: http://localhost:3000
start http://localhost:3000

echo =======================================================
echo Portal is active at http://localhost:3000
echo You can keep this window or close it anytime.
echo =======================================================
exit /b 0
