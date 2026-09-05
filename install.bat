@echo off
title Radon Client Installer
echo ====================================================
echo   Installiere Radon Client Desktop-Verknuepfung...
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-desktop-shortcut.ps1"
pause

