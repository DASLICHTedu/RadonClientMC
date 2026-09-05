@echo off
title Radon Client - GitHub Downloader & Installer
setlocal enabledelayedexpansion

echo ===================================================================
echo   RADON CLIENT - Download & Installation von GitHub
echo   Repository: https://github.com/DASLICHTedu/RadonClientMC
echo ===================================================================
echo.

set "TARGET_DIR=%~dp0"
set "TEMP_ZIP=%TARGET_DIR%radon_github_download.zip"
set "TEMP_EXTRACT=%TARGET_DIR%radon_temp_extract"
set "REPO_ZIP_URL=https://github.com/DASLICHTedu/RadonClientMC/archive/refs/heads/main.zip"

echo [1/4] Verbindung zu GitHub wird geprueft...
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Keine Internetverbindung zu GitHub!
    pause
    exit /b 1
)

echo [2/4] Lade alle Projektdateien von DASLICHTedu/RadonClientMC herunter...
powershell -NoProfile -Command "Write-Host 'Downloading ZIP from GitHub...' -ForegroundColor Cyan; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%REPO_ZIP_URL%', '%TEMP_ZIP%')"
if not exist "%TEMP_ZIP%" (
    echo [FEHLER] Download fehlgeschlagen!
    pause
    exit /b 1
)

echo [3/4] Extrahiere und integriere alle Dateien...
powershell -NoProfile -Command "if (Test-Path '%TEMP_EXTRACT%') { Remove-Item -Recurse -Force '%TEMP_EXTRACT%' }; Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force; $root = Get-ChildItem -Path '%TEMP_EXTRACT%' | Where-Object { $_.PSIsContainer } | Select-Object -First 1; if ($root) { Copy-Item -Path ($root.FullName + '\*') -Destination '%TARGET_DIR%' -Recurse -Force }; Remove-Item -Recurse -Force '%TEMP_EXTRACT%'; Remove-Item -Force '%TEMP_ZIP%'"

echo.
echo [4/4] Pruefe Abhaengigkeiten und erstelle Verknuepfung...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    if not exist "%TARGET_DIR%node_modules" (
        echo [INFO] Installiere npm-Abhaengigkeiten...
        cd /d "%TARGET_DIR%"
        call npm install
    )
)

if exist "%TARGET_DIR%install-desktop-shortcut.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET_DIR%install-desktop-shortcut.ps1"
)

echo.
echo ===================================================================
echo   Installation von GitHub erfolgreich abgeschlossen!
echo   Starte Radon Client ueber 'start-client.bat' oder Desktop Icon.
echo ===================================================================
echo.
pause
