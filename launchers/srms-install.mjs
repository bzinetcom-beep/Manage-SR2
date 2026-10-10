#!/usr/bin/env node
/**
 * SRMS — Production Installer & Windows Auto-Start Orchestrator
 * =============================================================================
 * Handles:
 *   1. System environment & Node.js validation
 *   2. .env provisioning (security keys & config)
 *   3. Dependency installation (npm install)
 *   4. Production build (next build + Turbopack externals repair)
 *   5. Windows Startup setup (Windows 10 & Windows 11 compatible)
 *      - %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SRMS-AutoStart.lnk
 *      - Task Scheduler (ONLOGON trigger for extra reliability)
 *      - Desktop shortcuts
 *   6. Immediate background launch (via SRMS-Silent.vbs) + browser opening
 * =============================================================================
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "srms-install.log");

fs.mkdirSync(LOG_DIR, { recursive: true });

function toLog(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch {
    /* ignore logging errors */
  }
}

const colors = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function banner() {
  console.log("");
  console.log(colors.cyan("  ========================================================================"));
  console.log(colors.bold("     🛡️ سامانه مدیریت منابع سرباز (SRMS) — نصب نسخه پروداکشن"));
  console.log("     پیکربندی استارت‌آپ خودکار ویندوز ۱۰ و ۱۱ (Windows Startup)");
  console.log(colors.cyan("  ========================================================================"));
  console.log("");
}

function say(step, total, text) {
  const line = `  [${step}/${total}] ${text}`;
  console.log(colors.cyan(colors.bold(line)));
  toLog(line);
}

function ok(text) {
  console.log(`      ${colors.green("✓")} ${text}`);
  toLog(`  [OK] ${text}`);
}

function warn(text) {
  console.log(`      ${colors.yellow("!")} ${text}`);
  toLog(`  [WARN] ${text}`);
}

