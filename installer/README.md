# نصاب ویزاردی ویندوز — SRMS Setup Wizard

## اجرا برای کاربر نهایی
1. پوشه‌ی پروژه را روی دیسک کپی کنید (مثلاً `D:\SRMS`).
2. روی فایل `installer\SRMS-Setup-Wizard.bat` دابل‌کلیک کنید.
3. مراحل را دنبال کنید؛ در پایان برنامه به‌صورت خودکار اجرا و مرورگر باز می‌شود.

> اجرای برنامه‌های بعدی: `SRMS-Start.bat` (یا میانبر دسکتاپ `SRMS`)
> حالت توسعه: `Start-Dev.bat`
> تعمیر: `SRMS-Repair.bat`

## سازوکار خودترمیم (Self-Healing)
هر مرحله در یک تابع `Invoke-HealingStep` اجرا می‌شود؛ در صورت خطا، تابع «ترمیم» همان مرحله
اجرا می‌شود و تا ۳ بار تلاش مجدد انجام می‌گیرد. **هیچ خطایی باعث لغو نصب نمی‌شود.**

| مرحله | خطای رایج | ترمیم خودکار |
|---|---|---|
| فایل‌های پروژه | پوشه ناقص | بازسازی از ZIP موجود در پوشه |
| Node.js | نصب نیست | نصاب آفلاین `installer\redist\node-*.msi` → `winget` → `choco` → دانلود MSI → نوسازی PATH |
| PostgreSQL | سرویس خاموش | `Start-Service` / `net start`، تست چند رشته اتصال، سپس **پایگاه‌داده داخلی (PGlite)** بدون نصب سرویس |
| فایل `.env` | نبود/خرابی | بازنویسی خودکار + هم‌گام‌سازی `drizzle.config.json` |
| `npm install` | قطعی اینترنت/کش خراب | `npm cache verify` → حذف `node_modules` و `package-lock` → نصب `--offline` → `--legacy-peer-deps` |
| اسکیمای DB | عدم دسترسی | ساخت دستی جدول‌های حداقلی + bootstrap خودکار برنامه در اولین اجرا |
| `next build` | کمبود حافظه/خطای توربوپک | پاک‌سازی `.next` و کش → ساخت با webpack → `NODE_OPTIONS=--max-old-space-size=4096` → `fix-turbopack-externals.mjs` |
| اجرای سرور | پورت اشغال/پاسخ ندادن | انتخاب پورت آزاد، کشتن پروسه‌های قدیمی، ساخت مجدد و تلاش مجدد |

## فایل‌های مرتبط
- `installer/SRMS-Setup-Wizard.bat` — نقطه‌ی ورود (دابل‌کلیک)
- `installer/wizard.ps1` — منطق کامل ویزارد (۹ مرحله + ترمیم)
- `scripts/embedded-pg.mjs` — پایگاه‌داده داخلی آفلاین (وقتی PostgreSQL نصب نیست)
- `scripts/backup.mjs` / `scripts/restore.mjs` — پشتیبان‌گیری و بازیابی از خط فرمان
- `srms-install.log` — لاگ کامل نصب (در ریشه‌ی پروژه ساخته می‌شود)

## ساخت بسته‌ی نصبی برای مشتری (اختیاری)
```bat
SRMS-Build-Installer.bat        :: نسخه Electron/Installer  → dist-desktop\
```
برای توزیع «فقط وب» کافی است پوشه‌ی پروژه + `installer\` را zip کنید؛ مشتری فقط
`installer\SRMS-Setup-Wizard.bat` را اجرا می‌کند.

## پوشه‌ی `installer\redist` (اختیاری اما توصیه‌شده برای نصب کاملاً آفلاین)
```
installer\redist\node-v22.14.0-x64.msi
installer\redist\postgresql-16-windows-x64.exe
```
اگر این فایل‌ها موجود باشند، ویزارد بدون هیچ اتصال اینترنتی نصب می‌کند.
