@echo off
setlocal EnableExtensions
title SRMS - Backup Now
chcp 65001 >nul 2>&1

REM ===========================================================================
REM  SRMS - تهیه نسخه پشتیبان با یک دابل‌کلیک
REM  Creates a full system backup immediately.
REM ===========================================================================

cd /d "%~dp0"

if not exist "logs" mkdir "logs"
if not exist "backups" mkdir "backups"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Node.js was not found. Run the setup wizard first:
  echo       installer\SRMS-Setup-Wizard.bat
  echo.
  pause
  exit /b 1
)

echo.
echo   Creating a full system backup, please wait...
echo.

set "BACKUP_DIR=%~dp0backups"
if exist "%~dp0data\backup-dir.txt" set /p BACKUP_DIR=<"%~dp0data\backup-dir.txt"

node "%~dp0scripts\backup.mjs" "%BACKUP_DIR%" manual
if errorlevel 1 (
  echo.
  echo   [X] Backup failed. See logs\backup.log
  echo.
  pause
  exit /b 1
)

echo.
echo   Done. Backup folder: %BACKUP_DIR%
echo   You can restore it from the app:  Settings ^> پشتیبان‌گیری و بازیابی
echo.
choice /c YN /n /m "   Open the backup folder? [Y/N] "
if %ERRORLEVEL% EQU 1 explorer "%BACKUP_DIR%"
endlocal
exit /b 0
