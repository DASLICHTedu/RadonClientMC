@echo off
:: ===========================================================
:: Radon Client - Auto Update Script
:: This script checks for updates and downloads them automatically
:: ===========================================================

setlocal enabledelayedexpansion

:: Set paths
set "CURRENT_DIR=%~dp0"
set "VERSION_FILE=%CURRENT_DIR%version.json"
set "TEMP_DIR=%CURRENT_DIR%temp_update"
set "UPDATE_LOG=%CURRENT_DIR%update.log"

:: GitHub API URL for latest release
set "RELEASES_API=https://api.github.com/repos/RadonClient/Radon-Client/releases/latest"
set "DOWNLOAD_URL=https://github.com/RadonClient/Radon-Client/releases/latest"

:: Create temp directory if it doesn't exist
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: Log start of update check
echo [%date% %time%] Starting update check... > "%UPDATE_LOG%"

:: Check if we have internet connection
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    echo No internet connection. Skipping update check.
    echo [%date% %time%] No internet connection >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 0
)

:: Try to get current version from version.json
set "CURRENT_VERSION=1.0.0"
if exist "%VERSION_FILE%" (
    for /f "tokens=2 delims=:" %%A in ('findstr /b "\"version\"" "%VERSION_FILE%"') do (
        set "CURRENT_VERSION=%%~A"
        set "CURRENT_VERSION=!CURRENT_VERSION: =!"
        set "CURRENT_VERSION=!CURRENT_VERSION:"=!"
        set "CURRENT_VERSION=!CURRENT_VERSION:,=!"
    )
)

echo Current version: %CURRENT_VERSION%

:: Try to fetch latest version from GitHub
:: We'll use PowerShell to parse JSON
for /f "delims=" %%A in ('powershell -command "(Invoke-RestMethod -Uri '%RELEASES_API%' -Headers @{'User-Agent'='RadonClient/1.0.0'}).tag_name" 2^>nul') do (
    set "LATEST_VERSION=%%A"
    set "LATEST_VERSION=!LATEST_VERSION:v=!"
)

:: If PowerShell fails, try an alternative method
if "%LATEST_VERSION%"=="" (
    echo Could not fetch latest version from GitHub.
    echo [%date% %time%] Failed to fetch version from GitHub >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 0
)

echo Latest version: %LATEST_VERSION%

:: Compare versions
call :compare_versions %CURRENT_VERSION% %LATEST_VERSION%
if %result% equ 0 (
    echo You have the latest version!
    echo [%date% %time%] Already up to date (v%CURRENT_VERSION%) >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 0
)

if %result% lss 0 (
    echo New update available: v%LATEST_VERSION% (Current: v%CURRENT_VERSION%)
    echo [%date% %time%] Update available: v%CURRENT_VERSION% -> v%LATEST_VERSION% >> "%UPDATE_LOG%"
) else (
    echo Current version is newer than latest? This shouldn't happen.
    timeout /t 2 >nul
    exit /b 0
)

:: Ask user if they want to update
set /p choice=Do you want to download and install the update? (y/n):
if /i "%choice%" neq "y" (
    echo Update cancelled.
    echo [%date% %time%] Update cancelled by user >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 0
)

:: Get download URL for the latest release
:: We need to find the .exe or .zip file in the release assets
for /f "delims=" %%A in ('powershell -command "(Invoke-RestMethod -Uri '%RELEASES_API%' -Headers @{'User-Agent'='RadonClient/1.0.0'}).assets | Where-Object {$_.name -like '*win*' -or $_.name -like '*exe*'} | Select-Object -First 1 -ExpandProperty browser_download_url" 2^>nul') do (
    set "DOWNLOAD_URL=%%A"
)

if "%DOWNLOAD_URL%"=="" (
    echo Could not find download URL.
    echo [%date% %time%] Failed to get download URL >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 0
)

echo Downloading update from %DOWNLOAD_URL%...

:: Download the file using PowerShell
set "UPDATE_FILE=%TEMP_DIR%\radon-client-update.exe"
powershell -command "Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%UPDATE_FILE%' -Headers @{'User-Agent'='RadonClient/1.0.0'}" 2>nul

if not exist "%UPDATE_FILE%" (
    echo Download failed.
    echo [%date% %time%] Download failed >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 1
)

echo Download complete!

:: Verify the download
for %%F in ("%UPDATE_FILE%") do set "FILE_SIZE=%%~zF"
if %FILE_SIZE% lss 1000000 (
    echo Downloaded file seems too small. Delete it.
    del "%UPDATE_FILE%" >nul 2>&1
    echo [%date% %time%] Downloaded file too small >> "%UPDATE_LOG%"
    timeout /t 2 >nul
    exit /b 1
)

:: Ask user to install
set /p install_choice=Update downloaded. Do you want to install it now? (y/n):
if /i "%install_choice%" neq "y" (
    echo Installation cancelled. The update file is saved in %TEMP_DIR%\n    echo You can install it later by running it manually.
    echo [%date% %time%] Installation cancelled by user >> "%UPDATE_LOG%"
    timeout /t 3 >nul
    exit /b 0
)

:: Close the current client if it's running
taskkill /f /im "Radon Client.exe" >nul 2>&1
taskkill /f /im "electron.exe" >nul 2>&1
timeout /t 1 >nul

:: Start the installer
echo Starting installer...
start "" "%UPDATE_FILE%"

:: Wait for installer to complete
timeout /t 10 >nul

echo [%date% %time%] Update installed successfully >> "%UPDATE_LOG%"
exit /b 0

:compare_versions
:: Simple version comparison function
:: Sets result variable: -1 if a < b, 0 if a == b, 1 if a > b
set "a=%~1"
set "b=%~2"
set "result=0"

:: Split versions by dots
for /f "tokens=1-4 delims=." %%i in ("%a%.0.0.0") do (
    set "a1=%%i"
    set "a2=%%j"
    set "a3=%%k"
    set "a4=%%l"
)

for /f "tokens=1-4 delims=." %%i in ("%b%.0.0.0") do (
    set "b1=%%i"
    set "b2=%%j"
    set "b3=%%k"
    set "b4=%%l"
)

:: Compare each part
if !a1! lss !b1! set "result=-1" & goto :end_compare
if !a1! gtr !b1! set "result=1" & goto :end_compare

if !a2! lss !b2! set "result=-1" & goto :end_compare
if !a2! gtr !b2! set "result=1" & goto :end_compare

if !a3! lss !b3! set "result=-1" & goto :end_compare
if !a3! gtr !b3! set "result=1" & goto :end_compare

if !a4! lss !b4! set "result=-1"
if !a4! gtr !b4! set "result=1"

:end_compare
goto :eof
