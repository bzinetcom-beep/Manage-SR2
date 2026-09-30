import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { db, pool } from "@/db";
import {
  systemUpdates,
  systemMeta,
  widgetSettings,
  customFields,
  notificationRules,
  type SystemUpdate,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";

export const BASE_VERSION = "1.0.0";
export const UPDATE_FORMAT = "srms-update";
export const UPDATE_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UpdatePackage {
  format: string;
  formatVersion: number;
  version: string;
  minVersion?: string;
  title: string;
  createdAt?: string;
  changelog: string[];
  database?: { sql?: string; rollbackSql?: string };
  settings?: {
    widgetSettings?: Record<string, string>;
    customFields?: Record<string, unknown>[];
    notificationRules?: Record<string, unknown>[];
  };
  files?: { path: string; contentBase64: string }[];
}

export class UpdateError extends Error {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/** نسخه‌ی کد نصب‌شده (فایل srms-version.json در ریشه‌ی پروژه؛ با بروزرسانی کامل ZIP عوض می‌شود). */
export function getCodeVersion(): string | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), "srms-version.json"), "utf8"));
    return typeof v.version === "string" && /^\d+\.\d+\.\d+$/.test(v.version) ? v.version : null;
  } catch {
    return null;
  }
}

/** نسخه‌ی فعال = بزرگ‌تر میان نسخه‌ی ثبت‌شده در دیتابیس (بروزرسانی‌های .srms-update) و نسخه‌ی کد نصب‌شده. */
export async function getSystemVersion(): Promise<string> {
  let dbVersion = BASE_VERSION;
  try {
    const rows = await db.select().from(systemMeta).where(eq(systemMeta.key, "current_version")).limit(1);
    const v = rows[0]?.value;
    if (typeof v === "string" && v) dbVersion = v;
  } catch {
    /* table may not exist yet on a very fresh boot */
  }
  const codeVersion = getCodeVersion();
  return codeVersion && compareSemver(codeVersion, dbVersion) > 0 ? codeVersion : dbVersion;
}

export async function getBaseVersion(): Promise<string> {
  try {
    const rows = await db.select().from(systemMeta).where(eq(systemMeta.key, "base_version")).limit(1);
    const v = rows[0]?.value;
    if (typeof v === "string" && v) return v;
  } catch {
    /* ignore */
  }
  return BASE_VERSION;
}

