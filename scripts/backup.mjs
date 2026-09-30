#!/usr/bin/env node
/* -----------------------------------------------------------------------------
 * SRMS — تهیه نسخه پشتیبان از خط فرمان (مناسب Windows Task Scheduler)
 * -----------------------------------------------------------------------------
 *   node scripts/backup.mjs  [مسیر-پوشه]  [kind]
 *
 * اگر مسیر داده نشود از فایل .env (متغیر SRMS_BACKUP_DIR) یا پوشه‌ی backups
 * استفاده می‌شود. خروجی: فایل JSON با پسوند .srms-backup
 * --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

try {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env") });
} catch {
  /* dotenv اختیاری است */
}

const TABLES = [
  "users", "service_units", "custom_fields", "widget_settings", "notification_rules",
  "soldiers", "service_adjustments", "transfers", "letters", "letter_templates",
  "letter_batches", "notifications", "import_sessions", "audit_logs", "system_updates",
  "system_meta", "backup_settings", "backup_runs",
];

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const outDir = path.resolve(process.argv[2] || process.env.SRMS_BACKUP_DIR || path.join(process.cwd(), "backups"));
const kind = process.argv[3] || "scheduled";

function serialize(v, dataType) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  // json/jsonb columns must always be stored as JSON text so restore stays valid
  if (dataType === "json" || dataType === "jsonb") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const client = new pg.Client({ connectionString });
  await client.connect();
  const started = Date.now();
  const stamp = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const fileName = `srms-backup-${kind}-${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(
    stamp.getDate(),
  )}-${p(stamp.getHours())}${p(stamp.getMinutes())}${p(stamp.getSeconds())}.srms-backup`;
  const filePath = path.join(outDir, fileName);

  const tablesRes = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
  );
  const present = new Set(tablesRes.rows.map((r) => r.table_name));

  const tables = {};
  const schema = {};
  const tableCounts = {};

  for (const table of TABLES) {
    if (!present.has(table)) continue;
    const cols = (
      await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows;
    schema[table] = cols;
    const quoted = cols.map((c) => `"${c.column_name}"`).join(", ");
    const rows = (await client.query(`SELECT ${quoted} FROM "${table}"`)).rows;
    tables[table] = rows.map((row) => {
      const out = {};
      for (const c of cols) out[c.column_name] = serialize(row[c.column_name], c.data_type);
      return out;
    });
    tableCounts[table] = tables[table].length;
  }

  let version = "1.0.0";
  if (present.has("system_meta")) {
    const v = await client.query(`SELECT value FROM system_meta WHERE key = 'current_version' LIMIT 1`).catch(() => null);
    if (v?.rows?.[0]) version = String(typeof v.rows[0].value === "string" ? v.rows[0].value : JSON.stringify(v.rows[0].value));
  }

  const payload = {
    format: "srms-backup",
    formatVersion: 1,
    appVersion: version,
    createdAt: stamp.toISOString(),
    database: connectionString.split("/").pop()?.split("?")[0] || "app_db",
    kind,
    durationMs: Date.now() - started,
    tableCounts,
    schema,
    tables,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
  await client.end();

  const size = fs.statSync(filePath).size;
  console.log(`[SRMS] backup OK  →  ${filePath}  (${(size / 1024).toFixed(1)} KB, ${Object.keys(tables).length} tables)`);
  return 0;
}

main().catch((e) => {
  console.error("[SRMS] backup FAILED:", e.message);
  process.exit(1);
});
