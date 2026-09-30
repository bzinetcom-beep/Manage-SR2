@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\setup-and-start.ps1"
if %errorlevel% neq 0 (
    echo.
    echo   ERROR! Check srms4-startup.log for details.
    echo.
    pause
)
