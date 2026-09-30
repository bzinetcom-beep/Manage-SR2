import fs from "node:fs";
import path from "node:path";
import { db, pool } from "@/db";
import { backupRuns, backupSettings, type BackupRun, type BackupSettings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSystemVersion } from "./updates";

/* -----------------------------------------------------------------------------
 * سازوکار پشتیبان‌گیری و بازیابی سامانه SRMS
 * -----------------------------------------------------------------------------
 * خروجی هر نسخه پشتیبان یک فایل JSON با پسوند .srms-backup است که:
 *   • همه‌ی ردیف‌های همه‌ی جدول‌های سامانه را نگه می‌دارد
 *   • ساختار (اسکیمای) جدول‌ها و نسخه‌ی سامانه را ثبت می‌کند
 *   • قابل بازیابی کامل است: اگر سامانه خراب شود، با یک Restore
 *     دقیقاً به آخرین وضعیت سالم قبل از خرابی برمی‌گردید.
 * ------------------------------------------------------------------------- */

export const BACKUP_FORMAT = "srms-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXT = ".srms-backup";

export class BackupError extends Error {}

/** جدول‌های سامانه به ترتیب وابستگی */
export const BACKUP_TABLES: string[] = [
  "users",
  "service_units",
  "custom_fields",
  "widget_settings",
  "notification_rules",
  "soldiers",
  "service_adjustments",
  "transfers",
  "letters",
  "letter_templates",
  "letter_batches",
  "notifications",
  "import_sessions",
  "audit_logs",
  "system_updates",
  "system_meta",
  "backup_settings",
  "backup_runs",
];

/** جدول‌های فاقد ستون id (برای اصلاح سری از کلید دیگری استفاده می‌شود) */
const PK_COLUMN: Record<string, string> = {
  system_meta: "key",
};
const SERIAL_TABLES = BACKUP_TABLES.filter((t) => PK_COLUMN[t] === undefined);

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
let tablesReady = false;
export async function ensureBackupTables(): Promise<void> {
  if (tablesReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
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
    `);
    await client.query(`
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
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getBackupSettings(): Promise<BackupSettings> {
  await ensureBackupTables();
  const rows = await db.select().from(backupSettings).limit(1);
  if (rows[0]) return rows[0];
  const ins = await db.insert(backupSettings).values({}).returning();
  return ins[0];
}

export async function updateBackupSettings(
  patch: Partial<Omit<BackupSettings, "id" | "updatedAt">>,
): Promise<BackupSettings> {
  const current = await getBackupSettings();
  const dir = patch.directory !== undefined ? normalizeDir(patch.directory) : current.directory;
  // مسیر را از قبل آماده می‌کنیم تا خطای «پوشه وجود ندارد» در زمان پشتیبان‌گیری رخ ندهد
  try {
    fs.mkdirSync(resolveDir(dir), { recursive: true });
  } catch {
    /* در صورت نبود دسترسی، خطای دقیق هنگام تهیه‌ی نسخه گزارش می‌شود */
  }
  const rows = await db
    .update(backupSettings)
    .set({ ...patch, directory: dir, updatedAt: new Date() })
    .where(eq(backupSettings.id, current.id))
    .returning();
  return rows[0];
}

export function normalizeDir(dir: string): string {
  const d = String(dir || "").trim();
  if (!d) return "backups";
  return d.replace(/\\/g, "/");
}

export function resolveDir(dir: string): string {
  const d = normalizeDir(dir);
  return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
}

// ---------------------------------------------------------------------------
// Columns introspection
// ---------------------------------------------------------------------------
interface ColInfo {
  name: string;
  dataType: string;
}

export async function getColumns(client: import("pg").PoolClient, table: string): Promise<ColInfo[]> {
  const res = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return res.rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
}

function serializeValue(v: unknown, dataType: string): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  // ستون‌های json/jsonb باید همیشه به‌صورت متن JSON ذخیره شوند تا در زمان
  // بازیابی، مقدار معتبر برای PostgreSQL باشند (حتی وقتی مقدار یک رشته است).
  if (dataType === "json" || dataType === "jsonb") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// ---------------------------------------------------------------------------
// Create backup
// ---------------------------------------------------------------------------
export interface CreateBackupOptions {
  kind?: "manual" | "auto" | "pre_update" | "pre_restore";
  user?: { id?: number | null; fullName?: string | null } | null;
  directory?: string;
  /** در صورت true فقط فایل ساخته می‌شود و در جدول backup_runs ثبت نمی‌شود */
  silent?: boolean;
}

export interface CreateBackupResult {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  durationMs: number;
}

export async function createBackup(opts: CreateBackupOptions = {}): Promise<CreateBackupResult> {
  await ensureBackupTables();
  const started = Date.now();
  const settings = await getBackupSettings();
  const dir = resolveDir(opts.directory || settings.directory);
  fs.mkdirSync(dir, { recursive: true });

  const version = await getSystemVersion().catch(() => "1.0.0");
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const jalaliName = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(
    stamp.getHours(),
  )}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
  const fileName = `srms-backup-${opts.kind || "manual"}-${jalaliName}${BACKUP_EXT}`;
  const filePath = path.join(dir, fileName);

  const client = await pool.connect();
  const tableCounts: Record<string, number> = {};
  try {
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
    );
    const present = new Set(existing.rows.map((r) => r.table_name));

    const tables: Record<string, Record<string, unknown>[]> = {};
    const schemaInfo: Record<string, ColInfo[]> = {};

    for (const table of BACKUP_TABLES) {
      if (!present.has(table)) continue;
      const cols = await getColumns(client, table);
      schemaInfo[table] = cols;
      if (table === "audit_logs" && !settings.includeAudit) continue;
      const quoted = cols.map((c) => `"${c.name}"`).join(", ");
      const res = await client.query<Record<string, unknown>>(`SELECT ${quoted} FROM "${table}"`);
      tables[table] = res.rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const c of cols) out[c.name] = serializeValue(row[c.name], c.dataType);
        return out;
      });
      tableCounts[table] = tables[table].length;
    }

    const payload = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: version,
      createdAt: stamp.toISOString(),
      database: process.env.DATABASE_URL?.split("/").pop()?.split("?")[0] || "app_db",
      host: "self-contained",
      tableCounts,
      schema: schemaInfo,
      tables,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload), { encoding: "utf8" });
  } finally {
    client.release();
  }

  const sizeBytes = fs.statSync(filePath).size;
  const durationMs = Date.now() - started;

  if (!opts.silent) {
    await db.insert(backupRuns).values({
      fileName,
      filePath,
      sizeBytes,
      kind: opts.kind || "manual",
      status: "success",
      tableCounts,
      durationMs,
      appVersion: version,
      createdBy: opts.user?.id ?? null,
      createdByName: opts.user?.fullName ?? null,
    });
    await pruneOldBackups();
  }

  return { fileName, filePath, sizeBytes, tableCounts, durationMs };
}