async function setSystemVersion(client: PoolClient, version: string) {
  await client.query(
    `INSERT INTO system_meta (key, value, updated_at) VALUES ('current_version', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(version)],
  );
}

/** Only files under public/ may be shipped inside an update package. */
function assertSafeFilePath(p: string): string {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  if (!normalized.startsWith("public/") || normalized.includes("..") || normalized.length < 8) {
    throw new UpdateError(`مسیر فایل غیرمجاز است (فقط زیر public/): ${p}`);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Parse & validate an update file (.srms-update / .json)
// ---------------------------------------------------------------------------
export function parseUpdatePackage(raw: string): UpdatePackage {
  let pkg: UpdatePackage;
  try {
    pkg = JSON.parse(raw) as UpdatePackage;
  } catch {
    throw new UpdateError("فایل معتبر نیست: محتوای JSON قابل خواندن نیست");
  }
  if (!pkg || typeof pkg !== "object") throw new UpdateError("فایل معتبر نیست");
  if (pkg.format !== UPDATE_FORMAT) {
    throw new UpdateError(`این فایل یک بسته‌ی بروزرسانی SRMS نیست (format=${String(pkg.format)})`);
  }
  if ((pkg.formatVersion || 1) > UPDATE_FORMAT_VERSION) {
    throw new UpdateError("نسخه‌ی قالب فایل از سامانه جدیدتر است؛ ابتدا خود سامانه را ارتقا دهید");
  }
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version || "")) {
    throw new UpdateError("شماره نسخه معتبر نیست (باید مانند 1.2.0 باشد)");
  }
  if (!Array.isArray(pkg.changelog) || pkg.changelog.length === 0 || !pkg.changelog.every((c) => typeof c === "string")) {
    throw new UpdateError("بسته‌ی بروزرسانی باید دارای لیست تغییرات (changelog) باشد");
  }
  if (pkg.files && !Array.isArray(pkg.files)) throw new UpdateError("بخش files معتبر نیست");
  return pkg;
}

export async function validateApplicable(pkg: UpdatePackage): Promise<void> {
  const current = await getSystemVersion();
  if (pkg.minVersion && compareSemver(current, pkg.minVersion) < 0) {
    throw new UpdateError(`این بروزرسانی حداقل به نسخه‌ی ${pkg.minVersion} نیاز دارد (نسخه فعلی: ${current})`);
  }
  if (compareSemver(pkg.version, current) <= 0) {
    throw new UpdateError(`نسخه‌ی ${pkg.version} از نسخه‌ی فعلی (${current}) جدیدتر نیست`);
  }
  const dup = await db
    .select({ id: systemUpdates.id })
    .from(systemUpdates)
    .where(and(eq(systemUpdates.version, pkg.version), eq(systemUpdates.status, "applied")))
    .limit(1);
  if (dup.length > 0) {
    throw new UpdateError(`نسخه‌ی ${pkg.version} قبلاً اعمال شده است`);
  }
}

// ---------------------------------------------------------------------------
// Apply an update package (transactional DB + settings patch + asset files)
// ---------------------------------------------------------------------------
export async function applyUpdatePackage(pkg: UpdatePackage, user: SessionUser | null): Promise<SystemUpdate> {
  await validateApplicable(pkg);
  const previousVersion = await getSystemVersion();
  const client = await pool.connect();

  // ----- 1) Capture previous state (for rollback) -----
  const previousState: Record<string, unknown> = { previousVersion };
  const fileBackups: { path: string; prevBase64: string | null }[] = [];

  try {
    if (pkg.settings?.widgetSettings) {
      const ws = await db.select().from(widgetSettings).limit(1);
      previousState.widgetSettings = ws[0] ?? null;
    }
    if (pkg.settings?.customFields?.length) {
      const prevs: Record<string, unknown>[] = [];
      for (const cf of pkg.settings.customFields) {
        const key = String(cf.fieldKey || "");
        if (!key) throw new UpdateError("فیلد سفارشی بدون fieldKey در بسته");
        const rows = await db.select().from(customFields).where(eq(customFields.fieldKey, key)).limit(1);
        prevs.push({ fieldKey: key, prev: rows[0] ?? null });
      }
      previousState.customFields = prevs;
    }
    if (pkg.settings?.notificationRules?.length) {
      const prevs: Record<string, unknown>[] = [];
      for (const nr of pkg.settings.notificationRules) {
        const name = String(nr.name || "");
        if (!name) throw new UpdateError("قانون اعلان بدون نام در بسته");
        const rows = await db.select().from(notificationRules).where(eq(notificationRules.name, name)).limit(1);
        prevs.push({ name, prev: rows[0] ?? null });
      }
      previousState.notificationRules = prevs;
    }
    if (pkg.files?.length) {
      for (const f of pkg.files) {
        const safe = assertSafeFilePath(f.path);
        const abs = path.join(process.cwd(), safe);
        let prevBase64: string | null = null;
        if (fs.existsSync(abs)) prevBase64 = fs.readFileSync(abs).toString("base64");
        fileBackups.push({ path: safe, prevBase64 });
      }
      previousState.files = fileBackups;
    }

    // ----- 2) Transactional apply -----
    await client.query("BEGIN");

    if (pkg.database?.sql?.trim()) {
      await client.query(pkg.database.sql); // multi-statement simple query
    }

    if (pkg.settings?.widgetSettings) {
      const patch = pkg.settings.widgetSettings;
      const ws = await db.select().from(widgetSettings).limit(1);
      if (ws[0]) {
        await db.update(widgetSettings).set({ ...patch, updatedAt: new Date() }).where(eq(widgetSettings.id, ws[0].id));
      } else {
        await db.insert(widgetSettings).values(patch as Record<string, string>);
      }
    }

    if (pkg.settings?.customFields?.length) {
      for (const cf of pkg.settings.customFields) {
        const key = String(cf.fieldKey);
        const values = {
          fieldKey: key,
          label: String(cf.label || key),
          fieldType: String(cf.fieldType || "text"),
          options: (cf.options as string[]) ?? [],
          section: String(cf.section || "سایر"),
          isRequired: Boolean(cf.isRequired),
          isSearchable: cf.isSearchable === undefined ? true : Boolean(cf.isSearchable),
          sortOrder: Number(cf.sortOrder ?? 0),
        };
        const existing = await db.select().from(customFields).where(eq(customFields.fieldKey, key)).limit(1);
        if (existing[0]) {
          await db.update(customFields).set(values).where(eq(customFields.id, existing[0].id));
        } else {
          await db.insert(customFields).values(values);
        }
      }
    }

    if (pkg.settings?.notificationRules?.length) {
      for (const nr of pkg.settings.notificationRules) {
        const name = String(nr.name);
        const values = {
          name,
          description: nr.description == null ? null : String(nr.description),
          dateField: String(nr.dateField || "service_end_date"),
          daysBefore: Number(nr.daysBefore ?? 5),
          priority: String(nr.priority || "normal"),
          recurrence: String(nr.recurrence || "yearly"),
          filters: (nr.filters as Record<string, unknown>) ?? {},
          messageTemplate: String(nr.messageTemplate || "{{firstName}} {{lastName}}"),
          isActive: nr.isActive === undefined ? true : Boolean(nr.isActive),
        };
        const existing = await db.select().from(notificationRules).where(eq(notificationRules.name, name)).limit(1);
        if (existing[0]) {
          await db.update(notificationRules).set({ ...values, updatedAt: new Date() }).where(eq(notificationRules.id, existing[0].id));
        } else {
          await db.insert(notificationRules).values({ ...values, createdBy: user?.id ?? null });
        }
      }
    }

    const inserted = await db
      .insert(systemUpdates)
      .values({
        version: pkg.version,
        title: pkg.title || `بروزرسانی ${pkg.version}`,
        changelog: pkg.changelog,
        sqlScript: pkg.database?.sql ?? null,
        rollbackSql: pkg.database?.rollbackSql ?? null,
        settingsPatch: (pkg.settings as Record<string, unknown>) ?? {},
        previousState,
        files: (pkg.files || []).map((f) => ({ path: f.path })),
        status: "applied",
        previousVersion,
        appliedBy: user?.id ?? null,
        appliedByName: user?.fullName ?? null,
      })
      .returning();

    await setSystemVersion(client, pkg.version);
    await client.query("COMMIT");

    // ----- 3) Asset files (after DB commit; restored manually on failure) -----
    try {
      if (pkg.files?.length) {
        for (const f of pkg.files) {
          const safe = assertSafeFilePath(f.path);
          const abs = path.join(process.cwd(), safe);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, Buffer.from(f.contentBase64 || "", "base64"));
        }
      }
    } catch (fileErr) {
      // restore files and mark update failed
      restoreFiles(fileBackups);
      await db
        .update(systemUpdates)
        .set({ status: "failed", errorMessage: String((fileErr as Error).message || fileErr) })
        .where(eq(systemUpdates.id, inserted[0].id));
      await setSystemVersionStandalone(previousVersion);
      throw new UpdateError("خطا در نوشتن فایل‌های بسته؛ تغییرات پایگاه‌داده بازگردانده شد");
    }

    await logAudit({
      entity: "system_update",
      entityId: inserted[0].id,
      action: "apply",
      user,
      changes: { version: pkg.version, title: pkg.title, changelog: pkg.changelog },
    });

    return inserted[0];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    restoreFiles(fileBackups);
    if (e instanceof UpdateError) throw e;
    console.error("applyUpdatePackage failed:", e);
    throw new UpdateError(`اعمال بروزرسانی ناموفق بود: ${(e as Error).message || "خطای ناشناخته"}`);
  } finally {
    client.release();
  }
}

async function setSystemVersionStandalone(version: string) {
  const c = await pool.connect();
  try {
    await setSystemVersion(c, version);
  } finally {
    c.release();
  }
}

function restoreFiles(backups: { path: string; prevBase64: string | null }[]) {
  for (const b of backups) {
    try {
      const abs = path.join(process.cwd(), b.path);
      if (b.prevBase64 === null) {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } else {
        fs.writeFileSync(abs, Buffer.from(b.prevBase64, "base64"));
      }
    } catch (err) {
      console.error("file restore failed:", b.path, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
export async function listUpdates(): Promise<SystemUpdate[]> {
  return db.select().from(systemUpdates).orderBy(desc(systemUpdates.id));
}

/**
 * Roll back a single applied update. Ordering is enforced: only the newest
 * applied update can be rolled back directly (stack semantics). Use
 * rollbackToVersion() to jump over multiple versions in one click.
 */
export async function rollbackUpdateById(id: number, user: SessionUser | null): Promise<SystemUpdate> {
  const rows = await db.select().from(systemUpdates).where(eq(systemUpdates.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new UpdateError("بروزرسانی یافت نشد");
  if (row.status !== "applied") throw new UpdateError("این بروزرسانی در حالت اعمال‌شده نیست");
  if ((row.settingsPatch as { systemPackage?: boolean } | null)?.systemPackage) {
    throw new UpdateError("بازگشت نصب کامل (ZIP) از بخش «بروزرسانی کامل با فایل ZIP» انجام می‌شود");
  }

  const newer = await db
    .select({ id: systemUpdates.id })
    .from(systemUpdates)
    .where(and(eq(systemUpdates.status, "applied")))
    .orderBy(desc(systemUpdates.id))
    .limit(1);
  if (newer[0]?.id !== id) {
    throw new UpdateError("فقط آخرین نسخه‌ی اعمال‌شده قابل بازگشت مستقیم است؛ از «بازگشت به این نسخه» استفاده کنید");
  }
  await rollbackOne(row, user);
  const after = await db.select().from(systemUpdates).where(eq(systemUpdates.id, id)).limit(1);
  return after[0];
}

/**
 * One-click navigation to any older version: rolls back every applied update
 * newer than the target, newest first. Target may be the base version.
 */
export async function rollbackToVersion(targetVersion: string, user: SessionUser | null): Promise<SystemUpdate[]> {
  const applied = await db
    .select()
    .from(systemUpdates)
    .where(eq(systemUpdates.status, "applied"))
    .orderBy(desc(systemUpdates.id));
  const toRollback = applied.filter((u) => compareSemver(u.version, targetVersion) > 0);
  if (toRollback.length === 0) throw new UpdateError("نسخه‌ی جدیدتری برای بازگشت وجود ندارد");
  const done: SystemUpdate[] = [];
  for (const u of toRollback) {
    await rollbackOne(u, user);
    done.push(u);
  }
  return done;
}

async function rollbackOne(row: SystemUpdate, user: SessionUser | null): Promise<void> {
  if ((row.settingsPatch as { systemPackage?: boolean } | null)?.systemPackage) {
    throw new UpdateError("بازگشت نصب کامل (ZIP) از بخش «بروزرسانی کامل با فایل ZIP» انجام می‌شود");
  }
  const client = await pool.connect();
  const prev = (row.previousState || {}) as Record<string, unknown>;
  try {
    await client.query("BEGIN");

    if (row.rollbackSql?.trim()) {
      await client.query(row.rollbackSql);
    }

    // Restore widget settings
    const wsPrev = prev.widgetSettings as Record<string, unknown> | null | undefined;
    if (wsPrev) {
      await db
        .update(widgetSettings)
        .set({
          quoteText: String(wsPrev.quoteText ?? ""),
          quoteAuthor: String(wsPrev.quoteAuthor ?? ""),
          quoteImage: String(wsPrev.quoteImage ?? ""),
          quoteImageFit: String(wsPrev.quoteImageFit ?? "contain"),
          updatedAt: new Date(),
        })
        .where(eq(widgetSettings.id, Number(wsPrev.id)));
    }

    // Restore / remove custom fields
    const cfPrev = (prev.customFields as { fieldKey: string; prev: Record<string, unknown> | null }[]) || [];
    for (const item of cfPrev) {
      if (item.prev === null) {
        await db.delete(customFields).where(eq(customFields.fieldKey, item.fieldKey));
      } else {
        await db
          .update(customFields)
          .set({
            label: String(item.prev.label ?? item.fieldKey),
            fieldType: String(item.prev.fieldType ?? "text"),
            options: (item.prev.options as string[]) ?? [],
            section: String(item.prev.section ?? "سایر"),
            isRequired: Boolean(item.prev.isRequired),
            isSearchable: item.prev.isSearchable === undefined ? true : Boolean(item.prev.isSearchable),
            sortOrder: Number(item.prev.sortOrder ?? 0),
          })
          .where(eq(customFields.fieldKey, item.fieldKey));
      }
    }

    // Restore / remove notification rules
    const nrPrev = (prev.notificationRules as { name: string; prev: Record<string, unknown> | null }[]) || [];
    for (const item of nrPrev) {
      if (item.prev === null) {
        await db.delete(notificationRules).where(eq(notificationRules.name, item.name));
      } else {
        await db
          .update(notificationRules)
          .set({
            description: item.prev.description == null ? null : String(item.prev.description),
            dateField: String(item.prev.dateField ?? "service_end_date"),
            daysBefore: Number(item.prev.daysBefore ?? 5),
            priority: String(item.prev.priority ?? "normal"),
            recurrence: String(item.prev.recurrence ?? "yearly"),
            filters: (item.prev.filters as Record<string, unknown>) ?? {},
            messageTemplate: String(item.prev.messageTemplate ?? "{{firstName}} {{lastName}}"),
            isActive: item.prev.isActive === undefined ? true : Boolean(item.prev.isActive),
            updatedAt: new Date(),
          })
          .where(eq(notificationRules.name, item.name));
      }
    }

    // Restore / remove shipped files
    const fileBackups = (prev.files as { path: string; prevBase64: string | null }[]) || [];
    restoreFiles(fileBackups);

    await db
      .update(systemUpdates)
      .set({ status: "rolled_back", rolledBackAt: new Date() })
      .where(eq(systemUpdates.id, row.id));

    await setSystemVersion(client, row.previousVersion || BASE_VERSION);
    await client.query("COMMIT");

    await logAudit({
      entity: "system_update",
      entityId: row.id,
      action: "rollback",
      user,
      changes: { version: row.version, restoredTo: row.previousVersion || BASE_VERSION },
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("rollback failed:", e);
    throw new UpdateError(`بازگشت از نسخه‌ی ${row.version} ناموفق بود: ${(e as Error).message || ""}`);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Sample package (downloadable from the UI and shipped in /updates)
// ---------------------------------------------------------------------------
export const SAMPLE_UPDATE_PATH = "updates/srms-update-v1.1.0.srms-update";

export function readSamplePackage(): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), SAMPLE_UPDATE_PATH), "utf8");
  } catch {
    return null;
  }
}
