import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { db, pool } from "@/db";
import { systemUpdates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSubDir } from "./data-dir";
import { compareSemver, getSystemVersion } from "./updates";

/**
 * بروزرسانی کامل سامانه با آپلود فایل ZIP نسخه‌ی جدید
 * ------------------------------------------------------
 *  ۱) آپلود و بررسی ZIP (اعتبارسنجی، تشخیص نسخه، فهرست فایل‌های جدید/تغییرکرده)
 *  ۲) نصب: یک فرایند مستقل (scripts/apply-system-update.mjs) این مراحل را انجام می‌دهد:
 *       نسخه‌ی پشتیبان از فایل‌های قبلی → جایگزینی فایل‌ها → نصب وابستگی‌های جدید →
 *       هم‌گام‌سازی دیتابیس → ساخت نسخه‌ی پروداکشن → راه‌اندازی مجدد سرور
 *  ۳) در صورت خطا، خودکار به نسخه‌ی قبل برمی‌گردد؛ و از صفحه هم می‌توان بازگشت داد.
 *
 *  فایل‌های محافظت‌شده که هرگز بازنویسی نمی‌شوند: .env، .srms-secret، data/، backups/،
 *  node_modules/، .next/، package.json (وابستگی‌های جدید با npm install اضافه می‌شوند).
 */

export class SystemPackageError extends Error {}

const PROTECTED_PREFIXES = [
  ".git/", "node_modules/", ".next/", "data/", "backups/", "updates/staging/", "updates/snapshots/",
  ".vscode/", ".idea/", "__MACOSX/", "logs/",
];
const PROTECTED_FILES = new Set([
  ".env", ".env.local", ".env.production", ".env.development", ".srms-secret",
  "package.json", "package-lock.json", "next-env.d.ts", "tsconfig.tsbuildinfo", ".DS_Store", "Thumbs.db",
]);

export function isProtectedPath(rel: string): boolean {
  if (PROTECTED_FILES.has(rel)) return true;
  if (PROTECTED_PREFIXES.some((p) => rel.startsWith(p))) return true;
  if (!rel.includes("/") && (rel.endsWith(".zip") || rel.endsWith(".log"))) return true;
  const base = path.posix.basename(rel);
  return base === ".DS_Store" || base === "Thumbs.db";
}

function updatesDir(...parts: string[]) {
  return getSubDir("updates", ...parts);
}

export const STATUS_FILE = () => path.join(updatesDir(), "system-update-status.json");

export interface SystemPackageInfo {
  token: string;
  fileName: string;
  sizeBytes: number;
  version: string | null;
  title: string;
  changelog: string[];
  currentVersion: string;
  versionRelation: "newer" | "same" | "older" | "unknown";
  counts: { total: number; added: number; modified: number; unchanged: number; skipped: number };
  sampleAdded: string[];
  sampleModified: string[];
  newDependencies: { name: string; range: string }[];
  schemaChanged: boolean;
  warnings: string[];
}

interface StagedMeta {
  token: string;
  fileName: string;
  zipPath: string;
  prefix: string;
  version: string | null;
  title: string;
  changelog: string[];
  files: { rel: string; action: "add" | "modify" }[];
  newDependencies: { name: string; range: string }[];
  info: SystemPackageInfo;
}

const sha1 = (b: Buffer) => crypto.createHash("sha1").update(b).digest("hex");

function safeRel(rel: string): string | null {
  const n = path.posix.normalize(rel.replace(/\\/g, "/"));
  if (n.startsWith("/") || n.startsWith("../") || n.includes("/../") || n === ".." || /^[a-zA-Z]:/.test(n)) return null;
  return n;
}

