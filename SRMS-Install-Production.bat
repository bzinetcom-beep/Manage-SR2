@echo off
setlocal EnableExtensions
title SRMS - Production Installer ^& Windows Auto-Start
chcp 65001 >nul 2>&1
cls

echo.
echo ========================================================================
echo    🛡️  SRMS - Soldier Resource Management System
echo    سامانه مدیریت منابع سرباز — نصب نسخه پروداکشن و تنظیم استارت‌آپ
echo ========================================================================
echo.

cd /d "%~dp0"
set "SRMS_ROOT=%CD%"

REM --- 1. Locate Node.js executable safely without nested loops or parens issues ---
set "NODE_EXE="
where node >nul 2>&1 && set "NODE_EXE=node"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%APPDATA%\npm\node.exe" set "NODE_EXE=%APPDATA%\npm\node.exe"
if not defined NODE_EXE if exist "%~dp0runtime\node\node.exe" set "NODE_EXE=%~dp0runtime\node\node.exe"

if not defined NODE_EXE (
  echo   [!] نرم‌افزار Node.js در مسیرهای پیش‌فرض سیستم یافت نشد.
  echo       در حال بررسی امکان نصب خودکار از طریق Windows Package Manager (winget)...
  echo.
  where winget >nul 2>&1
  if not errorlevel 1 (
    echo       در حال دریافت و نصب Node.js LTS با winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
  )
)

if not defined NODE_EXE (
  echo.
  echo   [X] نرم‌افزار Node.js روی این رایانه یافت نشد!
  echo       برای نصب کامل سامانه لطفاً ابتدا نسخه LTS را دریافت و نصب کنید:
  echo.
  echo       https://nodejs.org/en/download
  echo.
  start "" "https://nodejs.org/en/download"
  echo.
  echo   پس از پایان نصب Node.js، مجدداً روی این فایل کلیک کنید.
  echo   کلیدی را برای بستن این پنجره فشار دهید...
  pause
  exit /b 1
)

echo   [OK] مسیر Node.js تایید شد: %NODE_EXE%
echo   [..] در حال شروع فرآیند نصب، لطفاً شکیبا باشید...
echo.

REM --- 2. Check orchestrator existence ---
if not exist "%SRMS_ROOT%\launchers\srms-install.mjs" (
  echo   [X] فایل ارکستراتور نصب یافت نشد: launchers\srms-install.mjs
  echo       لطفاً اطمینان حاصل کنید تمام فایل‌های پروژه استخراج شده‌اند.
  echo.
  pause
  exit /b 1
)

REM --- 3. Execute production installer orchestrator ---
"%NODE_EXE%" "%SRMS_ROOT%\launchers\srms-install.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo ========================================================================
  echo   ✅ عملیات با موفقیت به پایان رسید!
  echo   سامانه در پس‌زمینه اجرا شده و در استارت‌آپ ویندوز فعال گردید.
  echo ========================================================================
) else (
  echo ========================================================================
  echo   [X] فرآیند نصب با کد خطای %EXIT_CODE% پایان یافت.
  if exist "%SRMS_ROOT%\logs\srms-install.log" (
    echo       فایل گزارش خطا: "%SRMS_ROOT%\logs\srms-install.log"
  )
  echo ========================================================================
)

echo.
echo   کلیدی را برای بستن این پنجره فشار دهید... (Press any key to close this window)
pause >nul
endlocal
exit /b %EXIT_CODE%
