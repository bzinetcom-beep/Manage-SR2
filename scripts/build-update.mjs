#!/usr/bin/env node
/* -----------------------------------------------------------------------------
 * SRMS — سازنده‌ی خودکار فایل بروزرسانی (.srms-update)
 * -----------------------------------------------------------------------------
 *   node scripts/build-update.mjs                 → نسخه‌ی بعدی را می‌سازد
 *   node scripts/build-update.mjs 1.5.0           → نسخه‌ی مشخص
 *   node scripts/build-update.mjs 1.5.0 note.txt  → تغییرات از فایل متنی
 *
 * خروجی: updates/srms-update-v<version>.srms-update
 * این فایل در صفحه‌ی «بروزرسانی سامانه» قابل آپلود است و:
 *   • اسکریپت SQL (و Rollback) را اعمال می‌کند
 *   • در تراکنش اجرا می‌شود، خطا = بازگشت کامل
 *   • در تاریخچه‌ی نسخه‌ها ثبت و قابل Rollback است
 * --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPDATES_DIR = path.join(ROOT, "updates");

/** آخرین نسخه‌ی موجود در پوشه‌ی updates */
function latestVersion() {
  let max = [0, 0, 0];
  for (const f of fs.readdirSync(UPDATES_DIR)) {
    const m = f.match(/srms-update-v(\d+)\.(\d+)\.(\d+)\.srms-update/);
    if (!m) continue;
    const v = m.slice(1, 4).map(Number);
    if (v[0] > max[0] || (v[0] === max[0] && v[1] > max[1]) || (v[0] === max[0] && v[1] === max[1] && v[2] > max[2])) {
      max = v;
    }
  }
  return max.join(".");
}

function bump(v, level = "minor") {
  const [a, b, c] = v.split(".").map(Number);
  if (level === "major") return `${a + 1}.0.0`;
  if (level === "patch") return `${a}.${b}.${c + 1}`;
  return `${a}.${b + 1}.0`;
}

/** تغییر ساختاری (schema) سامانه — با هر تغییر دیتابیس به‌روزرسانی می‌شود */
function buildSql() {
  return `
-- =============================================================
--  SRMS update: ماژول پشتیبان‌گیری و بازیابی (Backup & Restore)
--  Idempotent: اجرای چندباره بدون خطاست.
-- =============================================================
CREATE TABLE IF NOT EXISTS backup_settings (
  id SERIAL PRIMARY KEY,
  directory TEXT NOT NULL DEFAULT 'backups',
  auto_enabled BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT NOT NULL DEFAULT 'daily',
  time_of_day TEXT NOT NULL DEFAULT '02:00',
  day_of_week INTEGER NOT NULL DEFAULT 6,
  retention_count INTEGER NOT NULL DEFAULT 30,
  include_audit BOOLEAN NOT NULL DEFAULT true,
  last_auto_backup_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id SERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'success',
  table_counts JSONB DEFAULT '{}'::jsonb,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  app_version TEXT,
  error_message TEXT,
  restored_at TIMESTAMPTZ,
  created_by INTEGER,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backup_settings (directory, auto_enabled, frequency, time_of_day)
SELECT 'backups', true, 'daily', '02:00'
WHERE NOT EXISTS (SELECT 1 FROM backup_settings);

-- پیش‌فرض: نامه‌های تولیدشده برای سربازان در حال خدمت
CREATE INDEX IF NOT EXISTS soldiers_service_end_idx ON soldiers (service_end_date);
`.trim();
}

function buildRollbackSql() {
  return `
DROP TABLE IF EXISTS backup_runs;
DROP TABLE IF EXISTS backup_settings;
DROP INDEX IF EXISTS soldiers_service_end_idx;
`.trim();
}

function main() {
  const args = process.argv.slice(2);
  const base = latestVersion() || "1.0.0";
  const version = args[0] && /^\d+\.\d+\.\d+$/.test(args[0]) ? args[0] : bump(base, "minor");
  const changelogFile = args.find((a, i) => i > 0 && a && !a.startsWith("--") && a !== version && fs.existsSync(a));

  let changelog = [];
  if (changelogFile && fs.existsSync(changelogFile)) {
    changelog = fs
      .readFileSync(changelogFile, "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*\s]+/, "").trim())
      .filter(Boolean);
  } else {
    changelog = (process.env.SRMS_CHANGELOG || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!changelog.length) {
    console.error("[SRMS] changelog is empty — pass a txt file or set SRMS_CHANGELOG (items separated by |)");
    process.exit(1);
  }

  const pkg = {
    format: "srms-update",
    formatVersion: 1,
    version,
    minVersion: "1.0.0",
    title: `بروزرسانی ${version} سامانه مدیریت منابع سرباز`,
    createdAt: new Date().toISOString(),
    changelog,
    database: { sql: buildSql(), rollbackSql: buildRollbackSql() },
    files: [],
  };

  fs.mkdirSync(UPDATES_DIR, { recursive: true });
  const out = path.join(UPDATES_DIR, `srms-update-v${version}.srms-update`);
  fs.writeFileSync(out, JSON.stringify(pkg, null, 2), "utf8");
  console.log(`[SRMS] update package created → ${out}`);
  console.log(`[SRMS] latest before: ${base} | new version: ${version}`);
}

main();
