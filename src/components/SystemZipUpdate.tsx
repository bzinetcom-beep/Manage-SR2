"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PackageOpen,
  UploadCloud,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  FilePlus2,
  FilePen,
  Boxes,
} from "lucide-react";
import { toFaDigits } from "@/lib/jalali";

interface PackageInfo {
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
interface Status {
  id: string;
  mode: "install" | "rollback";
  state: "running" | "done" | "failed" | "rolled_back";
  step: string;
  progress: number;
  version: string | null;
  previousVersion: string | null;
  title: string;
  log: string[];
  error: string | null;
  finishedAt: string | null;
}
interface Snapshot {
  id: string;
  version: string | null;
  previousVersion: string | null;
  createdAt: string;
  filesCount: number;
  rolledBack: boolean;
}

const STEP_LABELS: Record<string, string> = {
  queued: "در صف اجرا",
  snapshot: "تهیه‌ی نسخه‌ی پشتیبان",
  extract: "جایگزینی فایل‌ها",
  deps: "نصب وابستگی‌های جدید",
  schema: "هم‌گام‌سازی دیتابیس",
  build: "ساخت نسخه‌ی پروداکشن",
  restart: "راه‌اندازی مجدد سرور",
  rollback: "بازگردانی به نسخه‌ی قبل",
  done: "پایان",
};

function fmtSize(n: number) {
  if (n > 1024 * 1024) return `${toFaDigits((n / 1024 / 1024).toFixed(1))} مگابایت`;
  return `${toFaDigits(Math.max(1, Math.round(n / 1024)))} کیلوبایت`;
}

export default function SystemZipUpdate({ onFinished }: { onFinished?: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [info, setInfo] = useState<PackageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restart, setRestart] = useState(true);
  const [force, setForce] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [serverDown, setServerDown] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wasRunning = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/updates/system/status", { cache: "no-store" });
      if (!r.ok) throw new Error("bad");
      const d = await r.json();
      setServerDown(false);
      setStatus(d.status || null);
      setSnapshots(d.snapshots || []);
      const running = d.status?.state === "running";
      if (wasRunning.current && !running) {
        wasRunning.current = false;
        onFinished?.();
      }
      if (running) wasRunning.current = true;
      return d.status as Status | null;
    } catch {
      // سرور در حال راه‌اندازی مجدد است
      setServerDown(true);
      return null;
    }
  }, [onFinished]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // پیگیری زنده‌ی پیشرفت هنگام اجرا
  const running = status?.state === "running";
  useEffect(() => {
    if (!running && !(installing && !status)) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [running, installing, status, fetchStatus]);

  async function upload(file: File | null) {
    if (!file) return;
    setError(null);
    setInfo(null);
    setForce(false);
    if (!/\.zip$/i.test(file.name)) {
      setError("فقط فایل ZIP نسخه‌ی کامل سامانه پذیرفته می‌شود");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/updates/system/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "خطا در آپلود فایل");
      else setInfo(d.info as PackageInfo);
    } catch {
      setError("خطای ارتباط با سرور هنگام آپلود");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function install() {
    if (!info) return;
    setError(null);
    setInstalling(true);
    try {
      const res = await fetch("/api/updates/system/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: info.token, restart, force }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "خطا در شروع نصب");
        setInstalling(false);
        return;
      }
      setInfo(null);
      wasRunning.current = true;
      await fetchStatus();
    } catch {
      setError("خطای ارتباط با سرور");
      setInstalling(false);
    }
  }

  async function rollback(s: Snapshot) {
    if (!confirm(`بازگشت به نسخه‌ی ${s.previousVersion ?? "قبلی"}؟\nفایل‌های سامانه به حالت پیش از نصب برمی‌گردند و سرور دوباره ساخته می‌شود.`)) return;
    setError(null);
    const res = await fetch("/api/updates/system/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: s.id, restart }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error || "خطا در شروع بازگشت");
    else {
      wasRunning.current = true;
      await fetchStatus();
    }
  }

  const relBadge = info
    ? info.versionRelation === "newer"
      ? { text: "نسخه‌ی جدیدتر", cls: "bg-emerald-100 text-emerald-700" }
      : info.versionRelation === "same"
        ? { text: "هم‌شماره با نسخه‌ی فعلی", cls: "bg-amber-100 text-amber-700" }
        : info.versionRelation === "older"
          ? { text: "قدیمی‌تر از نسخه‌ی فعلی", cls: "bg-rose-100 text-rose-700" }
          : { text: "نسخه نامشخص", cls: "bg-slate-100 text-slate-600" }
    : null;
  const needsForce = !!info && info.versionRelation !== "newer";
  const canInstall = !!info && (!needsForce || force) && !installing;
  const latestRollbackable = snapshots.find((s) => !s.rolledBack);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border-2 border-indigo-200 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
          <PackageOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">بروزرسانی کامل سامانه با فایل ZIP</h2>
          <p className="text-xs text-slate-500 mt-1 leading-6">
            فایل ZIP <b>نسخه‌ی کامل و جدید</b> سامانه را آپلود کنید؛ سامانه فقط فایل‌های جدید/تغییرکرده را نصب می‌کند،
            وابستگی‌ها و دیتابیس را هم‌گام می‌کند، نسخه‌ی جدید را می‌سازد و خودش دوباره اجرا می‌شود.
            اطلاعات شما (سربازان، تنظیمات، تصاویر ویجت‌ها، فایل‌های پشتیبان و <code>.env</code>) هرگز بازنویسی نمی‌شود.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* ---------- Progress ---------- */}
      {status && (running || installing || status.state !== "done" || !status.finishedAt || Date.now() - new Date(status.finishedAt).getTime() < 10 * 60 * 1000) && (
        <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="font-bold text-sm text-slate-700 flex items-center gap-2">
              {status.state === "running" && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
              {status.state === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {(status.state === "failed" || status.state === "rolled_back") && <AlertTriangle className="w-4 h-4 text-rose-600" />}
              {status.mode === "rollback" ? "بازگشت به نسخه‌ی قبل" : "نصب بروزرسانی"}
              {status.version ? ` — نسخه‌ی ${toFaDigits(status.version)}` : ""}
            </div>
            <span className="text-xs text-slate-500">
              {status.state === "running"
                ? `مرحله: ${STEP_LABELS[status.step] || status.step}`
                : status.state === "done"
                  ? "با موفقیت انجام شد"
                  : status.state === "rolled_back"
                    ? "ناموفق — به نسخه‌ی قبل برگشت"
                    : "ناموفق"}
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${status.state === "failed" || status.state === "rolled_back" ? "bg-rose-500" : "bg-indigo-600"}`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
          {serverDown && running && (
            <p className="text-xs text-amber-700 mt-2">سرور در حال راه‌اندازی مجدد است؛ چند لحظه صبر کنید…</p>
          )}
          {status.error && (
            <pre className="mt-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-auto" dir="ltr">{status.error}</pre>
          )}
          {status.log?.length > 0 && (
            <details className="mt-3" open={status.state === "running"}>
              <summary className="text-xs text-slate-500 cursor-pointer">گزارش مراحل</summary>
              <pre className="mt-2 text-[11px] bg-slate-900 text-emerald-200 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap" dir="ltr">
                {status.log.join("\n")}
              </pre>
            </details>
          )}
          {status.state === "done" && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-emerald-700 font-bold">سامانه به‌روز شد.</span>
              <button onClick={() => window.location.reload()} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5">
                بارگذاری مجدد صفحه
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- Upload ---------- */}
      {!running && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0] || null); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-indigo-200 hover:border-indigo-400 bg-white"}`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-indigo-700 text-sm font-bold">
                <Loader2 className="w-5 h-5 animate-spin" /> در حال آپلود و بررسی بسته…
              </div>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 mx-auto text-indigo-500 mb-2" />
                <div className="text-sm font-bold text-slate-700">فایل ZIP نسخه‌ی کامل سامانه را اینجا بکشید یا کلیک کنید</div>
                <div className="text-xs text-slate-400 mt-1">مثال: SRMS-v1.6.0.zip</div>
              </>
            )}
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => upload(e.target.files?.[0] || null)} />
          </div>

          {/* ---------- Preview ---------- */}
          {info && (
            <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                    <Boxes className="w-4 h-4 text-indigo-600" />
                    {info.version ? `نسخه‌ی ${toFaDigits(info.version)}` : "نسخه‌ی نامشخص"}
                    {relBadge && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${relBadge.cls}`}>{relBadge.text}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {info.fileName} • {fmtSize(info.sizeBytes)} • نسخه‌ی فعلی: {toFaDigits(info.currentVersion)}
                  </div>
                </div>
              </div>

              {info.title && <div className="text-sm text-slate-700">{info.title}</div>}
              {info.changelog.length > 0 && (
                <ul className="list-disc pr-5 text-sm text-slate-600 space-y-1">
                  {info.changelog.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-emerald-50 rounded-lg p-2"><div className="text-lg font-extrabold text-emerald-700">{toFaDigits(info.counts.added)}</div><div className="text-[11px] text-slate-500">فایل جدید</div></div>
                <div className="bg-amber-50 rounded-lg p-2"><div className="text-lg font-extrabold text-amber-700">{toFaDigits(info.counts.modified)}</div><div className="text-[11px] text-slate-500">فایل تغییریافته</div></div>
                <div className="bg-slate-50 rounded-lg p-2"><div className="text-lg font-extrabold text-slate-600">{toFaDigits(info.counts.unchanged)}</div><div className="text-[11px] text-slate-500">بدون تغییر</div></div>
                <div className="bg-slate-50 rounded-lg p-2"><div className="text-lg font-extrabold text-slate-600">{toFaDigits(info.counts.skipped)}</div><div className="text-[11px] text-slate-500">محافظت‌شده/نادیده</div></div>
              </div>

              {(info.sampleAdded.length > 0 || info.sampleModified.length > 0) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500">مشاهده‌ی فهرست فایل‌ها</summary>
                  <div className="mt-2 grid sm:grid-cols-2 gap-3" dir="ltr">
                    <div>
                      <div className="flex items-center gap-1 text-emerald-700 font-bold mb-1"><FilePlus2 className="w-3.5 h-3.5" /> new</div>
                      <ul className="space-y-0.5 text-slate-600 max-h-40 overflow-auto">{info.sampleAdded.map((f) => <li key={f}>{f}</li>)}</ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-amber-700 font-bold mb-1"><FilePen className="w-3.5 h-3.5" /> modified</div>
                      <ul className="space-y-0.5 text-slate-600 max-h-40 overflow-auto">{info.sampleModified.map((f) => <li key={f}>{f}</li>)}</ul>
                    </div>
                  </div>
                </details>
              )}

              {info.newDependencies.length > 0 && (
                <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-indigo-800">
                  وابستگی‌های جدیدی که نصب می‌شوند: {info.newDependencies.map((d) => `${d.name}@${d.range}`).join("، ")}
                </div>
              )}
              {info.schemaChanged && (
                <div className="text-xs bg-sky-50 border border-sky-200 rounded-lg p-2 text-sky-800">
                  ساختار دیتابیس در این نسخه تغییر کرده است؛ جدول‌ها به‌صورت خودکار و بدون حذف داده هم‌گام می‌شوند.
                </div>
              )}
              {info.warnings.map((w, i) => (
                <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                </div>
              ))}

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={restart} onChange={(e) => setRestart(e.target.checked)} />
                  راه‌اندازی مجدد خودکار سرور پس از نصب
                </label>
                {needsForce && (
                  <label className="flex items-center gap-2 text-sm text-rose-700 cursor-pointer">
                    <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                    می‌دانم که نسخه‌ی این بسته جدیدتر نیست و می‌خواهم نصب شود
                  </label>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={install}
                  disabled={!canInstall}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-5 py-2 flex items-center gap-2"
                >
                  {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />}
                  نصب و اجرای بروزرسانی
                </button>
                <button onClick={() => setInfo(null)} className="border border-slate-300 text-slate-600 text-sm rounded-lg px-4 py-2 hover:bg-slate-50">
                  انصراف
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-5">
                پیش از نصب، از فایل‌های فعلی نسخه‌ی پشتیبان گرفته می‌شود؛ اگر ساخت نسخه‌ی جدید با خطا روبه‌رو شود، همه‌چیز خودکار به حالت قبل برمی‌گردد.
                ساخت نسخه‌ی پروداکشن ممکن است چند دقیقه طول بکشد.
              </p>
            </div>
          )}

          {/* ---------- Snapshots ---------- */}
          {latestRollbackable && (
            <div className="mt-4 flex items-center justify-between flex-wrap gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-600">
                آخرین نصب کامل: نسخه‌ی <b>{toFaDigits(latestRollbackable.version ?? "—")}</b> (قبلی: {toFaDigits(latestRollbackable.previousVersion ?? "—")}) —{" "}
                {toFaDigits(latestRollbackable.filesCount)} فایل
              </div>
              <button
                onClick={() => rollback(latestRollbackable)}
                className="text-xs border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg px-3 py-1.5 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> بازگشت به نسخه‌ی قبل
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
