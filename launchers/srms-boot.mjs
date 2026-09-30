#!/usr/bin/env node
/**
 * SRMS — Universal one-click boot orchestrator (fallback / developer path)
 * -----------------------------------------------------------------------------
 * Used by SRMS-Start.bat (Windows) and SRMS-Start.command (macOS/Linux) when the
 * packaged desktop application is not being used. Requires only Node.js.
 *
 * It performs, unattended and idempotently:
 *   1. environment check          (Node version)
 *   2. .env provisioning          (auto-generated AUTH_SECRET)
 *   3. database discovery         (system PostgreSQL, auto-create database)
 *   4. dependency installation    (only when node_modules is missing/stale)
 *   5. production build           (only when the build is missing/stale)
 *   6. server start + health poll (schema + default users self-heal on boot)
 *   7. browser launch
 *
 * Flags: --no-open  --no-build  --port <n>  --check (dry run, exits after step 5)
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "srms-startup.log");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const CHECK_ONLY = flag("--check");
const NO_OPEN = flag("--no-open") || CHECK_ONLY;
const NO_BUILD = flag("--no-build");
const SILENT = flag("--silent"); // launched from SRMS-Silent.vbs (hidden window)
const WANT_PORT = Number(opt("--port", process.env.PORT || 3000));

fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Pretty, log-file-backed console
// ---------------------------------------------------------------------------
let step = 0;
const stamp = () => new Date().toISOString();
function toLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, `[${stamp()}] ${line}\n`, "utf8");
  } catch {
    /* logging must never break the launcher */
  }
}
const say = (m) => {
  const l = `[${++step}/7] ${m}`;
  console.log(`\x1b[36m${l}\x1b[0m`);
  toLog(l);
};
const ok = (m) => {
  console.log(`      \x1b[32m✓\x1b[0m ${m}`);
  toLog(`  OK  ${m}`);
};
const warn = (m) => {
  console.log(`      \x1b[33m!\x1b[0m ${m}`);
  toLog(`  WARN ${m}`);
};
/**
 * When launched hidden (desktop shortcut → SRMS-Silent.vbs) there is no console
 * for the user to read, so surface fatal errors in a native Windows dialog.
 */
function showDialog(text) {
  if (process.platform !== "win32") return;
  const safe = String(text).replace(/'/g, "''").slice(0, 900);
  try {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        `Add-Type -AssemblyName PresentationFramework; ` +
          `[System.Windows.MessageBox]::Show('${safe}','SRMS','OK','Error') | Out-Null`,
      ],
      { windowsHide: true, timeout: 120000 },
    );
  } catch {
    /* a dialog failure must never mask the original error */
  }
}

const die = (m, e) => {
  console.error(`\n\x1b[31m✗ ${m}\x1b[0m`);
  if (e) console.error(String(e.message || e));
  toLog(`FATAL ${m} :: ${e ? e.stack || e.message || e : ""}`);
  console.error(`\nگزارش کامل: ${LOG_FILE}`);
  if (SILENT) {
    showDialog(
      `${m}\n\n${e ? String(e.message || e) : ""}\n\n` +
        `راه‌حل پیشنهادی: روی SRMS-Repair.bat دابل‌کلیک کنید.\n\n` +
        `گزارش کامل:\n${LOG_FILE}`,
    );
  }
  process.exit(1);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
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

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------
function freePort(preferred) {
  return new Promise((resolve) => {
    let p = preferred;
    let n = 0;
    const test = () => {
      const s = net.createServer();
      s.unref();
      s.once("error", () => {
        p += 1;
        if (++n > 50) return resolve(0);
        test();
      });
      s.listen(p, "127.0.0.1", () => s.close(() => resolve(p)));
    };
    test();
  });
}

function waitHttp(url, timeoutMs = 180000) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, { timeout: 4000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 400) resolve(true);
        else retry();
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", retry);
    };
    const retry = () => (Date.now() > end ? reject(new Error(`no response: ${url}`)) : setTimeout(attempt, 600));
    attempt();
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    warn("مرورگر به‌صورت خودکار باز نشد؛ آدرس را دستی باز کنید.");
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function stepNode() {
  say("بررسی محیط اجرا");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) die(`Node.js نسخه ${process.versions.node} پشتیبانی نمی‌شود. نسخه ۲۰ یا بالاتر لازم است.`);
  ok(`Node.js ${process.versions.node} روی ${os.platform()} ${os.arch()}`);
}

function readEnv() {
  const f = path.join(ROOT, ".env");
  const out = {};
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
  }
  return out;
}

function writeEnv(vars) {
  const body = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  fs.writeFileSync(path.join(ROOT, ".env"), body, "utf8");
}

