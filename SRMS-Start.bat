@echo off
REM ===========================================================================
REM  SRMS - اجرای برنامه  |  Run the application
REM  فقط روی این فایل دابل کلیک کنید.  |  Just double-click this file.
REM ===========================================================================
REM  This is a thin, path-safe shim that forwards to launchers\SRMS-Start.bat
REM  so the end user always has one obvious file in the project root.
REM ===========================================================================

cd /d "%~dp0"

if not exist "%~dp0launchers\SRMS-Start.bat" (
  echo.
  echo   [X] File not found: launchers\SRMS-Start.bat
  echo       The project folder seems incomplete. Please re-extract the package.
  echo.
  pause
  exit /b 1
)

call "%~dp0launchers\SRMS-Start.bat" %*
exit /b %ERRORLEVEL%
