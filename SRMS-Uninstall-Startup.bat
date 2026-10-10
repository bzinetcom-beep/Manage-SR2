@echo off
setlocal EnableExtensions
title SRMS - غیرفعال‌سازی اجرای خودکار استارت‌آپ ویندوز
chcp 65001 >nul 2>&1
cls

echo.
echo   ========================================================================
echo      🛡️ سامانه مدیریت منابع سرباز (SRMS)
echo      غیرفعال‌سازی اجرای خودکار در استارت‌آپ ویندوز (Windows 10 / 11)
echo   ========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[Environment]::GetFolderPath('Startup'); if($s){$t=Join-Path $s 'SRMS-AutoStart.lnk'; if(Test-Path $t){Remove-Item $t -Force; Write-Host '  [OK] میانبر استارت‌آپ از پوشه Startup حذف شد.' -ForegroundColor Green} else {Write-Host '  [i] میانبر استارت‌آپ در پوشه Startup وجود نداشت.' -ForegroundColor Gray}}"

schtasks /Delete /TN "SRMS-AutoStart" /F >nul 2>&1
if errorlevel 1 (
  echo   [i] تسک زمان‌بندی‌شده استارت‌آپ وجود نداشت.
) else (
  echo   [OK] تسک اجرای خودکار ویندوز (SRMS-AutoStart) حذف شد.
)

echo.
echo   ========================================================================
echo      ✓ اجرای خودکار برنامه در استارت‌آپ ویندوز با موفقیت غیرفعال شد.
echo      از این پس برای اجرای برنامه، روی SRMS-Start.bat یا میانبر دسکتاپ کلیک کنید.
echo   ========================================================================
echo.
pause
endlocal
exit /b 0
