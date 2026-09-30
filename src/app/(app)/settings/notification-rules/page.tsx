"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, Edit2, Trash2, Save, X, ToggleLeft, ToggleRight } from "lucide-react";

interface Rule {
  id: number;
  name: string;
  description: string | null;
  dateField: string;
  daysBefore: number;
  priority: string;
  recurrence: string;
  filters: Record<string, unknown>;
  messageTemplate: string;
  isActive: boolean;
}

const DATE_FIELDS = [
  { value: "marriage_date", label: "تاریخ ازدواج" },
  { value: "service_end_date", label: "تاریخ پایان خدمت" },
  { value: "dispatch_date", label: "تاریخ اعزام" },
  { value: "birth_date", label: "تاریخ تولد" },
  { value: "service_start_date", label: "تاریخ شروع خدمت" },
  { value: "service_mid_date", label: "نیمه‌ی دوره‌ی خدمت (محاسبه‌ای)" },
  { value: "mission_start_date", label: "تاریخ معرفی ماموریت" },
  { value: "mission_end_date", label: "تاریخ پایان ماموریت" },
];

const PRIORITIES = [
  { value: "low", label: "کم", color: "bg-slate-100 text-slate-600" },
  { value: "normal", label: "عادی", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "مهم", color: "bg-orange-100 text-orange-700" },
  { value: "urgent", label: "فوری", color: "bg-red-100 text-red-700" },
];

const RECURRENCES = [
  { value: "yearly", label: "سالانه (تکرار هر سال)" },
  { value: "once", label: "یک‌بار (فقط یک بار برای هر سرباز)" },
];

const EMPTY: Omit<Rule, "id"> = {
  name: "",
  description: "",
  dateField: "marriage_date",
  daysBefore: 5,
  priority: "normal",
  recurrence: "yearly",
  filters: {},
  messageTemplate: "{{firstName}} {{lastName}} — {{daysLeft}} روز تا {{eventDate}}",
  isActive: true,
};

function faDigits(s: string): string {
  const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return s.replace(/[0-9]/g, (c) => FA[+c]);
}