function readCurrentPackageJson(): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  } catch {
    return {};
  }
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** ZIP را بررسی و در پوشه‌ی staging نگهداری می‌کند. */
export async function stageSystemZip(fileName: string, buf: Buffer): Promise<SystemPackageInfo> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new SystemPackageError("فایل ZIP معتبر نیست یا آسیب دیده است");
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (!entries.length) throw new SystemPackageError("فایل ZIP خالی است");

  // پوشه‌ی ریشه: package.json در عمق صفر یا یک
  const pkgEntry = entries
    .filter((e) => /^(?:[^/]+\/)?package\.json$/.test(e.name))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (!pkgEntry) throw new SystemPackageError("فایل package.json در ZIP پیدا نشد؛ این فایل، نسخه‌ی کامل سامانه نیست");
  const prefix = pkgEntry.name.slice(0, pkgEntry.name.length - "package.json".length);
  if (!entries.some((e) => e.name.startsWith(`${prefix}src/app/`))) {
    throw new SystemPackageError("پوشه‌ی src/app در ZIP پیدا نشد؛ این فایل، نسخه‌ی کامل سامانه نیست");
  }

  // ---- نسخه، عنوان و تغییرات
  let version: string | null = null;
  let title = "";
  let changelog: string[] = [];
  const warnings: string[] = [];

  const verEntry = zip.file(`${prefix}srms-version.json`);
  if (verEntry) {
    try {
      const v = JSON.parse(await verEntry.async("string"));
      if (typeof v.version === "string" && SEMVER_RE.test(v.version)) version = v.version;
      if (typeof v.title === "string") title = v.title;
      if (Array.isArray(v.changelog)) changelog = v.changelog.map(String);
    } catch {
      warnings.push("فایل srms-version.json خوانده نشد");
    }
  }
  const pkgJson = JSON.parse(await pkgEntry.async("string")) as {
    version?: string;
    dependencies?: Record<string, string>;
  };
  if (!version && typeof pkgJson.version === "string" && SEMVER_RE.test(pkgJson.version) && pkgJson.version !== "0.0.0") {
    version = pkgJson.version;
  }
  if (!version) {
    const readme = zip.file(`${prefix}README.md`);
    if (readme) {
      const txt = await readme.async("string");
      const m = /نسخه فعلی سامانه[\s\S]{0,40}?\*\*(\d+\.\d+\.\d+)\*\*/.exec(txt);
      if (m) version = m[1];
    }
  }

  const currentVersion = await getSystemVersion();
  let versionRelation: SystemPackageInfo["versionRelation"] = "unknown";
  if (version) {
    const c = compareSemver(version, currentVersion);
    versionRelation = c > 0 ? "newer" : c === 0 ? "same" : "older";
  } else {
    warnings.push("شماره‌ی نسخه در بسته پیدا نشد؛ پس از نصب، نسخه‌ی فعلی بدون تغییر می‌ماند.");
  }

  // ---- مقایسه‌ی فایل‌ها با پروژه‌ی فعلی
  const root = process.cwd();
  const files: StagedMeta["files"] = [];
  let unchanged = 0;
  let skipped = 0;
  let schemaChanged = false;

  for (const e of entries) {
    if (!e.name.startsWith(prefix)) { skipped++; continue; }
    const rel = safeRel(e.name.slice(prefix.length));
    if (!rel) { warnings.push(`مسیر نامعتبر نادیده گرفته شد: ${e.name}`); skipped++; continue; }
    if (isProtectedPath(rel)) { skipped++; continue; }
    const data = Buffer.from(await e.async("uint8array"));
    const dest = path.join(root, rel);
    if (fs.existsSync(dest) && fs.statSync(dest).isFile()) {
      if (sha1(fs.readFileSync(dest)) === sha1(data)) { unchanged++; continue; }
      files.push({ rel, action: "modify" });
      if (rel === "src/db/schema.ts") schemaChanged = true;
    } else {
      files.push({ rel, action: "add" });
      if (rel === "src/db/schema.ts") schemaChanged = true;
    }
  }

  if (!files.length) warnings.push("هیچ فایل جدید یا تغییریافته‌ای نسبت به نسخه‌ی فعلی وجود ندارد.");

  // ---- وابستگی‌های جدید (وابستگی‌هایی که در پروژه‌ی فعلی نیستند)
  const cur = readCurrentPackageJson();
  const have = { ...(cur.dependencies || {}), ...(cur.devDependencies || {}) };
  const newDependencies = Object.entries(pkgJson.dependencies || {})
    .filter(([name]) => !(name in have))
    .map(([name, range]) => ({ name, range }));

  const token = crypto.randomBytes(12).toString("hex");
  const zipPath = path.join(updatesDir("staging"), `${token}.zip`);
  fs.writeFileSync(zipPath, buf);

  const info: SystemPackageInfo = {
    token,
    fileName,
    sizeBytes: buf.length,
    version,
    title,
    changelog,
    currentVersion,
    versionRelation,
    counts: {
      total: entries.length,
      added: files.filter((f) => f.action === "add").length,
      modified: files.filter((f) => f.action === "modify").length,
      unchanged,
      skipped,
    },
    sampleAdded: files.filter((f) => f.action === "add").slice(0, 40).map((f) => f.rel),
    sampleModified: files.filter((f) => f.action === "modify").slice(0, 40).map((f) => f.rel),
    newDependencies,
    schemaChanged,
    warnings,
  };

  const meta: StagedMeta = { token, fileName, zipPath, prefix, version, title, changelog, files, newDependencies, info };
  fs.writeFileSync(path.join(updatesDir("staging"), `${token}.json`), JSON.stringify(meta), "utf8");

  // پاکسازی فایل‌های staging قدیمی‌تر از ۲ روز
  try {
    const dir = updatesDir("staging");
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (Date.now() - fs.statSync(fp).mtimeMs > 2 * 24 * 3600 * 1000) fs.rmSync(fp, { force: true });
    }
  } catch { /* ignore */ }

  return info;
}

