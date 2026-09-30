"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  RotateCcw,
  History,
  Download,
  ShieldCheck,
  ChevronDown,
  Database,
  Settings2,
  FileBox,
  FileJson2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toFaDigits, isoTimestampToJalali } from "@/lib/jalali";
import SystemZipUpdate from "@/components/SystemZipUpdate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UpdateRow {
  id: number;
  version: string;
  title: string;
  changelog: string[];
  status: string; // applied | rolled_back | failed
  previousVersion: string | null;
  errorMessage: string | null;
  sqlScript: string | null;
  settingsPatch: Record<string, unknown> | null;
  files: { path: string }[] | null;
  appliedAt: string;
  appliedByName: string | null;
  rolledBackAt: string | null;
}
interface UpdatesData {
  currentVersion: string;
  baseVersion: string;
  updates: UpdateRow[];
}
interface ParsedPreview {
  version: string;
  title: string;
  changelog: string[];
  hasSql: boolean;
  settingsCount: number;
  filesCount: number;
}
type ResultState =
  | { ok: true; message: string; changelog: string[]; currentVersion: string }
  | { ok: false; error: string }
  | null;
type ConfirmState =
  | { kind: "one"; update: UpdateRow }
  | { kind: "to"; version: string; count: number; label: string }
  | null;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function UpdatesPage() {
  const [data, setData] = useState<UpdatesData | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/updates");
      if (res.status === 403) {
        setPageError("دسترسی غیرمجاز — بخش بروزرسانی فقط برای مدیر سیستم در دسترس است");
        return;
      }
      if (!res.ok) throw new Error("خطا در دریافت اطلاعات");
      setData(await res.json());
    } catch (e) {
      setPageError(String((e as Error).message || e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------- File handling ----------------
  async function handleFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    setParseError(null);
    setPreview(null);
    setResult(null);
    try {
      const text = await f.text();
      const pkg = JSON.parse(text);
      if (pkg?.format !== "srms-update") throw new Error("این فایل یک بسته‌ی بروزرسانی SRMS نیست");
      if (!/^\d+\.\d+\.\d+$/.test(pkg.version || "")) throw new Error("شماره نسخه معتبر نیست");
      if (!Array.isArray(pkg.changelog) || pkg.changelog.length === 0)
        throw new Error("بسته فاقد لیست تغییرات (changelog) است");
      const settingsCount =
        (pkg.settings?.customFields?.length || 0) +
        (pkg.settings?.notificationRules?.length || 0) +
        (pkg.settings?.widgetSettings ? 1 : 0);
      setPreview({
        version: pkg.version,
        title: pkg.title || `بروزرسانی ${pkg.version}`,
        changelog: pkg.changelog,
        hasSql: Boolean(pkg.database?.sql?.trim?.()),
        settingsCount,
        filesCount: pkg.files?.length || 0,
      });
    } catch (e) {
      setParseError((e as Error).message || "فایل قابل خواندن نیست");
      setPreview(null);
    }
  }

  async function applyUpdate() {
    if (!fileInput.current?.files?.[0]) return;
    setApplying(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", fileInput.current.files[0]);
    try {
      const res = await fetch("/api/updates/apply", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: body.error || "اعمال بروزرسانی ناموفق بود" });
      } else {
        setResult({ ok: true, message: body.message, changelog: body.changelog, currentVersion: body.currentVersion });
        setToast(body.message);
        setPreview(null);
        setFileName(null);
        if (fileInput.current) fileInput.current.value = "";
        await load();
      }
    } catch (e) {
      setResult({ ok: false, error: String((e as Error).message || e) });
    } finally {
      setApplying(false);
    }
  }

  // ---------------- Rollback ----------------
  async function doRollback() {
    if (!confirm) return;
    setRollbackBusy(true);
    try {
      const res =
        confirm.kind === "one"
          ? await fetch(`/api/updates/${confirm.update.id}/rollback`, { method: "POST" })
          : await fetch("/api/updates/rollback-to", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version: confirm.version }),
            });
      const body = await res.json();
      if (!res.ok) {
        setToast(body.error || "بازگشت نسخه ناموفق بود");
      } else {
        setToast(body.message);
        await load();
      }
    } catch (e) {
      setToast(String((e as Error).message || e));
    } finally {
      setRollbackBusy(false);
      setConfirm(null);
    }
  }

  if (pageError) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-white rounded-xl border border-rose-200 p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h1 className="font-bold text-lg text-slate-800 mb-2">دسترسی غیرمجاز</h1>
        <p className="text-sm text-slate-500">{pageError}</p>
      </div>
    );
  }

  const appliedUpdates = (data?.updates || []).filter((u) => u.status === "applied");
  const latestApplied = appliedUpdates[0];
  const appliedCount = appliedUpdates.length;

  return (
    <div className="pb-10">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">بروزرسانی سامانه</h1>
          <p className="text-slate-500 text-sm">
            بروزرسانی کامل با آپلود ZIP نسخه‌ی جدید، اعمال بسته‌های سبک (.srms-update)، تاریخچه‌ی نسخه‌ها و بازگشت به نسخه‌ی قبل
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-2">
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-500" />
            </span>
            <span className="text-sm font-bold text-emerald-800">نسخه فعال: {toFaDigits(data.currentVersion)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* ---------- Main column ---------- */}
        <div className="lg:col-span-2 space-y-4">
          {/* Full-system ZIP update */}
          <SystemZipUpdate onFinished={() => { load(); }} />

          {/* Upload */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-700 mb-3">۱. بارگذاری فایل بروزرسانی</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0] || null);
              }}
              onClick={() => fileInput.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                dragOver
                  ? "border-emerald-500 bg-emerald-50 scale-[1.01]"
                  : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50"
              }`}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".srms-update,.json"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
              <UploadCloud
                className={`w-10 h-10 mx-auto mb-3 transition-colors ${dragOver ? "text-emerald-600" : "text-slate-400"}`}
              />
              {fileName ? (
                <>
                  <div className="font-bold text-slate-700 text-sm mb-1 flex items-center justify-center gap-2">
                    <FileJson2 className="w-4 h-4 text-emerald-600" /> {fileName}
                  </div>
                  <div className="text-xs text-slate-400">برای جایگزینی، فایل دیگری رها کنید</div>
                </>
              ) : (
                <>
                  <div className="font-bold text-slate-600 text-sm mb-1">فایل <span dir="ltr">.srms-update</span> را اینجا رها کنید</div>
                  <div className="text-xs text-slate-400">یا برای انتخاب کلیک کنید</div>
                </>
              )}
            </div>

            {parseError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
                <XCircle className="w-4 h-4 shrink-0" /> {parseError}
              </div>
            )}
          </div>

          {/* Preview & confirm */}
          {preview && data && (
            <div className="bg-white rounded-xl border-2 border-emerald-200 p-5 shadow-sm animate-[fadeIn_.25s_ease]">
              <h2 className="font-bold text-slate-700 mb-4">۲. پیش‌نمایش بسته و تأیید</h2>
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <span className="text-sm text-slate-500">نسخه فعلی</span>
                <span dir="ltr" className="bg-slate-100 text-slate-600 rounded-lg px-3 py-1 font-bold text-sm">{data.currentVersion}</span>
                <span className="text-emerald-600 text-lg leading-none">◀</span>
                <span dir="ltr" className="bg-emerald-600 text-white rounded-lg px-3 py-1 font-bold text-sm shadow-md shadow-emerald-600/30">
                  {preview.version}
                </span>
              </div>
              <div className="font-bold text-slate-800 mb-1">{preview.title}</div>
              <div className="flex gap-2 flex-wrap mb-4">
                {preview.hasSql && (
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">
                    <Database className="w-3 h-3" /> اسکریپت پایگاه‌داده
                  </span>
                )}
                {preview.settingsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-1">
                    <Settings2 className="w-3 h-3" /> {toFaDigits(preview.settingsCount)} تغییر تنظیمات
                  </span>
                )}
                {preview.filesCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
                    <FileBox className="w-3 h-3" /> {toFaDigits(preview.filesCount)} فایل
                  </span>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <div className="text-xs font-bold text-slate-500 mb-2">لیست تغییرات این نسخه:</div>
                <ul className="space-y-1.5">
                  {preview.changelog.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={applyUpdate}
                  disabled={applying}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg px-6 py-2.5 transition disabled:opacity-50 shadow-md shadow-emerald-600/20"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {applying ? "در حال اعمال..." : "اعمال بروزرسانی"}
                </button>
                <button
                  onClick={() => {
                    setPreview(null);
                    setFileName(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 rounded-lg px-4 py-2.5 hover:bg-slate-100 transition"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}

          {/* Result message */}
          {result && (
            <div
              className={`rounded-xl border p-5 animate-[fadeIn_.25s_ease] ${
                result.ok ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
              }`}
            >
              {result.ok ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <div>
                      <div className="font-bold text-emerald-800">{result.message}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">
                        نسخه فعلی سامانه: <b dir="ltr">{toFaDigits(result.currentVersion)}</b>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-4 border border-emerald-100">
                    <div className="text-xs font-bold text-emerald-700 mb-2">تغییرات اعمال‌شده در این نسخه:</div>
                    <ul className="space-y-1.5">
                      {result.changelog.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="text-emerald-500 shrink-0 mt-0.5">✓</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                  <div>
                    <div className="font-bold text-rose-700">اعمال بروزرسانی ناموفق بود</div>
                    <div className="text-sm text-rose-600 mt-0.5">{result.error}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" /> تاریخچه نسخه‌ها
              </h2>
              <span className="text-xs text-slate-400">{toFaDigits(data?.updates.length || 0)} بروزرسانی ثبت‌شده</span>
            </div>

            {!data ? (
              <div className="text-sm text-slate-400 py-6 text-center">در حال بارگذاری...</div>
            ) : (
              <div className="relative pr-6">
                {/* timeline line */}
                <span className="absolute right-[9px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full" />

                {/* base version node */}
                <div className="relative pb-6">
                  <span className="absolute -right-6 top-1 w-5 h-5 rounded-full border-4 border-slate-200 bg-white" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span dir="ltr" className="bg-slate-100 text-slate-600 rounded-lg px-2.5 py-0.5 font-bold text-sm">
                      {data.baseVersion}
                    </span>
                    <span className="text-sm font-bold text-slate-600">نسخه پایه سامانه</span>
                    {data.currentVersion !== data.baseVersion && (
                      <button
                        onClick={() =>
                          setConfirm({
                            kind: "to",
                            version: data.baseVersion,
                            count: appliedCount,
                            label: `نسخه پایه ${data.baseVersion}`,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-full px-2.5 py-1 transition"
                      >
                        <RotateCcw className="w-3 h-3" /> بازگشت به نسخه پایه
                      </button>
                    )}
                  </div>
                </div>

                {data.updates.map((u) => {
                  const isCurrent = u.status === "applied" && u.version === data.currentVersion;
                  const isLatestApplied = latestApplied?.id === u.id;
                  const isOpen = expanded === u.id;
                  return (
                    <div key={u.id} className="relative pb-6 last:pb-0">
                      <span
                        className={`absolute -right-6 top-1 w-5 h-5 rounded-full border-4 border-white shadow ${
                          isCurrent
                            ? "bg-emerald-500"
                            : u.status === "applied"
                              ? "bg-emerald-300"
                              : u.status === "failed"
                                ? "bg-rose-400"
                                : "bg-slate-300"
                        }`}
                      />
                      <div
                        className={`rounded-xl border p-4 transition-all hover:shadow-md ${
                          isCurrent ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              dir="ltr"
                              className={`rounded-lg px-2.5 py-0.5 font-bold text-sm ${
                                isCurrent ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {u.version}
                            </span>
                            <span className="font-bold text-slate-700 text-sm">{u.title}</span>
                            {isCurrent && (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                                نسخه فعال
                              </span>
                            )}
                            <StatusBadge status={u.status} />
                          </div>
                          <button
                            onClick={() => setExpanded(isOpen ? null : u.id)}
                            className="text-slate-400 hover:text-slate-600 transition"
                            aria-label="نمایش تغییرات"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        <div className="text-xs text-slate-400 mt-1.5">
                          {isoTimestampToJalali(u.appliedAt)}
                          {u.appliedByName ? ` — توسط ${u.appliedByName}` : ""}
                          {u.status === "rolled_back" && u.rolledBackAt ? ` · بازگشت در ${isoTimestampToJalali(u.rolledBackAt)}` : ""}
                          {u.previousVersion ? ` · نصب‌شده روی نسخه ${toFaDigits(u.previousVersion)}` : ""}
                        </div>

                        {isOpen && (
                          <div className="mt-3 bg-slate-50 rounded-lg p-3 animate-[fadeIn_.2s_ease]">
                            <div className="text-xs font-bold text-slate-500 mb-1.5">لیست تغییرات:</div>
                            <ul className="space-y-1">
                              {u.changelog.map((c, i) => (
                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                  <span className="text-emerald-500 mt-0.5">•</span> {c}
                                </li>
                              ))}
                            </ul>
                            {u.status === "failed" && u.errorMessage && (
                              <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                                {u.errorMessage}
                              </div>
                            )}
                          </div>
                        )}

                        {u.status === "applied" && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 flex-wrap">
                            {isLatestApplied ? (
                              <button
                                onClick={() => setConfirm({ kind: "one", update: u })}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 border border-rose-300 bg-rose-50 hover:bg-rose-100 rounded-lg px-3 py-1.5 transition"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> می‌خواهم به نسخه قبل برگردم
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setConfirm({
                                    kind: "to",
                                    version: u.previousVersion || data.baseVersion,
                                    count: appliedUpdates.filter((x) => x.id >= u.id).length,
                                    label: `نسخه ${u.previousVersion || data.baseVersion}`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition"
                              >
                                <History className="w-3.5 h-3.5" /> بازگشت به این نسخه ({toFaDigits(u.previousVersion || data.baseVersion)})
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Side column ---------- */}
        <div className="space-y-4">
          {/* Version status card */}
          <div className="rounded-xl bg-slate-900 text-white p-5 relative overflow-hidden">
            <div className="absolute -top-10 -left-10 w-36 h-36 rounded-full bg-emerald-500/15 blur-2xl" />
            <div className="relative">
              <div className="text-xs text-slate-400 mb-1">نسخه فعلی سامانه</div>
              <div dir="ltr" className="text-left text-4xl font-black tracking-tight text-emerald-400">
                {data ? toFaDigits(data.currentVersion) : "—"}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>نسخه پایه</span>
                  <b dir="ltr">{toFaDigits(data?.baseVersion || "1.0.0")}</b>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>بروزرسانی‌های فعال</span>
                  <b>{toFaDigits(appliedCount)}</b>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>کل بسته‌های ثبت‌شده</span>
                  <b>{toFaDigits(data?.updates.length || 0)}</b>
                </div>
              </div>
            </div>
          </div>

          {/* Sample download */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-700 text-sm mb-2">نمونه فایل بروزرسانی</h3>
            <p className="text-xs text-slate-500 leading-5 mb-3">
              یک بسته‌ی نمونه (نسخه ۱.۱.۰) برای آشنایی با قالب فایل و تست فرآیند اعمال و بازگشت.
            </p>
            <a
              href="/api/updates/sample"
              download
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-lg px-4 py-2 transition w-full justify-center"
            >
              <Download className="w-4 h-4" /> دانلود <span dir="ltr">srms-update-v1.1.0</span>
            </a>
          </div>

          {/* Format guide */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> نحوه کار
            </h3>
            <ol className="text-xs text-slate-500 space-y-2 leading-5 list-decimal pr-4">
              <li>فایل <span dir="ltr" className="font-mono bg-slate-100 rounded px-1">.srms-update</span> را بارگذاری کنید.</li>
              <li>پیش‌نمایش و لیست تغییرات را بررسی و تأیید کنید.</li>
              <li>پس از اعمال، پیام تغییرات نمایش داده می‌شود.</li>
              <li>در صورت نیاز، با یک کلیک به هر نسخه قبلی برگردید.</li>
            </ol>
            <div className="mt-3 text-[11px] text-slate-400 leading-5 bg-slate-50 rounded-lg p-3">
              تغییرات پایگاه‌داده در تراکنش اجرا می‌شوند و قبل از اعمال، اسنپ‌شات حالت قبلی گرفته می‌شود؛ به همین دلیل بازگشت نسخه دقیق و امن است.
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Confirm modal ---------- */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" onClick={() => !rollbackBusy && setConfirm(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-[fadeIn_.2s_ease]">
            <div className="flex items-start gap-3 mb-4">
              <span className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-rose-600" />
              </span>
              <div>
                <h3 className="font-bold text-slate-800">
                  {confirm.kind === "one" ? `بازگشت از نسخه‌ی ${toFaDigits(confirm.update.version)}` : `بازگشت به ${toFaDigits(confirm.label)}`}
                </h3>
                <p className="text-sm text-slate-500 mt-1 leading-6">
                  {confirm.kind === "one" ? (
                    <>
                      این عمل نسخه‌ی <b>{toFaDigits(confirm.update.version)}</b> را لغو می‌کند و سامانه به نسخه‌ی{" "}
                      <b>{toFaDigits(confirm.update.previousVersion || data?.baseVersion || "1.0.0")}</b> برمی‌گردد.
                      تغییرات این نسخه (اسکریپت بازگشت، تنظیمات و فایل‌ها) به حالت قبل بازمی‌گردند.
                    </>
                  ) : (
                    <>
                      با این عمل <b>{toFaDigits(confirm.count)}</b> بروزرسانی جدیدتر به ترتیب معکوس لغو می‌شوند و سامانه به{" "}
                      <b>{toFaDigits(confirm.version)}</b> برمی‌گردد.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirm(null)}
                disabled={rollbackBusy}
                className="text-sm text-slate-600 hover:bg-slate-100 rounded-lg px-4 py-2 transition"
              >
                انصراف
              </button>
              <button
                onClick={doRollback}
                disabled={rollbackBusy}
                className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg px-5 py-2 transition disabled:opacity-60"
              >
                {rollbackBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                تأیید بازگشت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Toast ---------- */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white text-sm rounded-xl shadow-2xl px-5 py-3.5 max-w-sm animate-[fadeIn_.2s_ease] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "applied")
    return (
      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">اعمال‌شده</span>
    );
  if (status === "rolled_back")
    return (
      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">بازگشت‌خورده</span>
    );
  return <span className="text-[11px] font-bold text-rose-700 bg-rose-100 rounded-full px-2 py-0.5">ناموفق</span>;
}
