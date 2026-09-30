@echo off
setlocal EnableExtensions
title SRMS - Setup Wizard

REM ===========================================================================
REM  SRMS - Windows Setup Wizard (double-click entry point)
REM  ---------------------------------------------------------------------------
REM  - با چند کلیک، کل برنامه را نصب می‌کند
REM  - خودترمیم: هر خطا به‌صورت خودکار تلاش به رفع می‌شود و نصب لغو نمی‌شود
REM  - کاملاً آفلاین کار می‌کند (اگر اینترنت نباشد از مسیرهای جایگزین استفاده
REM    می‌کند و در نهایت با PostgreSQL داخلی (embedded) سامانه را بالا می‌آورد)
REM ===========================================================================

cd /d "%~dp0.."
set "SRMS_ROOT=%CD%"
set "SRMS_LOG=%SRMS_ROOT%\srms-install.log"
chcp 65001 >nul 2>&1

echo.
echo   ============================================================
echo      SRMS  -  Setup Wizard
echo      SAMANE MODIRIAT MANABE SARBAZ
echo   ============================================================
echo.
echo   Project folder : %SRMS_ROOT%
echo   Log file       : %SRMS_LOG%
echo.

REM ---- PowerShell available? ------------------------------------------------
where powershell >nul 2>&1
if errorlevel 1 (
  echo   [X] Windows PowerShell not found. This wizard needs PowerShell 5.1+
  echo       ^(pre-installed on Windows 10/11^).
  pause
  exit /b 1
)

REM ---- Execution policy is bypassed, no admin rights are required -----------
REM      (admin is only needed for the optional firewall rule / auto-start task
REM       and those steps are skipped gracefully when not elevated)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$null" >nul 2>&1
if errorlevel 1 (
  echo   [X] PowerShell could not be started.
  pause
  exit /b 1
)

echo   Starting the wizard, please wait...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SRMS_ROOT%\installer\wizard.ps1" -Root "%SRMS_ROOT%" -Log "%SRMS_LOG%"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo   The wizard finished with warnings. See: %SRMS_LOG%
  echo   You can run this wizard again at any time - it repairs as it goes.
) else (
  echo   Installation finished. Use "SRMS-Start.bat" to run the program.
)
echo.
pause
endlocal
exit /b 0
