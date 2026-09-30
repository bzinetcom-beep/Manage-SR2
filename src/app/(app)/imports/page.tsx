"use client";

import { useState } from "react";
import { toFaDigits } from "@/lib/jalali";
import SoldierCrudPanel from "@/components/SoldierCrudPanel";

interface Preview {
  headers: string[];
  suggestedMapping: Record<string, string | null>;
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
  const [matchRule, setMatchRule] = useState("nationalCode");
  const [policy, setPolicy] = useState("upsert");
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "preview");
    const res = await fetch("/api/soldiers/import", { method: "POST", body: fd });
    const data = await res.json();
    setPreview(data);
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.suggestedMapping || {})) if (v) m[k] = v as string;
    setMapping(m);
    setBusy(false);
  }

  async function doCommit() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "commit");
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("matchRule", matchRule);
    fd.append("policy", policy);
    const res = await fetch("/api/soldiers/import", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setBusy(false);
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

      {preview && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-700">۲. نگاشت ستون‌ها ({toFaDigits(preview.totalRows)} ردیف)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {preview.headers.map((h) => (
              <div key={h} className="border border-slate-200 rounded-lg p-2">
                <div className="text-xs text-slate-500 mb-1">ستون اکسل: <b className="text-slate-700">{h}</b></div>
                <select
                  value={mapping[h] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">— نادیده گرفتن —</option>
                  {preview.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            ))}
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