/** حذف نسخه‌های قدیمی بر اساس retention */
async function pruneOldBackups(): Promise<void> {
  const settings = await getBackupSettings();
  const keep = Number(settings.retentionCount) || 0;
  if (keep <= 0) return;
  const rows = await db.select().from(backupRuns).orderBy(desc(backupRuns.id));
  const stale = rows.slice(keep);
  for (const r of stale) {
    try {
      if (fs.existsSync(r.filePath)) fs.unlinkSync(r.filePath);
    } catch {
      /* ignore */
    }
    await db.delete(backupRuns).where(eq(backupRuns.id, r.id));
  }
}

// ---------------------------------------------------------------------------
// List / delete
// ---------------------------------------------------------------------------
export async function listBackups(): Promise<(BackupRun & { exists: boolean })[]> {
  await ensureBackupTables();
  const rows = await db.select().from(backupRuns).orderBy(desc(backupRuns.id)).limit(200);
  return rows.map((r) => ({ ...r, exists: fs.existsSync(r.filePath) }));
}

export async function getBackupById(id: number): Promise<BackupRun | null> {
  await ensureBackupTables();
  const rows = await db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteBackup(id: number): Promise<void> {
  const row = await getBackupById(id);
  if (!row) throw new BackupError("نسخه پشتیبان یافت نشد");
  try {
    if (fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath);
  } catch (e) {
    console.error("backup delete failed", e);
  }
  await db.delete(backupRuns).where(eq(backupRuns.id, id));
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------
export interface RestoreResult {
  restoredTables: Record<string, number>;
  preRestoreBackup: string;
  durationMs: number;
}

export interface ParsedBackup {
  tables: Record<string, Record<string, unknown>[]>;
  tableCounts: Record<string, number>;
  appVersion?: string;
  createdAt?: string;
}

function assertPayload(raw: string): ParsedBackup {
  let parsed: {
    format?: string;
    tables?: Record<string, Record<string, unknown>[]>;
    tableCounts?: Record<string, number>;
    appVersion?: string;
    createdAt?: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError("فایل پشتیبان معتبر نیست (JSON قابل خواندن نیست)");
  }
  if (parsed?.format !== BACKUP_FORMAT) {
    throw new BackupError("این فایل یک نسخه پشتیبان SRMS نیست");
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new BackupError("ساختار فایل پشتیبان ناقص است");
  }
  return {
    tables: parsed.tables,
    tableCounts: parsed.tableCounts || {},
    appVersion: parsed.appVersion,
    createdAt: parsed.createdAt,
  };
}

export function readBackupFile(filePath: string): ParsedBackup {
  if (!fs.existsSync(filePath)) throw new BackupError("فایل پشتیبان روی دیسک یافت نشد");
  return assertPayload(fs.readFileSync(filePath, "utf8"));
}

/**
 * بازیابی کامل سامانه از فایل پشتیبان.
 * پیش از بازیابی، یک نسخه پشتیبان خودکار (pre_restore) گرفته می‌شود تا
 * در صورت نیاز بتوان به وضعیت فعلی هم برگشت.
 */
export async function restoreBackup(
  source: { id?: number; filePath?: string; rawJson?: string },
  user: { id?: number | null; fullName?: string | null } | null,
): Promise<RestoreResult> {
  await ensureBackupTables();
  const started = Date.now();

  let payload: ParsedBackup;
  if (source.rawJson) {
    payload = assertPayload(source.rawJson);
  } else if (source.id) {
    const row = await getBackupById(source.id);
    if (!row) throw new BackupError("نسخه پشتیبان یافت نشد");
    payload = readBackupFile(row.filePath);
  } else if (source.filePath) {
    payload = readBackupFile(source.filePath);
  } else {
    throw new BackupError("منبع بازیابی مشخص نشده است");
  }

  // 1) نسخه پشتیبان خودکار پیش از بازیابی
  let preRestoreBackup = "";
  try {
    const pre = await createBackup({ kind: "pre_restore", user, silent: true });
    preRestoreBackup = pre.fileName;
  } catch (e) {
    console.error("pre-restore backup failed (continuing)", e);
  }

  // 2) پاک‌سازی و درج مجدد
  const client = await pool.connect();
  const restoredTables: Record<string, number> = {};
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
    );
    const present = new Set(existing.rows.map((r) => r.table_name));
    const targets = BACKUP_TABLES.filter((t) => present.has(t) && payload.tables[t]);
    if (!targets.length) throw new BackupError("هیچ جدول مشترکی برای بازیابی پیدا نشد");

    await client.query(`TRUNCATE TABLE ${targets.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of targets) {
      const cols = await getColumns(client, table);
      const rows = payload.tables[table] || [];
      restoredTables[table] = rows.length;
      if (!rows.length) continue;
      const validCols = cols.map((c) => c.name);
      const CHUNK = 40;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const tuples = slice.map((row) => {
          const used = validCols.filter((c) => row[c] !== undefined);
          const ph = used.map((c) => {
            values.push(row[c]);
            return `$${values.length}`;
          });
          return `(${ph.join(", ")})`;
        });
        await client.query(
          `INSERT INTO "${table}" (${validCols
            .filter((c) => slice.some((r) => r[c] !== undefined))
            .map((c) => `"${c}"`)
            .join(", ")}) VALUES ${tuples.join(", ")}`,
          values as unknown[],
        );
      }
    }

    // 3) اصلاح شمارنده‌های سری
    for (const table of SERIAL_TABLES) {
      if (!present.has(table)) continue;
      await client.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
      ).catch(() => undefined);
    }

    await client.query("COMMIT");

    // داده‌های بازیابی‌شده (مثلاً از نسخه‌ی قدیمی) با قواعد جدید هم‌راستا می‌شوند:
    // تاریخ‌های رُند، پایان خدمت ۲۱ ماهه، درجه‌ی نظامی و قوانین اعلان
    try {
      const { runDataMigrations } = await import("./data-migrations");
      await runDataMigrations(client);
    } catch (e) {
      console.error("post-restore migrations failed", e);
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("restore failed", e);
    throw new BackupError(`بازیابی ناموفق بود: ${(e as Error).message}`);
  } finally {
    client.release();
  }

  await db
    .insert(backupRuns)
    .values({
      fileName: `RESTORE→${source.filePath || source.id || "upload"}`,
      filePath: source.filePath || `-`,
      sizeBytes: 0,
      kind: "pre_restore",
      status: "success",
      tableCounts: restoredTables,
      durationMs: Date.now() - started,
      restoredAt: new Date(),
      createdBy: user?.id ?? null,
      createdByName: user?.fullName ?? null,
    })
    .catch(() => undefined);

  tablesReady = false;
  return { restoredTables, preRestoreBackup, durationMs: Date.now() - started };
}

// ---------------------------------------------------------------------------
// Auto backup (زمان‌بند)
// ---------------------------------------------------------------------------
/** آیا زمان پشتیبان‌گیری خودکار فرا رسیده است؟ */
export function isBackupDue(settings: BackupSettings, now = new Date()): boolean {
  if (!settings.autoEnabled) return false;
  const last = settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).getTime() : 0;
  const [h, m] = (settings.timeOfDay || "02:00").split(":").map((n) => parseInt(n, 10) || 0);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  if (settings.frequency === "weekly") {
    // day_of_week: 0 = شنبه … 6 = جمعه (تقویم ایرانی، هفته از شنبه شروع می‌شود)
    const jsDay = (scheduled.getDay() + 1) % 7;
    if (jsDay !== (Number(settings.dayOfWeek) || 0)) return false;
  }
  if (scheduled.getTime() > now.getTime()) return false;
  return last < scheduled.getTime();
}

export async function runAutoBackupIfDue(force = false): Promise<{ created: boolean; fileName?: string }> {
  try {
    const settings = await getBackupSettings();
    if (!force && !isBackupDue(settings)) return { created: false };
    const res = await createBackup({ kind: "auto", user: null });
    await updateBackupSettings({ lastAutoBackupAt: new Date() });
    return { created: true, fileName: res.fileName };
  } catch (e) {
    console.error("auto backup failed", e);
    return { created: false };
  }
}
