# Create Desktop Shortcut for Radon Client
$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$TargetDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $TargetDir "release\win-unpacked\Radon Client.exe"

if (-Not (Test-Path $ExePath)) {
    Write-Host "Executable not found at $ExePath. Building now..." -ForegroundColor Yellow
    Set-Location $TargetDir
    npm run build:win
}

$ShortcutPath = Join-Path $DesktopPath "Radon Client.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = (Split-Path $ExePath)
$Shortcut.Description = "Radon Client - Lunar Style Minecraft Launcher"
$Shortcut.Save()

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Radon Client wurde erfolgreich installiert!   " -ForegroundColor Green
Write-Host "   Desktop-Verknuepfung erstellt unter:         " -ForegroundColor White
Write-Host "   $ShortcutPath" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
Start-Sleep -Seconds 3

