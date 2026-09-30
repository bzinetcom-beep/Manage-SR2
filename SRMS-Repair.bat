@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SRMS - تعمیر برنامه

REM ===========================================================================
REM  SRMS - Repair
REM  Fixes: "Failed to load external module pg-xxxxxxxx"
REM         "Cannot find package '...\.next\node_modules\pg-...'"
REM         white page / 500 errors / stale build after copying the folder
REM
REM  Safe to run any time. It never touches your database or your data.
REM ===========================================================================

cd /d "%~dp0"
chcp 65001 >nul 2>&1
cls

echo.
echo   ===========================================================
echo      SRMS - Repair tool
echo   ===========================================================
echo.
echo   This rebuilds the application files.
echo   Your DATA and DATABASE are NOT touched.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js was not found. Install it from https://nodejs.org
  echo.
  pause
  exit /b 1
)

REM --------------------------------------------------------------- step 1 ---
echo   [1/5] Closing any running copy of SRMS...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM SRMS.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo         done.

REM --------------------------------------------------------------- step 2 ---
echo   [2/5] Removing the old build...
if exist "%~dp0.next" rmdir /s /q "%~dp0.next"
if exist "%~dp0node_modules\.cache" rmdir /s /q "%~dp0node_modules\.cache"
echo         done.

REM --------------------------------------------------------------- step 3 ---
echo   [3/5] Checking packages...
if not exist "%~dp0node_modules\next" (
  echo         installing, this can take several minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   [X] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)
echo         done.

REM --------------------------------------------------------------- step 4 ---
echo   [4/5] Rebuilding ^(this takes a few minutes, please wait^)...
echo.
call npm run build
if errorlevel 1 goto TRY_WEBPACK

echo.
echo   [5/5] Linking server modules...
node "%~dp0scripts\fix-turbopack-externals.mjs"
if errorlevel 1 goto TRY_WEBPACK
goto SUCCESS

REM --------------------------------------------------------- webpack path ---
:TRY_WEBPACK
echo.
echo   [!] The fast build engine (Turbopack) produced a broken output.
echo       Retrying with the classic engine (webpack)...
echo.
if exist "%~dp0.next" rmdir /s /q "%~dp0.next"
call npx next build --webpack
if errorlevel 1 (
  echo.
  echo   [X] Rebuild failed. Please send the messages above to support.
  echo.
  pause
  exit /b 1
)
node "%~dp0scripts\fix-turbopack-externals.mjs"

:SUCCESS
echo.
echo   ===========================================================
echo      REPAIR COMPLETE
echo   ===========================================================
echo.
echo      You can start the application now:
echo      double-click  SRMS-Start.bat   (or  Start-App.bat)
echo.
choice /c YN /n /m "   Start SRMS now? [Y/N] "
if !ERRORLEVEL! EQU 1 (
  start "" "%~dp0SRMS-Start.bat"
  exit /b 0
)

endlocal
exit /b 0
