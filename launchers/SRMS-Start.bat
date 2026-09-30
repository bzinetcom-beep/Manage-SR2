@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SRMS - سامانه مدیریت منابع سرباز

REM ===========================================================================
REM  SRMS one-click launcher (fallback path - requires Node.js)
REM  The packaged desktop app (SRMS-Setup.exe) needs NO prerequisites at all.
REM ===========================================================================

REM --- path-safe: always work from the project root, tolerate spaces/unicode --
cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"

chcp 65001 >nul 2>&1
cls
echo.
echo   ===========================================================
echo      SRMS - Soldier Resource Management System
echo   ===========================================================
echo.

REM --------------------------- locate Node.js --------------------------------
set "NODE_EXE="
where node >nul 2>&1 && set "NODE_EXE=node"

if not defined NODE_EXE (
  for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%~dp0..\runtime\node\node.exe"
  ) do (
    if exist "%%~P" set "NODE_EXE=%%~P"
  )
)

if not defined NODE_EXE (
  echo   [X] Node.js on this computer was not found.
  echo.
  echo   Choose ONE of the following:
  echo     1^) Install Node.js LTS from https://nodejs.org  then run this file again
  echo     2^) Use SRMS-Setup.exe ^(recommended^) - it needs no prerequisites
  echo.
  start "" "https://nodejs.org/en/download"
  echo   Press any key to close...
  pause >nul
  exit /b 1
)

echo   [OK] Node.js found
echo   [..] Starting, please wait ^(first run can take a few minutes^)
echo.

REM --------------------------- run the orchestrator --------------------------
"%NODE_EXE%" "%PROJECT_ROOT%\launchers\srms-boot.mjs" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo   [X] Startup failed ^(exit code %RC%^).
  echo       Log file: "%PROJECT_ROOT%\logs\srms-startup.log"
  echo.
  if exist "%PROJECT_ROOT%\logs\srms-startup.log" (
    choice /c YN /n /m "   Open the log file now? [Y/N] "
    if !ERRORLEVEL! EQU 1 start "" notepad "%PROJECT_ROOT%\logs\srms-startup.log"
  )
  pause
)

endlocal
exit /b %RC%