export interface SystemUpdateStatus {
  id: string;
  mode: "install" | "rollback";
  state: "running" | "done" | "failed" | "rolled_back";
  step: string;
  progress: number;
  version: string | null;
  previousVersion: string | null;
  title: string;
  changelog: string[];
  filesCount: number;
  snapshotId: string | null;
  log: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  restart: boolean;
  recorded: boolean;
  appliedByName: string | null;
  appliedBy: number | null;
}

export function readStatus(): SystemUpdateStatus | null {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE(), "utf8")) as SystemUpdateStatus;
  } catch {
    return null;
  }
}

export interface SnapshotInfo {
  id: string;
  version: string | null;
  previousVersion: string | null;
  createdAt: string;
  filesCount: number;
  rolledBack: boolean;
}

export function listSnapshots(): SnapshotInfo[] {
  const dir = updatesDir("snapshots");
  const out: SnapshotInfo[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as SnapshotInfo);
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function launchInstaller(planPath: string) {
  const script = path.join(process.cwd(), "scripts", "apply-system-update.mjs");
  if (!fs.existsSync(script)) throw new SystemPackageError("اسکریپت نصب (scripts/apply-system-update.mjs) پیدا نشد");
  const child = spawn(process.execPath, [script, planPath], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env },
  });
  child.unref();
}

function assertNotBusy() {
  const st = readStatus();
  if (st && st.state === "running" && Date.now() - new Date(st.startedAt).getTime() < 60 * 60 * 1000) {
    throw new SystemPackageError("یک بروزرسانی در حال اجراست؛ تا پایان آن صبر کنید");
  }
}

export interface InstallOptions {
  token: string;
  restart: boolean;
  force: boolean;
  user: { id: number; fullName?: string | null } | null;
}

export async function startSystemInstall(opts: InstallOptions): Promise<void> {
  assertNotBusy();
  if (!/^[a-f0-9]{24}$/.test(opts.token)) throw new SystemPackageError("شناسه‌ی بسته نامعتبر است");
  const metaPath = path.join(updatesDir("staging"), `${opts.token}.json`);
  if (!fs.existsSync(metaPath)) throw new SystemPackageError("بسته‌ی آپلودشده پیدا نشد؛ دوباره فایل را آپلود کنید");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as StagedMeta;

  if (meta.info.versionRelation !== "newer" && !opts.force) {
    throw new SystemPackageError("نسخه‌ی این بسته جدیدتر از نسخه‌ی فعلی نیست؛ برای نصب، گزینه‌ی تأیید را فعال کنید");
  }
  if (!meta.files.length && !meta.newDependencies.length) {
    throw new SystemPackageError("این بسته تغییری نسبت به نسخه‌ی فعلی ندارد");
  }

  const id = `${Date.now()}`;
  const planPath = path.join(updatesDir("staging"), `plan-${id}.json`);
  const previousVersion = await getSystemVersion();
  const plan = {
    id,
    mode: "install",
    cwd: process.cwd(),
    zipPath: meta.zipPath,
    prefix: meta.prefix,
    files: meta.files,
    newDependencies: meta.newDependencies,
    schemaChanged: meta.info.schemaChanged,
    version: meta.version,
    previousVersion,
    title: meta.title || (meta.version ? `بروزرسانی کامل به نسخه‌ی ${meta.version}` : "بروزرسانی کامل سامانه"),
    changelog: meta.changelog,
    restart: opts.restart,
    serverPid: process.pid,
    port: Number(process.env.PORT || 3000),
    statusFile: STATUS_FILE(),
    snapshotsDir: updatesDir("snapshots"),
    appliedBy: opts.user?.id ?? null,
    appliedByName: opts.user?.fullName ?? null,
  };
  fs.writeFileSync(planPath, JSON.stringify(plan), "utf8");
  // وضعیت اولیه (تا قبل از اولین به‌روزرسانی اسکریپت، UI پیام مناسب نشان دهد)
  const initial: SystemUpdateStatus = {
    id, mode: "install", state: "running", step: "queued", progress: 1,
    version: meta.version, previousVersion, title: plan.title, changelog: meta.changelog,
    filesCount: meta.files.length, snapshotId: null, log: ["درخواست نصب ثبت شد…"], error: null,
    startedAt: new Date().toISOString(), finishedAt: null, restart: opts.restart, recorded: false,
    appliedByName: plan.appliedByName, appliedBy: plan.appliedBy,
  };
  fs.writeFileSync(STATUS_FILE(), JSON.stringify(initial, null, 2), "utf8");
  launchInstaller(planPath);
}

