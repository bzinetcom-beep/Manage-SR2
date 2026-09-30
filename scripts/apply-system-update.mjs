#!/usr/bin/env node
/* -----------------------------------------------------------------------------
 * SRMS — نصب بروزرسانی کامل سامانه از فایل ZIP (فرایند مستقل از سرور)
 * -----------------------------------------------------------------------------
 *   node scripts/apply-system-update.mjs <plan.json>
 *
 * این اسکریپت توسط API «/api/updates/system/install» (یا rollback) اجرا می‌شود:
 *   ۱. نسخه‌ی پشتیبان از فایل‌هایی که بازنویسی می‌شوند (snapshot)
 *   ۲. جایگزینی فایل‌ها از ZIP
 *   ۳. نصب وابستگی‌های جدید (npm install)
 *   ۴. هم‌گام‌سازی جدول‌های دیتابیس (بدون حذف داده — تغییرات مخرب هرگز خودکار اعمال نمی‌شود)
 *   ۵. ساخت نسخه‌ی پروداکشن (npm run build)
 *   ۶. راه‌اندازی مجدد سرور
 * در صورت خطا در هر مرحله‌ی حساس، فایل‌ها به حالت قبل برمی‌گردند.
 * --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import JSZip from "jszip";

const planPath = process.argv[2];
if (!planPath || !fs.existsSync(planPath)) {
  console.error("usage: node scripts/apply-system-update.mjs <plan.json>");
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const ROOT = plan.cwd;
process.chdir(ROOT);
const isWin = process.platform === "win32";

/* ------------------------------ status helpers ----------------------------- */
let status = {};
try {
  status = JSON.parse(fs.readFileSync(plan.statusFile, "utf8"));
} catch {
  status = {};
}
function save(patch = {}, line) {
  status = { ...status, ...patch };
  if (line) {
    status.log = [...(status.log || []), `[${new Date().toLocaleTimeString("en-GB")}] ${line}`].slice(-250);
  }
  try {
    fs.writeFileSync(plan.statusFile, JSON.stringify(status, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    shell: isWin,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CI: "1" },
    ...opts,
  });
}

function tail(text, n = 12) {
  return String(text || "").trim().split(/\r?\n/).slice(-n).join("\n");
}

/* --------------------------------- restore --------------------------------- */
async function restoreSnapshot(zipPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  let restored = 0;
  for (const rel of manifest.modified || []) {
    const entry = zip.file(`files/${rel}`);
    if (!entry) continue;
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await entry.async("uint8array")));
    restored++;
  }
  for (const rel of manifest.added || []) {
    fs.rmSync(path.join(ROOT, rel), { force: true });
    restored++;
  }
  return restored;
}

/* ---------------------------------- build ---------------------------------- */
function runBuild() {
  const args = isWin ? ["next", "build", "--webpack"] : ["run", "build"];
  const cmd = isWin ? "npx" : "npm";
  const r = sh(cmd, args);
  return { ok: r.status === 0, out: `${r.stdout || ""}\n${r.stderr || ""}` };
}

/* --------------------------------- restart --------------------------------- */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function restartServer() {
  const port = String(plan.port || 3000);
  save({ step: "restart", progress: 96 }, "راه‌اندازی مجدد سرور…");

  const pid = Number(plan.serverPid);
  if (pid && pid !== process.pid && isAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
    for (let i = 0; i < 40 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 500));
    if (isAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const child = spawn(isWin ? "npm.cmd" : "npm", ["run", "start", "--", "--port", port], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: isWin,
    windowsHide: true,
    env: { ...process.env, PORT: port, NODE_ENV: "production" },
  });
  child.unref();
}