export default function NotificationRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/notification-rules");
    const data = await res.json();
    setRules(data.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing({ id: 0, ...EMPTY });
    setIsNew(true);
  }
  function openEdit(r: Rule) {
    setEditing({ ...r });
    setIsNew(false);
  }
  function cancel() { setEditing(null); setIsNew(false); }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { alert("نام الزامی است"); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/notification-rules" : `/api/notification-rules/${editing.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      if (!res.ok) { alert("خطا در ذخیره"); return; }
      cancel();
      load();
    } finally { setSaving(false); }
  }

  const [presetMsg, setPresetMsg] = useState<string | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);
  async function addPresets() {
    setPresetBusy(true);
    setPresetMsg(null);
    try {
      const res = await fetch("/api/notification-rules/presets", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPresetMsg(data.error || "خطا در افزودن قوانین پیشنهادی"); return; }
      setPresetMsg(
        data.created > 0
          ? `${faDigits(String(data.created))} قانون پیشنهادی جدید اضافه شد (${faDigits(String(data.skipped))} قانون از قبل وجود داشت).`
          : "همه‌ی قوانین پیشنهادی از قبل وجود دارند.",
      );
      load();
    } finally { setPresetBusy(false); }
  }

  async function toggleActive(r: Rule) {
    await fetch(`/api/notification-rules/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    load();
  }

  async function del(r: Rule) {
    if (!confirm(`حذف قانون «${r.name}»؟`)) return;
    await fetch(`/api/notification-rules/${r.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Bell className="w-7 h-7 text-emerald-600" />
            قوانین اعلان
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            تعریف و مدیریت قوانین تولید اعلان (سالگرد ازدواج، نزدیک پایان خدمت، تولد و...)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={addPresets} disabled={presetBusy} className="bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm disabled:opacity-60">
            <Bell className="w-4 h-4" /> {presetBusy ? "در حال افزودن..." : "افزودن قوانین پیشنهادی"}
          </button>
          <button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> قانون جدید
          </button>
        </div>
      </div>
      {presetMsg && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2">{presetMsg}</div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-xl border-2 border-emerald-300 p-5 mb-4 shadow-lg">
          <h2 className="font-bold text-slate-700 mb-4">{isNew ? "➕ افزودن قانون جدید" : "✏️ ویرایش قانون"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نام قانون *</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="مثال: سالگرد ازدواج" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">فیلد تاریخ *</label>
              <select value={editing.dateField} onChange={(e) => setEditing({ ...editing, dateField: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                {DATE_FIELDS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">چند روز قبل از رویداد</label>
              <input type="number" min={0} max={365} value={editing.daysBefore} onChange={(e) => setEditing({ ...editing, daysBefore: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اولویت</label>
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">تکرار</label>
              <select value={editing.recurrence} onChange={(e) => setEditing({ ...editing, recurrence: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">وضعیت تاهل (فیلتر اختیاری)</label>
              <select value={(editing.filters.maritalStatus as string) || ""} onChange={(e) => setEditing({ ...editing, filters: { ...editing.filters, maritalStatus: e.target.value || undefined } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">همه</option>
                <option value="متاهل">متاهل</option>
                <option value="مجرد">مجرد</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">وضعیت خدمت (فیلتر اختیاری)</label>
              <select value={(editing.filters.serviceStatus as string) || ""} onChange={(e) => setEditing({ ...editing, filters: { ...editing.filters, serviceStatus: e.target.value || undefined } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">همه</option>
                <option value="در حال خدمت">در حال خدمت</option>
                <option value="تسویه شده">تسویه شده</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">فعال</label>
              <button type="button" onClick={() => setEditing({ ...editing, isActive: !editing.isActive })} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${editing.isActive ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-slate-100 border-slate-300 text-slate-600"}`}>
                {editing.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {editing.isActive ? "فعال" : "غیرفعال"}
              </button>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">توضیحات</label>
              <input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">قالب پیام</label>
              <textarea value={editing.messageTemplate} onChange={(e) => setEditing({ ...editing, messageTemplate: e.target.value })} rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="{{firstName}} {{lastName}} — {{daysLeft}} روز مانده تا {{eventDate}}" />
              <p className="text-xs text-slate-500 mt-1">
                متغیرهای قابل استفاده: <code className="bg-slate-100 px-1 rounded">{"{{firstName}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{lastName}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{nationalCode}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{personnelCode}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{serviceUnit}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{rank}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{daysLeft}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{eventDate}}"}</code>
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
            <button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-5 py-2 flex items-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? "در حال ذخیره..." : "ذخیره"}
            </button>
            <button onClick={cancel} className="border border-slate-300 text-sm rounded-lg px-5 py-2 flex items-center gap-2 hover:bg-slate-50">
              <X className="w-4 h-4" /> انصراف
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">در حال بارگذاری...</div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-slate-500">هیچ قانونی تعریف نشده. روی «قانون جدید» کلیک کنید.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((r) => {
            const priority = PRIORITIES.find((p) => p.value === r.priority) || PRIORITIES[1];
            const dateFieldLabel = DATE_FIELDS.find((d) => d.value === r.dateField)?.label || r.dateField;
            return (
              <div key={r.id} className={`bg-white rounded-xl border ${r.isActive ? "border-slate-200" : "border-slate-200 opacity-60"} p-5 shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-slate-800">{r.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.color}`}>{priority.label}</span>
                      {!r.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">غیرفعال</span>}
                    </div>
                    {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => toggleActive(r)} title={r.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"} className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {r.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(r)} title="ویرایش" className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center justify-center">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => del(r)} title="حذف" className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">فیلد تاریخ</div>
                    <div className="font-bold text-slate-700 mt-0.5">{dateFieldLabel}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">روزهای قبل</div>
                    <div className="font-bold text-slate-700 mt-0.5">{faDigits(String(r.daysBefore))} روز</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">تکرار</div>
                    <div className="font-bold text-slate-700 mt-0.5">{RECURRENCES.find((x) => x.value === r.recurrence)?.label}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">فیلترها</div>
                    <div className="font-bold text-slate-700 mt-0.5 text-[11px]">
                      {Object.keys(r.filters || {}).length === 0 ? "—" : Object.entries(r.filters).map(([k, v]) => `${k}=${String(v)}`).join("، ")}
                    </div>
                  </div>
                </div>

                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 font-mono break-all">
                  {r.messageTemplate}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