function stepEnv() {
  say("آماده‌سازی تنظیمات محیطی");
  const env = readEnv();
  let changed = false;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    env.AUTH_SECRET = crypto.randomBytes(48).toString("base64url");
    changed = true;
    ok("کلید امنیتی (AUTH_SECRET) به‌صورت تصادفی ساخته شد");
  }
  if (!env.DATABASE_URL) {
    env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/srms_db";
    changed = true;
  }
  if (changed) writeEnv(env);
  ok(".env آماده است");
  return env;
}

async function pgProbe(url) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  try {
    await c.connect();
    await c.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    try { await c.end(); } catch { /* ignore */ }
  }
}

async function pgEnsureDb(adminUrl, dbName) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 4000 });
  await c.connect();
  try {
    const { rows } = await c.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]);
    if (!rows.length) await c.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await c.end();
  }
}

async function stepDatabase(env) {
  say("آماده‌سازی پایگاه‌داده");

  if (await pgProbe(env.DATABASE_URL)) {
    ok("اتصال به پایگاه‌داده پیکربندی‌شده برقرار شد");
    return env.DATABASE_URL;
  }

  // Same server, database not created yet?
  try {
    const u = new URL(env.DATABASE_URL);
    const dbName = u.pathname.replace(/^\//, "") || "srms_db";
    const admin = new URL(env.DATABASE_URL);
    admin.pathname = "/postgres";
    if (await pgProbe(admin.toString())) {
      await pgEnsureDb(admin.toString(), dbName);
      ok(`پایگاه‌داده «${dbName}» ساخته شد`);
      return env.DATABASE_URL;
    }
  } catch { /* fall through */ }

  // Discover a local server with common credentials.
  warn("اتصال پیش‌فرض ناموفق بود؛ جستجوی PostgreSQL محلی…");
  for (const port of [5432, 5433, 5434]) {
    for (const pass of ["postgres", "admin", "123456", "1234", "root", "password"]) {
      const admin = `postgresql://postgres:${encodeURIComponent(pass)}@127.0.0.1:${port}/postgres`;
      // eslint-disable-next-line no-await-in-loop
      if (await pgProbe(admin)) {
        // eslint-disable-next-line no-await-in-loop
        await pgEnsureDb(admin, "srms_db");
        const url = `postgresql://postgres:${encodeURIComponent(pass)}@127.0.0.1:${port}/srms_db`;
        writeEnv({ ...env, DATABASE_URL: url });
        ok(`PostgreSQL روی پورت ${port} پیدا و پیکربندی شد`);
        return url;
      }
    }
  }

  die(
    "PostgreSQL در دسترس نیست.\n" +
      "  • یا PostgreSQL را نصب کنید (https://postgresql.org/download)\n" +
      "  • یا نسخه دسکتاپ SRMS را نصب کنید که پایگاه‌داده داخلی دارد و به هیچ نصبی نیاز ندارد.",
  );
  return null;
}

function stepDeps() {
  say("بررسی وابستگی‌ها");
  if (fs.existsSync(path.join(ROOT, "node_modules", "next"))) {
    ok("وابستگی‌ها نصب هستند");
    return;
  }
  console.log("      نصب پکیج‌ها (فقط بار اول، چند دقیقه)…");
  const lock = fs.existsSync(path.join(ROOT, "package-lock.json"));
  if (!shLive("npm", [lock ? "ci" : "install", "--no-audit", "--no-fund"])) {
    die("نصب وابستگی‌ها ناموفق بود. اتصال اینترنت را بررسی کنید.");
  }
  ok("وابستگی‌ها نصب شدند");
}

function newestMtime(dir, acc = { t: 0 }) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc.t; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) newestMtime(p, acc);
    else {
      try { acc.t = Math.max(acc.t, fs.statSync(p).mtimeMs); } catch { /* ignore */ }
    }
  }
  return acc.t;
}

const FIX_EXTERNALS = path.join(ROOT, "scripts", "fix-turbopack-externals.mjs");

/**
 * Turbopack references server-only packages through hashed aliases that live in
 * `.next/node_modules/<pkg>-<hash>` as symlinks. On Windows those links need
 * Developer Mode to be created, and a `.next` copied from another machine
 * points at hashes that do not exist. Both produce, at runtime:
 *     "Failed to load external module pg-xxxxxxxxxxxxxxxx"
 * `--verify` reports the health without writing anything.
 */
function externalsHealthy() {
  if (!fs.existsSync(FIX_EXTERNALS)) return true;
  return sh("node", [FIX_EXTERNALS, "--verify", "--quiet"]).status === 0;
}

function repairExternals() {
  if (!fs.existsSync(FIX_EXTERNALS)) return true;
  const r = sh("node", [FIX_EXTERNALS, "--quiet"]);
  if (r.stdout && r.stdout.trim()) console.log(r.stdout.trimEnd());
  return r.status === 0;
}

