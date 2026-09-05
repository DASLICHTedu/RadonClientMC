@echo off
:: ===========================================================
:: Radon Client - Start Script with Auto-Update Check
:: ===========================================================

@setlocal enabledelayedexpansion

:: Set paths
set "SCRIPT_DIR=%~dp0"
set "VERSION_FILE=%SCRIPT_DIR%version.json"

:: Check if update.bat exists and run it first
if exist "%SCRIPT_DIR%update.bat" (
    call "%SCRIPT_DIR%update.bat"
)

:: Start the client
cd /d "%SCRIPT_DIR%"

title Radon Client - Starting...
echo ====================================================
echo   Radon Client
echo   Version: 1.0.0
echo ====================================================
echo.

:: Check if npm is available
where npm >nul 2>&1
if %errorlevel% equ 0 (
    :: Development mode - use npm start
    echo Starting in development mode...
    npm start
) else (
    :: Production mode - start compiled executable
    echo Starting Radon Client...
    
    :: Try to start the compiled executable
    if exist "%SCRIPT_DIR%release\win-unpacked\Radon Client.exe" (
        start "" "%SCRIPT_DIR%release\win-unpacked\Radon Client.exe"
    ) else if exist "%SCRIPT_DIR%dist-electron\main.js" (
        :: Electron app - start with electron
        electron .
    ) else (
        echo Error: Could not find Radon Client executable.
        echo Please build the project first with: npm run build:win
        pause
    )
)