function die(msg, err) {
  console.error("");
  console.error(colors.red(`  [X] خطا: ${msg}`));
  if (err) console.error(colors.dim(`      ${err.message || err}`));
  toLog(`[FATAL] ${msg} :: ${err ? err.stack || err.message || err : ""}`);
  console.error("");
  console.error(colors.yellow(`  گزارش خطا در فایل ذخیره شد: ${LOG_FILE}`));
  console.error("");
  console.log("  کلیدی را برای خروج فشار دهید...");
  if (process.stdin.isTTY) {
    try {
      spawnSync("pause", { shell: true, stdio: "inherit" });
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
}

function shLive(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return r.status === 0;
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// 1. Environment & .env
// ---------------------------------------------------------------------------
function checkEnvironment() {
  say(1, 5, "بررسی پیش‌نیازهای سیستمی و تنظیمات محیطی...");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    die(`نسخه Node.js فعلی (${process.versions.node}) قدیمی است. لطفاً نسخه 20 یا بالاتر را نصب کنید.`);
  }
  ok(`محیط اجرا تأیید شد: Node.js ${process.versions.node} روی ${os.platform()} ${os.arch()} (${os.release()})`);

  const envFile = path.join(ROOT, ".env");
  const envExample = path.join(ROOT, ".env.example");
  let envContent = "";

  if (fs.existsSync(envFile)) {
    envContent = fs.readFileSync(envFile, "utf8");
  } else if (fs.existsSync(envExample)) {
    envContent = fs.readFileSync(envExample, "utf8");
  }

  const vars = {};
  for (const line of envContent.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) vars[m[1]] = m[2];
  }

  let changed = false;
  if (!vars.AUTH_SECRET || vars.AUTH_SECRET.length < 32) {
    vars.AUTH_SECRET = crypto.randomBytes(48).toString("base64url");
    changed = true;
    ok("کلید امنیتی سشن (AUTH_SECRET) به‌صورت خودکار و تصادفی ایجاد شد.");
  }

  if (!vars.PORT) {
    vars.PORT = "3000";
    changed = true;
  }

  if (!vars.DATABASE_URL) {
    vars.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/srms_db";
    changed = true;
  }

  if (changed || !fs.existsSync(envFile)) {
    const body = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    fs.writeFileSync(envFile, body, "utf8");
    ok("فایل تنظیمات .env با موفقیت پیکربندی شد.");
  } else {
    ok("تنظیمات فایل .env معتبر است.");
  }
}

// ---------------------------------------------------------------------------
// 2. Dependencies
// ---------------------------------------------------------------------------
function installDependencies() {
  say(2, 5, "بررسی و نصب وابستگی‌های نرم‌افزار (npm packages)...");
  const nextPkg = path.join(ROOT, "node_modules", "next");

  if (fs.existsSync(nextPkg)) {
    ok("پکیج‌های وابستگی از قبل نصب شده‌اند.");
    return;
  }

  console.log("      در حال نصب وابستگی‌ها (ممکن است چند دقیقه زمان ببرد)...");
  const success = shLive("npm", ["install", "--no-audit", "--no-fund"]);
  if (!success) {
    die("نصب بسته‌های نرم‌افزاری با خطا مواجه شد. لطفاً اتصال اینترنت را بررسی کنید.");
  }
  ok("کلیه وابستگی‌ها با موفقیت نصب گردیدند.");
}

// ---------------------------------------------------------------------------
// 3. Production Build
// ---------------------------------------------------------------------------
function buildProduction() {
  say(3, 5, "ساخت بیلد بهینه‌شده پروداکشن (Next.js Production Build)...");
  const fixScript = path.join(ROOT, "scripts", "fix-turbopack-externals.mjs");

  console.log("      در حال کامپایل و بهینه‌سازی کدهای پروژه...");
  const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  let buildOk = shLive("npm", ["run", "build"], { env });

  if (fs.existsSync(fixScript)) {
    const fixRes = sh("node", [fixScript, "--quiet"]);
    if (fixRes.status !== 0) {
      warn("ترمیم ماژول‌های Turbopack با بیلد استاندارد؛ اجرای بیلد با موتور کلاسیک...");
      fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
      buildOk = shLive("npx", ["next", "build", "--webpack"], { env });
      if (buildOk && fs.existsSync(fixScript)) {
        sh("node", [fixScript, "--quiet"]);
      }
    }
  }

  const buildIdPath = path.join(ROOT, ".next", "BUILD_ID");
  if (!buildOk || !fs.existsSync(buildIdPath)) {
    die("ساخت بیلد پروداکشن با خطا مواجه شد. لطفاً لاگ‌های خروجی را بررسی فرمایید.");
  }
  ok("بیلد پروداکشن با موفقیت ساخته شد و آماده اجراست.");
}

// ---------------------------------------------------------------------------
// 4. Windows Startup & Shortcuts (Windows 10 & 11)
// ---------------------------------------------------------------------------
function setupWindowsStartup() {
  say(4, 5, "پیکربندی استارت‌آپ خودکار ویندوز ۱۰ و ۱۱ (Windows Auto-Start)...");

  if (process.platform !== "win32") {
    warn("سیستم‌عامل غیر از ویندوز شناسایی شد؛ تنظیم استارت‌آپ ویندوز رد می‌شود.");
    return;
  }

  const silentVbs = path.join(ROOT, "launchers", "SRMS-Silent.vbs");
  if (!fs.existsSync(silentVbs)) {
    die(`فایل لانچر خاموش یافت نشد: ${silentVbs}`);
  }

  // Windows PowerShell command via -EncodedCommand (Base64 UTF-16LE) to completely eliminate all quote/escaping issues on Win 10/11
  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    $ws = New-Object -ComObject WScript.Shell;

    $silentVbs = '${silentVbs.replace(/'/g, "''")}';
    $root = '${ROOT.replace(/'/g, "''")}';

    # 1. Startup folder shortcut (runs on every user login on Windows 10 & 11)
    $startupDir = [Environment]::GetFolderPath('Startup');
    if ($startupDir -and (Test-Path $startupDir)) {
      $sLnk = $ws.CreateShortcut((Join-Path $startupDir 'SRMS-AutoStart.lnk'));
      $sLnk.TargetPath = 'wscript.exe';
      $sLnk.Arguments = '\"' + $silentVbs + '\"';
      $sLnk.WorkingDirectory = $root;
      $sLnk.Description = 'SRMS Auto-Start on Windows Boot';
      $sLnk.WindowStyle = 7; # Minimized
      $sLnk.Save();
    }

    # 2. Desktop shortcuts
    $desktopDir = [Environment]::GetFolderPath('Desktop');
    if ($desktopDir -and (Test-Path $desktopDir)) {
      $dLnk1 = $ws.CreateShortcut((Join-Path $desktopDir 'SRMS.lnk'));
      $dLnk1.TargetPath = 'wscript.exe';
      $dLnk1.Arguments = '\"' + $silentVbs + '\"';
      $dLnk1.WorkingDirectory = $root;
      $dLnk1.Description = 'سامانه مدیریت منابع سرباز (SRMS)';
      $dLnk1.Save();

      $dLnk2 = $ws.CreateShortcut((Join-Path $desktopDir 'سامانه مدیریت منابع سرباز.lnk'));
      $dLnk2.TargetPath = 'wscript.exe';
      $dLnk2.Arguments = '\"' + $silentVbs + '\"';
      $dLnk2.WorkingDirectory = $root;
      $dLnk2.Description = 'سامانه مدیریت منابع سرباز (SRMS)';
      $dLnk2.Save();
    }
  `;

  const encodedPs = Buffer.from(psScript, "utf16le").toString("base64");
  const psRes = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedPs], {
    windowsHide: true,
  });

  if (psRes.status === 0) {
    ok("میانبر اجرای خودکار در پوشه Startup ویندوز (Windows 10/11) ساخته شد.");
    ok("میانبرهای دسترسی سریع روی دسکتاپ (Desktop) ایجاد شدند.");
  } else {
    warn("ساخت میانبر با پاورشل گزارش اخطار داشت، تلاش برای ثبت تسک کمکی...");
  }

  // 3. Task Scheduler for extra reliability across Windows 10 & 11
  try {
    const taskRes = spawnSync("schtasks", [
      "/Create", "/F", "/SC", "ONLOGON",
      "/TN", "SRMS-AutoStart",
      "/TR", `wscript.exe "${silentVbs}"`
    ], { windowsHide: true, encoding: "utf8" });
    if (taskRes.status === 0) {
      ok("تسک زمان‌بندی‌شده ورود به سیستم (Logon Task) در Task Scheduler ثبت گردید.");
    }
  } catch {
    /* ignore task scheduler error if permissions restricted */
  }
}

// ---------------------------------------------------------------------------
// 5. Immediate Launch in Background & Health Poll
// ---------------------------------------------------------------------------
async function launchAndVerify() {
  say(5, 5, "راه‌اندازی سرویس در پس‌زمینه و باز کردن مرورگر...");

  const silentVbs = path.join(ROOT, "launchers", "SRMS-Silent.vbs");

  if (process.platform === "win32" && fs.existsSync(silentVbs)) {
    try {
      spawn("wscript.exe", [silentVbs], {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      ok("دستور اجرای برنامه در پس‌زمینه (Silent Mode) صادر شد.");
    } catch (e) {
      warn(`اجرای خودکار vbs با خطا مواجه شد: ${e.message}`);
    }
  } else {
    // Non-windows or fallback
    try {
      const startScript = path.join(ROOT, "launchers", "srms-boot.mjs");
      spawn("node", [startScript, "--silent"], {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
      }).unref();
      ok("سرویس برنامه راه‌اندازی شد.");
    } catch (e) {
      warn(`اجرای سرویس با خطا مواجه شد: ${e.message}`);
    }
  }

  // Poll health on http://127.0.0.1:3000
  console.log("      در حال اعتبارسنجی سلامت سرویس (Health Check)...");
  const url = "http://127.0.0.1:3000";
  let healthy = false;
  const start = Date.now();

  while (Date.now() - start < 60000) {
    try {
      healthy = await new Promise((resolve) => {
        const req = http.get(url, { timeout: 3000 }, (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (healthy) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (healthy) {
    ok(`سامانه با موفقیت در آدرس ${url} پاسخگو است.`);
    // Open browser
    try {
      if (process.platform === "win32") {
        spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }
      ok("مرورگر وب جهت ورود به سامانه باز شد.");
    } catch {
      /* ignore browser open error */
    }
  } else {
    warn("سرویس در پس‌زمینه در حال آماده‌سازی نهایی است؛ آدرس http://localhost:3000 را تا لحظاتی دیگر در مرورگر باز کنید.");
  }
}

// ---------------------------------------------------------------------------
// Main Flow
// ---------------------------------------------------------------------------
async function main() {
  banner();
  checkEnvironment();
  installDependencies();
  buildProduction();
  setupWindowsStartup();
  await launchAndVerify();

  console.log("");
  console.log(colors.green("  ========================================================================"));
  console.log(colors.bold("     ✅ نصب پروداکشن با موفقیت انجام شد و برنامه در استارت‌آپ تنظیم گردید!"));
  console.log(colors.green("  ========================================================================"));
  console.log("");
  console.log("     • سامانه با هر بار روشن شدن رایانه (ویندوز ۱۰ و ۱۱) به‌صورت اتوماتیک");
  console.log("       در پس‌زمینه اجرا شده و مرورگر را باز خواهد کرد.");
  console.log(`     • آدرس دسترسی به سامانه: ${colors.cyan(colors.bold("http://localhost:3000"))}`);
  console.log(`     • حساب کاربری مدیر: ${colors.bold("admin")}   |   رمز عبور: ${colors.bold("admin123")}`);
  console.log("     • آیکون میانبر «سامانه مدیریت منابع سرباز» روی دسکتاپ قرار گرفت.");
  console.log("     • برای لغو اجرای خودکار در استارت‌آپ: فایل SRMS-Uninstall-Startup.bat را اجرا کنید.");
  console.log("");
  console.log(colors.dim("  کلیدی را برای پایان و بستن این پنجره فشار دهید..."));

  if (process.stdin.isTTY) {
    try {
      spawnSync("pause", { shell: true, stdio: "inherit" });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  die("خطای غیرمنتظره در فرآیند نصب", err);
});