export async function startSystemRollback(snapshotId: string, restart: boolean, user: { id: number; fullName?: string | null } | null) {
  assertNotBusy();
  if (!/^\d+$/.test(snapshotId)) throw new SystemPackageError("شناسه‌ی نسخه‌ی پشتیبان نامعتبر است");
  const dir = updatesDir("snapshots");
  const zipPath = path.join(dir, `system-${snapshotId}.zip`);
  const metaPath = path.join(dir, `system-${snapshotId}.json`);
  if (!fs.existsSync(zipPath) || !fs.existsSync(metaPath)) throw new SystemPackageError("نسخه‌ی پشتیبان پیدا نشد");
  const snap = JSON.parse(fs.readFileSync(metaPath, "utf8")) as SnapshotInfo;
  if (snap.rolledBack) throw new SystemPackageError("این نسخه قبلاً بازگردانده شده است");

  const id = `${Date.now()}`;
  const planPath = path.join(updatesDir("staging"), `plan-${id}.json`);
  const plan = {
    id, mode: "rollback", cwd: process.cwd(), snapshotId, snapshotZip: zipPath, snapshotMeta: metaPath,
    version: snap.previousVersion, previousVersion: snap.version,
    title: `بازگشت به نسخه‌ی ${snap.previousVersion ?? "قبلی"}`, changelog: [], restart,
    serverPid: process.pid, port: Number(process.env.PORT || 3000), statusFile: STATUS_FILE(),
    snapshotsDir: dir, appliedBy: user?.id ?? null, appliedByName: user?.fullName ?? null, files: [],
  };
  fs.writeFileSync(planPath, JSON.stringify(plan), "utf8");
  const initial: SystemUpdateStatus = {
    id, mode: "rollback", state: "running", step: "queued", progress: 1,
    version: snap.previousVersion, previousVersion: snap.version, title: plan.title, changelog: [],
    filesCount: snap.filesCount, snapshotId, log: ["درخواست بازگشت ثبت شد…"], error: null,
    startedAt: new Date().toISOString(), finishedAt: null, restart, recorded: false,
    appliedByName: plan.appliedByName, appliedBy: plan.appliedBy,
  };
  fs.writeFileSync(STATUS_FILE(), JSON.stringify(initial, null, 2), "utf8");
  launchInstaller(planPath);
}

/**
 * پس از پایان موفق نصب/بازگشت (و بالا آمدن دوباره‌ی سرور)، نتیجه در تاریخچه‌ی نسخه‌ها و
 * شماره‌ی نسخه‌ی فعال ثبت می‌شود. چند بار صدا زدن آن بی‌خطر است.
 */
export async function finalizePendingSystemUpdate(): Promise<SystemUpdateStatus | null> {
  const st = readStatus();
  if (!st || st.recorded || (st.state !== "done" && st.state !== "failed" && st.state !== "rolled_back")) return st;
  try {
    if (st.mode === "install" && st.state === "done") {
      await db.insert(systemUpdates).values({
        version: st.version || st.previousVersion || "0.0.0",
        title: `📦 ${st.title}`,
        changelog: st.changelog?.length ? st.changelog : [`نصب کامل سامانه از فایل ZIP (${st.filesCount} فایل)`],
        sqlScript: null,
        rollbackSql: null,
        settingsPatch: { systemPackage: true, snapshotId: st.snapshotId },
        previousState: {},
        files: [],
        status: "applied",
        previousVersion: st.previousVersion,
        appliedBy: st.appliedBy,
        appliedByName: st.appliedByName,
      });
      if (st.version) await setCurrentVersion(st.version);
    } else if (st.mode === "rollback" && st.state === "done") {
      const rows = await db.select().from(systemUpdates);
      for (const r of rows) {
        const sp = (r.settingsPatch || {}) as { systemPackage?: boolean; snapshotId?: string };
        if (sp.systemPackage && sp.snapshotId === st.snapshotId && r.status === "applied") {
          await db.update(systemUpdates).set({ status: "rolled_back", rolledBackAt: new Date() }).where(eq(systemUpdates.id, r.id));
        }
      }
      if (st.version) await setCurrentVersion(st.version);
    }
    st.recorded = true;
    fs.writeFileSync(STATUS_FILE(), JSON.stringify(st, null, 2), "utf8");
  } catch (e) {
    console.error("[SRMS] finalize system update failed", e);
  }
  return st;
}

async function setCurrentVersion(version: string) {
  await pool.query(
    `INSERT INTO system_meta (key, value, updated_at) VALUES ('current_version', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(version)],
  );
}
