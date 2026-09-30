"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toFaDigits, isoTimestampToJalali } from "@/lib/jalali";

interface BackupRun {
  id: number;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  kind: string;
  status: string;
  tableCounts: Record<string, number> | null;
  durationMs: number;
  appVersion: string | null;
  createdAt: string;
  exists: boolean;
}

interface Settings {
  id: number;
  directory: string;
  autoEnabled: boolean;
  frequency: string;
  timeOfDay: string;
  dayOfWeek: number;
  retentionCount: number;
  includeAudit: boolean;
  lastAutoBackupAt: string | null;
  absolutePath?: string;
  writable?: boolean;
}

const KIND_LABEL: Record<string, string> = {
  manual: "دستی",
  auto: "خودکار",
  pre_update: "پیش از بروزرسانی",
  pre_restore: "پیش از بازیابی",
};

const WEEK_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

function fmtSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${toFaDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toFaDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toFaDigits((bytes / 1024 / 1024).toFixed(2))} مگابایت`;
}

export default function BackupPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupRun | null>(null);
  const [dry, setDry] = useState<{ createdAt?: string; appVersion?: string; tableCounts: Record<string, number> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetch("/api/backups/settings"), fetch("/api/backups")]);
      const sd = await s.json();
      const rd = await r.json();
      if (sd?.data) setSettings(sd.data);
      if (rd?.data) setRuns(rd.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(patch: Partial<Settings>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/backups/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در ذخیره تنظیمات");
      setSettings(d.data);
      setMsg({ type: "ok", text: "تنظیمات پشتیبان‌گیری ذخیره شد ✅" });
      load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function createBackup() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "manual" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطا در تهیه نسخه پشتیبان");
      setMsg({
        type: "ok",
        text: `نسخه پشتیبان «${d.data.fileName}» (${fmtSize(d.data.sizeBytes)}) ساخته شد ✅`,
      });
      load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function inspectRestore(row: BackupRun) {
    setConfirmRestore(row);
    setDry(null);
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, confirm: false }),
      });
      const d = await res.json();
      if (d?.data) setDry(d.data);
    } catch {
      /* ignore */
    }
  }

  async function doRestore(row: BackupRun) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, confirm: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "بازیابی ناموفق بود");
      const total = Object.values(d.data.restoredTables || {}).reduce((a: number, b) => a + Number(b), 0);
      setMsg({
        type: "ok",
        text: `بازیابی کامل شد ✅ — ${toFaDigits(Object.keys(d.data.restoredTables || {}).length)} جدول و ${toFaDigits(
          total,
        )} رکورد بازیابی شد. نسخه پیش از بازیابی: ${d.data.preRestoreBackup || "—"}`,
      });
      setConfirmRestore(null);
      load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const raw = await f.text();
      const parsed = JSON.parse(raw);
      if (parsed?.format !== "srms-backup") throw new Error("این فایل یک نسخه پشتیبان SRMS نیست");
      const fd = new FormData();
      fd.append("file", f);
      fd.append("confirm", "true");
      const res = await fetch("/api/backups/restore", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "بازیابی ناموفق بود");
      const total = Object.values(d.data.restoredTables || {}).reduce((a: number, b) => a + Number(b), 0);
      setMsg({
        type: "ok",
        text: `بازیابی از فایل انجام شد ✅ — ${toFaDigits(total)} رکورد. نسخه پیش از بازیابی: ${
          d.data.preRestoreBackup || "—"
        }`,
      });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeBackup(row: BackupRun) {
    if (!confirm(`فایل «${row.fileName}» حذف شود؟`)) return;
    const res = await fetch(`/api/backups/${row.id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  const totalRows = (tc: Record<string, number> | null) =>
    Object.values(tc || {}).reduce((a: number, b) => a + Number(b), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">💾 پشتیبان‌گیری و بازیابی</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-6">
            تمام اطلاعات سامانه (سربازان، نامه‌ها، تنظیمات، کاربران و…) در یک فایل واحد ذخیره و در هر زمان قابل
            بازیابی کامل است.
          </p>
        </div>
        <button
          onClick={createBackup}
          disabled={busy}
          className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold shadow-lg shadow-emerald-600/30"
        >
          {busy ? "در حال پردازش…" : "💾 تهیه نسخه پشتیبان الآن"}
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-7 ${
            msg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* تنظیمات */}
      {settings && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-4">
          <div className="font-bold text-sm">⚙️ تنظیمات پشتیبان‌گیری خودکار</div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs mb-1 text-slate-500">محل ذخیره فایل‌های پشتیبان (پوشه)</label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={settings.directory}
                  onChange={(e) => setSettings({ ...settings, directory: e.target.value })}
                  placeholder="backups  یا  D:\SRMS-Backups"
                  dir="ltr"
                  className="flex-1 min-w-[240px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={() => saveSettings({ directory: settings.directory })}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm"
                >
                  ذخیره مسیر
                </button>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-6">
                مسیر مطلق ویندوز (مثل <span className="font-mono">D:\SRMS-Backups</span>) یا مسیر نسبی به پوشه برنامه
                (مثل <span className="font-mono">backups</span>) — {settings.absolutePath || "—"}
                {settings.writable === false && (
                  <span className="text-rose-600 dark:text-rose-400"> ⚠️ این مسیر قابل نوشتن نیست</span>
                )}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.autoEnabled}
                  onChange={(e) => saveSettings({ autoEnabled: e.target.checked })}
                  className="accent-emerald-600"
                />
                پشتیبان‌گیری خودکار فعال باشد
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-3">
                <input
                  type="checkbox"
                  checked={settings.includeAudit}
                  onChange={(e) => saveSettings({ includeAudit: e.target.checked })}
                  className="accent-emerald-600"
                />
                شامل گزارش رخدادها (audit log) باشد
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1 text-slate-500">تناوب</label>
                <select
                  value={settings.frequency}
                  onChange={(e) => saveSettings({ frequency: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="hourly">هر روز (چند بار در روز)</option>
                  <option value="daily">روزانه</option>
                  <option value="weekly">هفتگی</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-slate-500">ساعت اجرا</label>
                <input
                  type="time"
                  value={settings.timeOfDay}
                  onChange={(e) => saveSettings({ timeOfDay: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              {settings.frequency === "weekly" && (
                <div className="col-span-2">
                  <label className="block text-xs mb-1 text-slate-500">روز هفته</label>
                  <select
                    value={settings.dayOfWeek}
                    onChange={(e) => saveSettings({ dayOfWeek: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    {WEEK_DAYS.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1 text-slate-500">نگهداری تعداد نسخه (۰ = بی‌نهایت)</label>
                <input
                  type="number"
                  min={0}
                  value={settings.retentionCount}
                  onChange={(e) => saveSettings({ retentionCount: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-6 border-t border-slate-100 dark:border-slate-700 pt-3">
            آخرین پشتیبان خودکار: {settings.lastAutoBackupAt ? isoTimestampToJalali(settings.lastAutoBackupAt) : "—"} ·
            زمان‌بند سامانه هر ۱۰ دقیقه بررسی می‌کند و به‌صورت خودکار نسخه می‌گیرد.
          </div>
        </div>
      )}

      {/* بازیابی از فایل */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
        <div className="font-bold text-sm text-amber-900 dark:text-amber-200">♻️ بازیابی سامانه از فایل پشتیبان</div>
        <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-6">
          در صورت خرابی سامانه، این صفحه را باز کنید و فایل نسخه پشتیبان (با پسوند{" "}
          <span className="font-mono">.srms-backup</span>) را انتخاب کنید. پیش از بازیابی، خودِ سامانه یک نسخه
          پشتیبان اطمینان می‌گیرد تا هیچ اطلاعاتی از دست نرود.
        </p>
        <label className="inline-block px-4 py-2 rounded-xl bg-amber-600 text-white text-sm cursor-pointer">
          📤 انتخاب فایل پشتیبان و بازیابی
          <input
            ref={fileRef}
            type="file"
            accept=".srms-backup,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && restoreFromFile(e.target.files[0])}
          />
        </label>
      </div>

      {/* فهرست نسخه‌ها */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 flex justify-between">
          <span>{toFaDigits(runs.length)} نسخه پشتیبان ثبت‌شده</span>
          <button onClick={load} className="text-emerald-700 dark:text-emerald-400">به‌روزرسانی</button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900">
              <tr className="text-xs text-slate-600 dark:text-slate-300">
                <th className="p-2 text-right">فایل</th>
                <th className="p-2 text-right">تاریخ</th>
                <th className="p-2 text-right">نوع</th>
                <th className="p-2 text-right">حجم</th>
                <th className="p-2 text-right">رکوردها</th>
                <th className="p-2 text-right">مدت</th>
                <th className="p-2 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="p-2 font-mono text-[11px]" dir="ltr">{r.fileName}</td>
                  <td className="p-2 text-xs">{isoTimestampToJalali(r.createdAt)}</td>
                  <td className="p-2 text-xs">{KIND_LABEL[r.kind] || r.kind}</td>
                  <td className="p-2 text-xs">{fmtSize(r.sizeBytes)}</td>
                  <td className="p-2 text-xs">{toFaDigits(totalRows(r.tableCounts))}</td>
                  <td className="p-2 text-xs">{toFaDigits((r.durationMs / 1000).toFixed(1))} ثانیه</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {r.exists ? (
                        <>
                          <a
                            href={`/api/backups/${r.id}`}
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-[11px]"
                          >
                            دانلود
                          </a>
                          <button
                            onClick={() => inspectRestore(r)}
                            className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px]"
                          >
                            بازیابی
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-rose-600 dark:text-rose-400">فایل یافت نشد</span>
                      )}
                      <button
                        onClick={() => removeBackup(r)}
                        className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200 text-[11px]"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                    هنوز نسخه پشتیبانی تهیه نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* تأیید بازیابی */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-3">
            <div className="font-bold text-slate-800 dark:text-slate-100">♻️ بازیابی از «{confirmRestore.fileName}»</div>
            {dry && (
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-7 space-y-1">
                <div>نسخه سامانه در زمان پشتیبان‌گیری: {dry.appVersion || "—"}</div>
                <div>تاریخ ساخت فایل: {dry.createdAt ? isoTimestampToJalali(dry.createdAt) : "—"}</div>
                <div>تعداد رکوردها: {toFaDigits(totalRows(dry.tableCounts))}</div>
              </div>
            )}
            <div className="text-xs bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 rounded-xl p-3 leading-6">
              ⚠️ همه داده‌های فعلی با محتوای این فایل جایگزین می‌شود. یک نسخه پشتیبان از وضعیت فعلی به‌صورت خودکار
              گرفته می‌شود.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRestore(null)} className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 dark:text-slate-100 text-sm">
                انصراف
              </button>
              <button
                onClick={() => doRestore(confirmRestore)}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? "در حال بازیابی…" : "بله، بازیابی کن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
