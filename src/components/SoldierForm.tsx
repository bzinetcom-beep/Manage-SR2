"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SOLDIER_FIELDS, SOLDIER_SECTIONS, DATE_KEYS, type FieldDef } from "@/lib/fields";
import { isoToJalali, jalaliToIso, toEnDigits } from "@/lib/jalali";
import JalaliDatePicker from "@/components/JalaliDatePicker";

interface CustomField {
  fieldKey: string;
  label: string;
  fieldType: string;
  options: string[];
  section: string;
}

const dateSet = new Set(DATE_KEYS);

export default function SoldierForm({
  initial,
  soldierId,
}: {
  initial?: Record<string, unknown>;
  soldierId?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [activeSection, setActiveSection] = useState(SOLDIER_SECTIONS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/custom-fields")
      .then((r) => r.json())
      .then((d) => setCustomFields(d.data || []));

    fetch("/api/service-units")
      .then((r) => r.json())
      .then((d) => {
        if (d.data && Array.isArray(d.data)) {
          setUnitOptions(d.data.map((u: any) => u.name));
        }
      });
  }, []);

  useEffect(() => {
    if (!initial) return;
    const meta = (initial.metadata as Record<string, unknown>) || {};
    const merged = { ...initial, ...meta };
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) continue;
      next[k] = dateSet.has(k) ? isoToJalali(String(v), false) : String(v);
    }
    setForm(next);
  }, [initial]);

  function set(key: string, val: string) {
    const clean = toEnDigits(val);
    setForm((f) => ({ ...f, [key]: clean }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.firstName || !form.lastName) {
      setError("نام و نام خانوادگی الزامی است");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      const normalizedVal = typeof v === "string" ? toEnDigits(v) : v;
      if (dateSet.has(k)) payload[k] = normalizedVal ? jalaliToIso(String(normalizedVal)) : null;
      else payload[k] = normalizedVal;
    }
    try {
      const res = await fetch(soldierId ? `/api/soldiers/${soldierId}` : "/api/soldiers", {
        method: soldierId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در ذخیره");
        return;
      }
      router.push(`/soldiers/${soldierId || data.data.id}`);
      router.refresh();
    } catch {
      setError("خطای ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  }

  const customBySection: Record<string, CustomField[]> = {};
  for (const cf of customFields) {
    (customBySection[cf.section] ||= []).push(cf);
  }
  const allSections = Array.from(new Set([...SOLDIER_SECTIONS, ...Object.keys(customBySection)]));

  function renderField(f: FieldDef) {
    const common = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none";
    if (f.type === "select") {
      const opts =
        f.key === "serviceUnit" && unitOptions.length > 0
          ? Array.from(new Set([...(f.options || []), ...unitOptions]))
          : f.options;
      return (
        <select value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} className={common}>
          <option value="">— انتخاب —</option>
          {opts?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === "textarea") {
      return <textarea value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} rows={2} placeholder={`مثال: ${f.label}...`} className={common} />;
    }
    if (f.type === "date") {
      return <JalaliDatePicker value={form[f.key] || ""} onChange={(v) => set(f.key, v)} placeholder={`مثال: ۱۴۰۳/۰۱/۱۵`} />;
    }
    return (
      <input
        value={form[f.key] || ""}
        onChange={(e) => set(f.key, e.target.value)}
        placeholder={`مثال: ${f.label}...`}
        dir={f.type === "number" ? "ltr" : undefined}
        className={common}
      />
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="flex gap-2 flex-wrap mb-4 border-b border-slate-200 pb-3">
        {allSections.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveSection(s)}
            className={`text-sm px-3 py-1.5 rounded-lg ${
              activeSection === s ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {allSections.map((section) => (
        <div key={section} className={activeSection === section ? "block" : "hidden"}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SOLDIER_FIELDS.filter((f) => f.section === section).map((f) => {
              if (f.key === "marriageDate" && form.maritalStatus !== "متاهل") return null;
              if (f.key === "childrenCount" && form.maritalStatus !== "متاهل") return null;
              return (
              <div key={f.key}>
                <label className="block text-sm text-slate-600 mb-1">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                {renderField(f)}
              </div>
            )})}
            {(customBySection[section] || []).map((cf) => (
              <div key={cf.fieldKey}>
                <label className="block text-sm text-slate-600 mb-1">
                  {cf.label} <span className="text-xs text-violet-500">(پویا)</span>
                </label>
                {cf.fieldType === "select" ? (
                  <select
                    value={form[cf.fieldKey] || ""}
                    onChange={(e) => set(cf.fieldKey, e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— انتخاب —</option>
                    {cf.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : cf.fieldType === "date" ? (
                  <JalaliDatePicker value={form[cf.fieldKey] || ""} onChange={(v) => set(cf.fieldKey, v)} placeholder="مثال: ۱۴۰۳/۰۱/۱۵" />
                ) : (
                  <input
                    value={form[cf.fieldKey] || ""}
                    onChange={(e) => set(cf.fieldKey, e.target.value)}
                    placeholder={`مثال: ${cf.label}...`}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-3 mt-6 pt-4 border-t border-slate-200">
        <button
          type="submit"
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-6 py-2.5 text-sm disabled:opacity-60"
        >
          {saving ? "در حال ذخیره..." : soldierId ? "ذخیره تغییرات" : "ثبت سرباز"}
        </button>
        <button type="button" onClick={() => router.back()} className="border border-slate-300 rounded-lg px-6 py-2.5 text-sm">
          انصراف
        </button>
      </div>
      {!soldierId && (
        <p className="text-xs text-slate-400 mt-3">
          نکته: تاریخ پایان خدمت به‌صورت خودکار = تاریخ اعزام + ۲۱ ماه محاسبه می‌شود و با ثبت کسری/اضافه خدمت بازمحاسبه خواهد شد.
        </p>
      )}
    </form>
  );
}