/* ---------------------------------- flows ---------------------------------- */
async function doInstall() {
  const stamp = plan.id;
  const snapZip = path.join(plan.snapshotsDir, `system-${stamp}.zip`);
  const snapMeta = path.join(plan.snapshotsDir, `system-${stamp}.json`);

  // ۱) snapshot
  save({ state: "running", step: "snapshot", progress: 8, snapshotId: String(stamp) }, "تهیه‌ی نسخه‌ی پشتیبان از فایل‌های فعلی…");
  const snap = new JSZip();
  const modified = plan.files.filter((f) => f.action === "modify").map((f) => f.rel);
  const added = plan.files.filter((f) => f.action === "add").map((f) => f.rel);
  for (const rel of modified) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) snap.file(`files/${rel}`, fs.readFileSync(p));
  }
  snap.file("manifest.json", JSON.stringify({ modified, added, version: plan.version, previousVersion: plan.previousVersion }));
  fs.mkdirSync(plan.snapshotsDir, { recursive: true });
  fs.writeFileSync(snapZip, await snap.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  fs.writeFileSync(
    snapMeta,
    JSON.stringify({
      id: String(stamp),
      version: plan.version,
      previousVersion: plan.previousVersion,
      createdAt: new Date().toISOString(),
      filesCount: plan.files.length,
      rolledBack: false,
    }),
  );
  save({ progress: 15 }, `نسخه‌ی پشتیبان ساخته شد (${modified.length} فایل قابل بازگشت)`);

  const fail = async (message, step) => {
    save({ step: "rollback", progress: 70 }, `خطا در مرحله‌ی «${step}»: ${message}`);
    save({}, "بازگرداندن فایل‌ها به نسخه‌ی قبل…");
    try {
      const n = await restoreSnapshot(snapZip);
      save({}, `${n} فایل بازگردانده شد؛ ساخت مجدد نسخه‌ی قبلی…`);
      const b = runBuild();
      save({}, b.ok ? "نسخه‌ی قبلی دوباره ساخته شد." : `ساخت مجدد ناموفق بود:\n${tail(b.out)}`);
    } catch (e) {
      save({}, `بازگردانی هم با خطا مواجه شد: ${e.message}`);
    }
    save({ state: "rolled_back", step, progress: 100, error: message, finishedAt: new Date().toISOString() }, "بروزرسانی لغو شد و سامانه به حالت قبل برگشت.");
    if (plan.restart) await restartServer();
    process.exit(1);
  };

  // ۲) extract
  save({ step: "extract", progress: 25 }, "جایگزینی فایل‌های جدید…");
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(plan.zipPath));
    let n = 0;
    for (const f of plan.files) {
      const entry = zip.file(`${plan.prefix}${f.rel}`);
      if (!entry) continue;
      const dest = path.join(ROOT, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await entry.async("uint8array")));
      n++;
    }
    save({ progress: 40 }, `${n} فایل نصب شد.`);
  } catch (e) {
    return fail(e.message, "extract");
  }

  // ۳) dependencies
  if (plan.newDependencies?.length) {
    save({ step: "deps", progress: 45 }, `نصب ${plan.newDependencies.length} وابستگی جدید…`);
    const specs = plan.newDependencies.map((d) => `${d.name}@${d.range}`);
    const r = sh(isWin ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps", ...specs]);
    if (r.status !== 0) return fail(`npm install ناموفق بود\n${tail(r.stderr || r.stdout)}`, "deps");
    save({ progress: 55 }, "وابستگی‌ها نصب شد.");
  }

  // ۴) schema (بدون --force؛ تغییرات مخرب هرگز خودکار اعمال نمی‌شود)
  if (plan.schemaChanged) {
    save({ step: "schema", progress: 58 }, "هم‌گام‌سازی جدول‌های دیتابیس…");
    try {
      const r = sh(isWin ? "npx.cmd" : "npx", ["drizzle-kit", "push"], { timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
      save({}, r.status === 0 ? "جدول‌ها هم‌گام شد." : "هم‌گام‌سازی خودکار انجام نشد؛ راه‌اندازی برنامه ستون‌های لازم را خودش می‌سازد.");
    } catch {
      save({}, "هم‌گام‌سازی جدول‌ها رد شد (غیرحیاتی).");
    }
  }

  // ۵) build
  save({ step: "build", progress: 62 }, "ساخت نسخه‌ی پروداکشن (ممکن است چند دقیقه طول بکشد)…");
  const b = runBuild();
  if (!b.ok) return fail(`ساخت پروژه ناموفق بود\n${tail(b.out, 20)}`, "build");
  save({ progress: 92 }, "ساخت نسخه‌ی جدید با موفقیت انجام شد.");

  // ۶) done (+ restart)
  save(
    { state: "done", step: plan.restart ? "restart" : "done", progress: 100, finishedAt: new Date().toISOString() },
    plan.restart ? "نصب کامل شد؛ راه‌اندازی مجدد سرور…" : "نصب کامل شد. برای اعمال، سرور را دوباره راه‌اندازی کنید.",
  );
  try {
    fs.rmSync(plan.zipPath, { force: true });
  } catch {
    /* ignore */
  }
  if (plan.restart) await restartServer();
}

async function doRollback() {
  save({ state: "running", step: "extract", progress: 10 }, "بازگرداندن فایل‌ها از نسخه‌ی پشتیبان…");
  try {
    const n = await restoreSnapshot(plan.snapshotZip);
    save({ progress: 40 }, `${n} فایل بازگردانده شد.`);
  } catch (e) {
    save({ state: "failed", error: e.message, progress: 100, finishedAt: new Date().toISOString() }, `بازگشت ناموفق: ${e.message}`);
    process.exit(1);
  }
  save({ step: "build", progress: 50 }, "ساخت نسخه‌ی قبلی…");
  const b = runBuild();
  if (!b.ok) {
    save({ state: "failed", error: `ساخت ناموفق\n${tail(b.out, 20)}`, progress: 100, finishedAt: new Date().toISOString() }, "ساخت پس از بازگشت ناموفق بود.");
    process.exit(1);
  }
  try {
    const meta = JSON.parse(fs.readFileSync(plan.snapshotMeta, "utf8"));
    meta.rolledBack = true;
    fs.writeFileSync(plan.snapshotMeta, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
  save(
    { state: "done", step: plan.restart ? "restart" : "done", progress: 100, finishedAt: new Date().toISOString() },
    plan.restart ? "بازگشت کامل شد؛ راه‌اندازی مجدد سرور…" : "بازگشت کامل شد.",
  );
  if (plan.restart) await restartServer();
}

try {
  if (plan.mode === "rollback") await doRollback();
  else await doInstall();
} catch (e) {
  save({ state: "failed", error: String(e?.message || e), progress: 100, finishedAt: new Date().toISOString() }, `خطای پیش‌بینی‌نشده: ${e?.message || e}`);
  process.exit(1);
}
