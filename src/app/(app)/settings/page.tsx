"use client";

import { useEffect, useState } from "react";
import { SOLDIER_SECTIONS } from "@/lib/fields";

interface CustomField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  section: string;
  options: string[];
}

export default function SettingsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [form, setForm] = useState({ fieldKey: "", label: "", fieldType: "text", section: "سایر", options: "" });
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/custom-fields");
    const data = await res.json();
    setFields(data.data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setError("");
    if (!form.fieldKey || !form.label) { setError("کلید و برچسب الزامی است"); return; }
    const res = await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        options: form.options ? form.options.split(",").map((s) => s.trim()).filter(Boolean) : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "خطا"); return; }
    setForm({ fieldKey: "", label: "", fieldType: "text", section: "سایر", options: "" });
    load();
  }

  async function del(id: number) {
    if (!confirm("حذف این فیلد پویا؟")) return;
    await fetch(`/api/custom-fields/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">فیلدهای پویا و تنظیمات</h1>
      <p className="text-slate-500 text-sm mb-6">فیلدهای سفارشی تعریف‌شده به‌صورت خودکار در فرم ثبت سرباز و جزئیات نمایش داده می‌شوند (ذخیره در metadata).</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">افزودن فیلد جدید</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-2 mb-3">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-600">کلید (انگلیسی)</label>
              <input value={form.fieldKey} onChange={(e) => setForm({ ...form, fieldKey: e.target.value })} dir="ltr" placeholder="unitCode" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-slate-600">برچسب فارsi</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="مثال: کد یگان" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-slate-600">نوع</label>
              <select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="text">متن</option>
                <option value="number">عدد</option>
                <option value="date">تاریخ</option>
                <option value="select">انتخابی</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600">بخش</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {[...SOLDIER_SECTIONS, "سایر"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {form.fieldType === "select" && (
              <div>
                <label className="text-sm text-slate-600">گزینه‌ها (با , جدا کنید)</label>
                <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <button onClick={add} className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm">افزودن فیلد</button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-700 mb-3">فیلدهای پویا فعلی</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">کلید</th>
                <th className="px-3 py-2 text-right">برچسب</th>
                <th className="px-3 py-2 text-right">نوع</th>
                <th className="px-3 py-2 text-right">بخش</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400">فیلدی تعریف نشده</td></tr>
              ) : fields.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2 font-mono text-xs" dir="ltr">{f.fieldKey}</td>
                  <td className="px-3 py-2">{f.label}</td>
                  <td className="px-3 py-2">{f.fieldType}</td>
                  <td className="px-3 py-2">{f.section}</td>
                  <td className="px-3 py-2"><button onClick={() => del(f.id)} className="text-red-600 hover:underline">حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
