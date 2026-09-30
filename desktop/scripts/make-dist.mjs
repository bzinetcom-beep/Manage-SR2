#!/usr/bin/env node
/**
 * SRMS — Desktop packaging orchestrator
 * -----------------------------------------------------------------------------
 * One command produces the customer-ready artefacts:
 *
 *     cd desktop && npm install && npm run dist
 *
 * Steps
 *   1. install web dependencies (if missing)
 *   2. `next build` with output:"standalone"  → self-contained server
 *   3. stage  .next/standalone + .next/static + public  → .desktop-stage/app
 *   4. copy optional portable PostgreSQL      → .desktop-stage/pgsql
 *   5. run electron-builder                   → dist-desktop/SRMS-Setup-x.y.z.exe
 *
 * Flags: --portable (portable exe only) | --dir (unpacked folder, fast test)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, "..");
const ROOT = path.resolve(DESKTOP, "..");
const STAGE = path.join(ROOT, ".desktop-stage");
const STAGE_APP = path.join(STAGE, "app");
const STAGE_PG = path.join(STAGE, "pgsql");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

let step = 0;
const say = (m) => console.log(`\n\x1b[36m[${++step}]\x1b[0m ${m}`);
const ok = (m) => console.log(`    \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`    \x1b[33m!\x1b[0m ${m}`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    console.error(`\n\x1b[31m✗ command failed:\x1b[0m ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

// ---------------------------------------------------------------------------

console.log("\n\x1b[1m🛡  SRMS — ساخت بسته نصبی دسکتاپ\x1b[0m");

say("نصب وابستگی‌های وب");
if (!fs.existsSync(path.join(ROOT, "node_modules", "next"))) {
  const lock = fs.existsSync(path.join(ROOT, "package-lock.json"));
  run("npm", [lock ? "ci" : "install"], { cwd: ROOT });
} else {
  ok("از قبل نصب شده است");
}

say("بیلد پروداکشن Next.js (standalone)");
rmrf(path.join(ROOT, ".next"));
run("npm", ["run", "build"], {
  cwd: ROOT,
  env: { ...process.env, SRMS_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
// Turbopack may fail to emit the hashed external-module links (always on
// Windows without Developer Mode). Repair them before staging, otherwise the
// packaged app throws "Failed to load external module pg-<hash>" at runtime.
const fixExternals = path.join(ROOT, "scripts", "fix-turbopack-externals.mjs");
if (fs.existsSync(fixExternals)) {
  const r = spawnSync("node", [fixExternals], { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    warn("ترمیم Turbopack ناموفق بود؛ بیلد مجدد با موتور webpack");
    rmrf(path.join(ROOT, ".next"));
    run("npx", ["next", "build", "--webpack"], {
      cwd: ROOT,
      env: { ...process.env, SRMS_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" },
    });
    spawnSync("node", [fixExternals], { stdio: "inherit", cwd: ROOT });
  }
}

const standalone = path.join(ROOT, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error(
    "\n\x1b[31m✗ خروجی standalone تولید نشد.\x1b[0m " +
      'مطمئن شوید next.config.ts در حالت SRMS_DESKTOP_BUILD=1 مقدار output:"standalone" را ست می‌کند.',
  );
  process.exit(1);
}
ok("standalone آماده شد");

say("آماده‌سازی فایل‌های اجرایی برنامه");
rmrf(STAGE);
fs.mkdirSync(STAGE_APP, { recursive: true });
copyDir(standalone, STAGE_APP);
copyDir(path.join(ROOT, ".next", "static"), path.join(STAGE_APP, ".next", "static"));
copyDir(path.join(ROOT, "public"), path.join(STAGE_APP, "public"));
// Ship the SQL bootstrap helper the server imports at runtime.
for (const f of ["package-lock.json"]) rmrf(path.join(STAGE_APP, f));
ok(`استیج شد → ${path.relative(ROOT, STAGE_APP)}`);

say("پایگاه‌داده قابل حمل (اختیاری)");
const pgSource =
  process.env.SRMS_PG_PORTABLE || path.join(ROOT, "vendor", "pgsql");
fs.mkdirSync(STAGE_PG, { recursive: true });
if (fs.existsSync(path.join(pgSource, "bin"))) {
  copyDir(pgSource, STAGE_PG);
  ok("PostgreSQL قابل حمل بسته‌بندی شد (لایه ۲ فعال)");
} else {
  fs.writeFileSync(
    path.join(STAGE_PG, "README.txt"),
    [
      "Optional embedded PostgreSQL.",
      "",
      "To enable the fastest / most robust database tier, download the ZIP build",
      "of PostgreSQL (https://www.enterprisedb.com/download-postgresql-binaries),",
      "extract it so that <vendor/pgsql>/bin/pg_ctl.exe exists, then rebuild.",
      "",
      "If absent, SRMS automatically falls back to a locally installed PostgreSQL,",
      "and finally to the built-in PGlite engine — the app always starts.",
    ].join("\n"),
    "utf8",
  );
  warn("باینری قابل حمل یافت نشد → لایه‌های ۳ و ۴ استفاده می‌شوند");
}

say("نصب وابستگی‌های پوسته دسکتاپ");
if (!fs.existsSync(path.join(DESKTOP, "node_modules", "electron"))) {
  run("npm", ["install"], { cwd: DESKTOP });
} else {
  ok("از قبل نصب شده است");
}

say("ساخت خروجی نهایی با electron-builder");
const targets = has("--dir") ? ["--dir"] : has("--portable") ? ["--win", "portable"] : ["--win"];
run("npx", ["electron-builder", "--config", "electron-builder.yml", ...targets], { cwd: DESKTOP });

console.log("\n\x1b[32m\x1b[1m✓ بسته نصبی آماده شد\x1b[0m");
console.log(`  → ${path.join(ROOT, "dist-desktop")}\n`);
console.log("  SRMS-Setup-1.0.0.exe    ← نصب‌کننده (تحویل به مشتری)");
console.log("  SRMS-Portable-1.0.0.exe ← نسخه پرتابل (بدون نصب)\n");
