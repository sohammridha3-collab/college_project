$wsh = New-Object -ComObject WScript.Shell
$startupFolder = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "StudentAdmissionPortal.lnk"
$scriptDir = $PSScriptRoot

$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$scriptDir\start-portal-silent.vbs`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "Student Admission Portal Auto-Start"
$shortcut.Save()

if (Test-Path $shortcutPath) {
    Write-Host "[SUCCESS] Automatic startup configured permanently at: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Could not create startup shortcut." -ForegroundColor Red
}
