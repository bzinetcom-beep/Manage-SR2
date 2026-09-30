#!/usr/bin/env node
/* -----------------------------------------------------------------------------
 * SRMS — بازیابی کامل سامانه از فایل پشتیبان (خط فرمان)
 * -----------------------------------------------------------------------------
 *   node scripts/restore.mjs  <مسیر-فایل-پشتیبان>  [--yes]
 *
 * پیش از بازیابی، خودش یک نسخه پشتیبان اطمینان در کنار فایل می‌سازد.
 * --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

try {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env") });
} catch {
  /* optional */
}

const TABLES = [
  "users", "service_units", "custom_fields", "widget_settings", "notification_rules",
  "soldiers", "service_adjustments", "transfers", "letters", "letter_templates",
  "letter_batches", "notifications", "import_sessions", "audit_logs", "system_updates",
  "system_meta", "backup_settings", "backup_runs",
];

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const file = args.find((a) => !a.startsWith("--"));
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

if (!file) {
  console.error("Usage: node scripts/restore.mjs <backup-file.srms-backup> [--yes]");
  process.exit(1);
}

const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`[SRMS] file not found: ${abs}`);
  process.exit(1);
}

const raw = fs.readFileSync(abs, "utf8");
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  console.error("[SRMS] invalid backup file (not JSON)");
  process.exit(1);
}
if (payload.format !== "srms-backup") {
  console.error("[SRMS] not an SRMS backup file (format mismatch)");
  process.exit(1);
}

if (!yes) {
  const total = Object.values(payload.tableCounts || {}).reduce((a, b) => a + Number(b), 0);
  console.log(`[SRMS] this will REPLACE all current data with ${total} rows from ${path.basename(abs)}`);
  console.log("[SRMS] re-run with --yes to confirm.");
  process.exit(0);
}

const client = new pg.Client({ connectionString });
await client.connect();

async function snapshot() {
  const outDir = path.dirname(abs);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapPath = path.join(outDir, `pre-restore-${stamp}.srms-backup`);
  const tables = {};
  for (const table of TABLES) {
    try {
      tables[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
    } catch {
      /* table may not exist */
    }
  }
  fs.writeFileSync(snapPath, JSON.stringify({ format: "srms-backup", appVersion: payload.appVersion, tables }), "utf8");
  console.log(`[SRMS] safety snapshot → ${snapPath}`);
}

try {
  await snapshot();

  const existing = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`);
  const present = new Set(existing.rows.map((r) => r.table_name));
  const targets = TABLES.filter((t) => present.has(t) && payload.tables?.[t]);

  await client.query("BEGIN");
  await client.query(`TRUNCATE TABLE ${targets.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

  const restored = {};
  for (const table of targets) {
    const rows = payload.tables[table] || [];
    restored[table] = rows.length;
    if (!rows.length) continue;
    const cols = (
      await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows.map((r) => r.column_name);
    const CHUNK = 40;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const params = [];
      const tuples = slice.map((row) => {
        const used = cols.filter((c) => row[c] !== undefined);
        const ph = used.map((c) => {
          params.push(row[c]);
          return `$${params.length}`;
        });
        return `(${ph.join(", ")})`;
      });
      const usedCols = cols.filter((c) => slice.some((r) => r[c] !== undefined));
      await client.query(
        `INSERT INTO "${table}" (${usedCols.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
        params,
      );
    }
  }

  for (const table of TABLES) {
    if (!present.has(table)) continue;
    // SAVEPOINT: خطای جداولی که ستون id ندارند (مثل system_meta) نباید تراکنش را خراب کند
    await client.query("SAVEPOINT seq_fix");
    try {
      await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`);
      await client.query("RELEASE SAVEPOINT seq_fix");
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT seq_fix");
    }
  }

  await client.query("COMMIT");
  const total = Object.values(restored).reduce((a, b) => a + Number(b), 0);
  console.log(`[SRMS] restore OK → ${Object.keys(restored).length} tables, ${total} rows`);
  process.exit(0);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("[SRMS] restore FAILED:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