function runBuild(useWebpack = false) {
  console.log(`      ساخت نسخه پروداکشن${useWebpack ? " (webpack)" : ""} (چند دقیقه)…`);
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  return useWebpack
    ? shLive("npx", ["next", "build", "--webpack"], { env })
    : shLive("npm", ["run", "build"], { env });
}

function stepBuild() {
  say("بررسی بیلد برنامه");
  if (NO_BUILD) {
    if (!externalsHealthy()) repairExternals();
    return ok("بیلد به‌درخواست کاربر رد شد");
  }

  const marker = path.join(ROOT, ".next", "BUILD_ID");
  let needBuild = !fs.existsSync(marker);

  if (!needBuild) {
    try {
      const built = fs.statSync(marker).mtimeMs;
      if (newestMtime(path.join(ROOT, "src")) > built) {
        needBuild = true;
        warn("کدها تغییر کرده‌اند؛ بیلد مجدد لازم است");
      }
    } catch {
      needBuild = true;
    }
  }

  // A cached build whose external modules cannot be resolved is worthless:
  // the server starts, then every database request throws. Try a cheap
  // in-place repair first; only rebuild when the repair is impossible.
  if (!needBuild && !externalsHealthy()) {
    warn("ماژول‌های خارجی بیلد ناقص‌اند (خطای «Failed to load external module»)");
    if (repairExternals()) {
      ok("ماژول‌های خارجی ترمیم شدند — نیازی به بیلد مجدد نیست");
    } else {
      warn("ترمیم ممکن نشد؛ بیلد از ابتدا انجام می‌شود");
      fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
      needBuild = true;
    }
  }

  if (!needBuild) return ok("بیلد معتبر موجود است");

  if (!runBuild(false)) die("بیلد برنامه ناموفق بود. جزئیات در خروجی بالا.");

  // Post-build safety net: recreate any link Turbopack failed to write.
  if (!repairExternals()) {
    warn("ماژول‌های خارجی Turbopack ساخته نشدند؛ تلاش با موتور webpack");
    fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
    if (!runBuild(true)) die("بیلد با webpack هم ناموفق بود.");
    repairExternals();
  }
  ok("بیلد با موفقیت انجام شد");
}

async function stepStart(databaseUrl, env) {
  say("راه‌اندازی سرویس");
  const port = await freePort(WANT_PORT);
  if (!port) die("هیچ پورت آزادی پیدا نشد.");
  const origin = `http://127.0.0.1:${port}`;

  const isWin = process.platform === "win32";
  const child = spawn("npm", ["run", "start", "--", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    shell: isWin,
    // POSIX: own process group so we can terminate npm *and* its Next children.
    detached: !isWin,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: env.AUTH_SECRET,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  child.stdout.on("data", (b) => toLog(`[server] ${b.toString().trimEnd()}`));
  child.stderr.on("data", (b) => toLog(`[server] ${b.toString().trimEnd()}`));

  let dead = false;
  child.on("exit", (c) => { dead = true; toLog(`[server] exit ${c}`); });

  const shutdown = async () => {
    if (dead) return;
    try {
      if (isWin) {
        // /T kills the whole tree (npm -> next -> next-server workers)
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else {
        process.kill(-child.pid, "SIGTERM"); // negative pid = whole process group
      }
    } catch {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }
    // escalate if anything survives the grace period
    for (let i = 0; i < 12 && !dead; i++) await sleep(250);
    if (!dead && !isWin) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* ignore */ }
    }
    await sleep(200);
  };
  process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
  process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });

  try {
    await waitHttp(`${origin}/api/health`);
  } catch (e) {
    await shutdown();
    die("سرویس در مهلت مقرر بالا نیامد.", e);
  }
  ok(`سرویس آماده است → ${origin}`);

  say("باز کردن برنامه");
  if (!NO_OPEN) { openBrowser(origin); ok("مرورگر باز شد"); }
  else ok("باز کردن مرورگر غیرفعال است");

  console.log(`
\x1b[32m\x1b[1m  ✓ سامانه آماده استفاده است\x1b[0m

    آدرس   : \x1b[1m${origin}\x1b[0m
    ورود   : admin / admin123
    گزارش  : ${LOG_FILE}

  برای خاموش کردن، این پنجره را ببندید یا Ctrl+C بزنید.
`);

  if (CHECK_ONLY) {
    await shutdown();
    console.log("  (حالت --check: سرویس متوقف شد)\n");
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------

(async () => {
  console.log("\n\x1b[1m🛡  سامانه مدیریت منابع سرباز — SRMS\x1b[0m\n");
  toLog("=== boot start ===");
  stepNode();
  const env = stepEnv();
  stepDeps();
  const databaseUrl = await stepDatabase(env);
  stepBuild();
  await stepStart(databaseUrl, env);
})().catch((e) => die("خطای پیش‌بینی‌نشده در راه‌اندازی", e));
