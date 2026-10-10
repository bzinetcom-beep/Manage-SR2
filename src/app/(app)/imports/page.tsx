"use client";

import { useState } from "react";
import { toFaDigits } from "@/lib/jalali";
import SoldierCrudPanel from "@/components/SoldierCrudPanel";

interface Preview {
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  recognizedHeaders?: string[];
  ignoredHeaders?: string[];
  totalRows: number;
  sample: Record<string, unknown>[];
  fields: { key: string; label: string }[];
}
interface Summary {
  summary: { created: number; updated: number; failed: number; skipped: number; total: number };
  errors: { row: number; message: string }[];
}

export default function ImportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filterMode, setFilterMode] = useState<"all" | "mapped" | "unmapped">("all");
  const [matchRule, setMatchRule] = useState("nationalCode");
  const [policy, setPolicy] = useState("upsert");
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function doPreview() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "preview");
      const res = await fetch("/api/soldiers/import", { method: "POST", body: fd });
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`پاسخ سرور در قالب معتبر JSON دریافت نشد (کد وضعیت ${res.status}).`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `خطا در دریافت پیش‌نمایش فایل اکسل (کد ${res.status})`);
      }

      setPreview({
        headers: Array.isArray(data.headers) ? data.headers : [],
        suggestedMapping: data.suggestedMapping || {},
        recognizedHeaders: Array.isArray(data.recognizedHeaders) ? data.recognizedHeaders : [],
        ignoredHeaders: Array.isArray(data.ignoredHeaders) ? data.ignoredHeaders : [],
        totalRows: Number(data.totalRows) || 0,
        sample: Array.isArray(data.sample) ? data.sample : [],
        fields: Array.isArray(data.fields) ? data.fields : [],
      });
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.suggestedMapping || {})) {
        if (v) m[k] = v as string;
      }
      setMapping(m);
    } catch (err: any) {
      console.error("[Imports] Preview error:", err);
      setErrorMsg(err?.message || "خطا در پردازش پیش‌نمایش فایل اکسل");
    } finally {
      setBusy(false);
    }
  }

  async function doCommit() {
    if (!file) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "commit");
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("matchRule", matchRule);
      fd.append("policy", policy);
      const res = await fetch("/api/soldiers/import", { method: "POST", body: fd });
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`پاسخ سرور در قالب معتبر JSON دریافت نشد (کد وضعیت ${res.status}).`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `خطا در ثبت نهایی اطلاعات (کد ${res.status})`);
      }

      setResult(data);
    } catch (err: any) {
      console.error("[Imports] Commit error:", err);
      setErrorMsg(err?.message || "خطا در بارگذاری و ذخیره اطلاعات فایل اکسل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">ایمپورت / اکسپورت اکسل</h1>
      <p className="text-slate-500 text-sm mb-6">
        ورود و خروج گروهی اکسل با نگاشت ستون‌ها و اعتبارسنجی + ایجاد، ویرایش و حذف مستقیم رکوردها (CRUD) روی پایگاه‌داده
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">۱. انتخاب فایل اکسل</h2>
          <div className="flex gap-3 flex-wrap items-center">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            <button onClick={doPreview} disabled={!file || busy} className="bg-slate-800 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50">
              {busy ? "..." : "بارگذاری و پیش‌نمایش"}
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">خروجی اکسل</h2>
          <div className="flex flex-col gap-2 items-start">
            <a href="/api/soldiers/export" target="_blank" className="inline-block bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-4 py-2 transition-colors">
              📤 دانلود سربازان در حال خدمت
            </a>
            <a
              href="/api/soldiers/export?settled=only"
              target="_blank"
              title="سربازانی که پایان خدمت‌شان گذشته است"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg px-4 py-2 transition-colors"
            >
              🎖️ دانلود سربازان تسویه‌شده
            </a>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-rose-800">خطا:</span>
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs bg-rose-200/60 hover:bg-rose-200 text-rose-800 rounded-lg px-2 py-1 transition"
          >
            بستن
          </button>
        </div>
      )}

      {preview && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg">۲. نگاشت ستون‌ها ({toFaDigits(preview.totalRows)} ردیف)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تنها ستون‌های منطبق با فیلدهای فعلی سامانه اضافه می‌شوند و سایر ستون‌های فایل به صورت خودکار نادیده گرفته می‌شوند.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                منطبق: {toFaDigits(Object.values(mapping).filter(Boolean).length)} ستون
              </span>
              <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full font-medium">
                نادیده: {toFaDigits(preview.headers.length - Object.values(mapping).filter(Boolean).length)} ستون
              </span>
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${filterMode === "all" ? "bg-white font-bold text-slate-800 shadow-xs" : "text-slate-500"}`}
                >
                  همه ({toFaDigits(preview.headers.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("mapped")}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${filterMode === "mapped" ? "bg-white font-bold text-emerald-700 shadow-xs" : "text-slate-500"}`}
                >
                  فقط منطبق‌ها
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("unmapped")}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${filterMode === "unmapped" ? "bg-white font-bold text-slate-700 shadow-xs" : "text-slate-500"}`}
                >
                  نادیده‌ها
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {preview.headers
              .filter((h) => {
                if (filterMode === "mapped") return Boolean(mapping[h]);
                if (filterMode === "unmapped") return !mapping[h];
                return true;
              })
              .map((h) => {
                const isMapped = Boolean(mapping[h]);
                return (
                  <div
                    key={h}
                    className={`rounded-lg p-2.5 border transition-colors ${
                      isMapped
                        ? "border-emerald-300 bg-emerald-50/30"
                        : "border-slate-200 bg-slate-50/50 opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500">ستون اکسل: <b className="text-slate-800 font-medium">{h}</b></span>
                      {isMapped ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-bold">منطبق</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">نادیده</span>
                      )}
                    </div>
                    <select
                      value={mapping[h] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">— نادیده گرفتن —</option>
                      {preview.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                );
              })}
          </div>

          <div className="flex gap-4 flex-wrap items-end border-t border-slate-100 pt-4">
            <div>
              <label className="text-sm text-slate-600 block mb-1">قاعده تطبیق (جلوگیری از تکرار)</label>
              <select value={matchRule} onChange={(e) => setMatchRule(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="nationalCode">کد ملی</option>
                <option value="personnelCode">کد پرسنلی</option>
                <option value="fileNumber">شماره پرونده</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1">سیاست ورود</label>
              <select value={policy} onChange={(e) => setPolicy(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="upsert">درج و بروزرسانی (Upsert)</option>
                <option value="insert">فقط درج جدید (رد تکراری‌ها)</option>
                <option value="skip">فقط بروزرسانی موجودها</option>
              </select>
            </div>
            <button onClick={doCommit} disabled={busy} className="bg-emerald-600 text-white text-sm rounded-lg px-6 py-2 disabled:opacity-50">
              {busy ? "در حال ثبت..." : "ثبت نهایی"}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <div className="text-sm font-bold text-slate-600 mb-2">پیش‌نمایش (۱۰ ردیف اول)</div>
            <table className="w-full text-xs border">
              <thead className="bg-slate-50">
                <tr>{preview.headers.map((h) => <th key={h} className="border px-2 py-1 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i}>{preview.headers.map((h) => <td key={h} className="border px-2 py-1 whitespace-nowrap">{String(r[h] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">۳. نتیجه ورود اطلاعات</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <SummaryBox label="کل" value={result.summary.total} color="slate" />
            <SummaryBox label="جدید" value={result.summary.created} color="emerald" />
            <SummaryBox label="بروزرسانی" value={result.summary.updated} color="blue" />
            <SummaryBox label="رد شده" value={result.summary.skipped} color="amber" />
            <SummaryBox label="خطا" value={result.summary.failed} color="rose" />
          </div>
          {result.errors.length > 0 && (
            <div className="border border-rose-200 rounded-lg p-3 bg-rose-50 max-h-56 overflow-auto text-sm">
              <div className="font-bold text-rose-700 mb-2">خطاهای ردیف‌ها:</div>
              {result.errors.map((e, i) => (
                <div key={i} className="text-rose-600">ردیف {toFaDigits(e.row)}: {e.message}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <SoldierCrudPanel />
      </div>
    </div>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: number; color: string }) {
  const c: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-lg p-3 text-center ${c[color]}`}>
      <div className="text-2xl font-bold">{toFaDigits(value)}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}
