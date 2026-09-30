@echo off
setlocal EnableExtensions
title SRMS - ساخت فایل نصبی

REM ===========================================================================
REM  SRMS - Build the customer-ready Windows installer
REM  FOR THE DEVELOPER ONLY (not for the end customer).
REM  Produces:  dist-desktop\SRMS-Setup-1.0.0.exe
REM             dist-desktop\SRMS-Portable-1.0.0.exe
REM ===========================================================================

cd /d "%~dp0"
chcp 65001 >nul 2>&1
cls

echo.
echo   ===========================================================
echo      SRMS - Building the Windows installer
echo   ===========================================================
echo.
echo   This takes 5-15 minutes on the first run. Please wait.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js was not found.
  echo       Install the LTS build from https://nodejs.org and try again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo   [1/2] Installing desktop shell dependencies...
pushd "%~dp0desktop"
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   [X] npm install failed. Check your internet connection.
  popd
  pause
  exit /b 1
)

echo.
echo   [2/2] Building the installer...
call npm run dist
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
  echo.
  echo   [X] Build failed ^(exit code %RC%^).
  pause
  exit /b %RC%
)

echo.
echo   ===========================================================
echo      DONE - your installer is ready
echo   ===========================================================
echo.
echo      dist-desktop\SRMS-Setup-1.0.0.exe      ^<-- give this to the customer
echo      dist-desktop\SRMS-Portable-1.0.0.exe   ^<-- no-install version
echo.

if exist "%~dp0dist-desktop" start "" explorer "%~dp0dist-desktop"
pause
endlocal
exit /b 0
