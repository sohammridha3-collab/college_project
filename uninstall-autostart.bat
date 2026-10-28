@echo off
title Remove Auto-Start
cd /d "%~dp0"

echo Removing Student Admission Portal from Windows Startup...
powershell -NoProfile -Command "$target = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\StudentAdmissionPortal.lnk'; if (Test-Path $target) { Remove-Item $target -Force; Write-Host '[SUCCESS] Startup shortcut removed.' } else { Write-Host '[INFO] No startup shortcut found.' }"

echo.
pause
