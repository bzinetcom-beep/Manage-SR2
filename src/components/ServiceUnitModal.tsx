"use client";

import { useState, useEffect } from "react";
import {
  Download,
  Upload,
  Plus,
  Trash2,
  X,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Edit2,
  Users,
  Percent,
  Check,
} from "lucide-react";
import { toFaDigits } from "@/lib/jalali";

export interface ServiceUnitItem {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  capacity: number;
  mandatedPercentage: number;
  soldierCount: number;
  fillPercentage: number;
  isShortage: boolean;
  minRequiredSoldiers?: number;
  shortageCount?: number;
}

export default function ServiceUnitModal({
  onClose,
  onUnitsChanged,
}: {
  onClose: () => void;
  onUnitsChanged?: () => void;
}) {
  const [units, setUnits] = useState<ServiceUnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "shortage" | "ok">("all");

  // Form state for adding new unit manually
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCapacity, setNewCapacity] = useState<number>(10);
  const [newMandated, setNewMandated] = useState<number>(80);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Quick edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCapacity, setEditCapacity] = useState<number>(10);
  const [editMandated, setEditMandated] = useState<number>(80);
  const [updating, setUpdating] = useState(false);

  // Excel import state
  const [uploading, setUploading] = useState(false);

  async function loadUnits() {
    setLoading(true);
    try {
      const res = await fetch("/api/service-units");
      const json = await res.json();
      setUnits(json.data || []);
      if (onUnitsChanged) onUnitsChanged();
    } catch (err) {
      console.error("Error fetching units:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/service-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          code: newCode.trim() || null,
          description: newDesc.trim() || null,
          capacity: Number(newCapacity) || 10,
          mandatedPercentage: Number(newMandated) || 80,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ثبت رده");

      setNewName("");
      setNewCode("");
      setNewDesc("");
      setNewCapacity(10);
      setNewMandated(80);
      setMessage({ type: "success", text: `رده خدمتی «${data.data.name}» با موفقیت اضافه شد.` });
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در افزودن رده" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: ServiceUnitItem) {
    setEditingId(u.id);
    setEditName(u.name);
    setEditCode(u.code || "");
    setEditDesc(u.description || "");
    setEditCapacity(u.capacity || 10);
    setEditMandated(u.mandatedPercentage ?? 80);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(unit: ServiceUnitItem) {
    setUpdating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/service-units", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: unit.id > 0 ? unit.id : undefined,
          name: editName.trim() || unit.name,
          code: editCode.trim() || null,
          description: editDesc.trim() || null,
          capacity: Number(editCapacity) || 10,
          mandatedPercentage: Number(editMandated) || 80,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ویرایش رده");

      setMessage({ type: "success", text: `تنظیمات ظرفیت رده «${editName || unit.name}» بروزرسانی شد.` });
      setEditingId(null);
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در بروزرسانی رده" });
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteUnit(id: number, name: string) {
    if (!confirm(`آیا از حذف رده خدمتی «${name}» اطمینان دارید؟`)) return;

    setMessage(null);
    try {
      const url = id > 0 ? `/api/service-units?id=${id}` : `/api/service-units?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "خطا در حذف");
      }
      setMessage({ type: "success", text: `رده خدمتی «${name}» حذف گردید.` });
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در حذف رده" });
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/service-units/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در آپلود فایل اکسل");

      setMessage({
        type: "success",
        text: `فایل اکسل پردازش شد: ${data.created} رده خدمتی با ظرفیت و سهمیه ابلاغی ثبت/بروزرسانی شد.`,
      });
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در بارگذاری اکسل" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const shortageUnits = units.filter((u) => u.isShortage);
  const totalCapacity = units.reduce((s, u) => s + (u.capacity || 0), 0);
  const totalActive = units.reduce((s, u) => s + (u.soldierCount || 0), 0);

  const filteredUnits = units.filter((u) => {
    const matchQuery =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.code && u.code.toLowerCase().includes(search.toLowerCase()));
    if (!matchQuery) return false;

    if (filterMode === "shortage") return u.isShortage;
    if (filterMode === "ok") return !u.isShortage;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto dir-rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-700 via-teal-700 to-slate-800 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span>مدیریت رده‌های خدمتی، ظرفیت و سهمیه ابلاغی</span>
                {shortageUnits.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{toFaDigits(shortageUnits.length)} کمبود نیرو</span>
                  </span>
                )}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                تعیین ظرفیت مجاز، درصد ظرفیت ابلاغی، پایش کمبود سرباز (نمایش نارنجی) و اکسل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-slate-500 font-medium">تعداد کل رده‌ها</div>
              <div className="text-xl font-extrabold text-slate-800 mt-0.5">{toFaDigits(units.length)}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-emerald-700 font-medium">مجموع ظرفیت مصوب</div>
              <div className="text-xl font-extrabold text-emerald-800 mt-0.5">{toFaDigits(totalCapacity)} نفر</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-blue-700 font-medium">سربازان فعال حاضر</div>
              <div className="text-xl font-extrabold text-blue-800 mt-0.5">{toFaDigits(totalActive)} نفر</div>
            </div>
            <div className={`rounded-xl p-3 text-center border ${
              shortageUnits.length > 0
                ? "bg-orange-50 border-orange-300 text-orange-900 shadow-sm"
                : "bg-teal-50 border-teal-200 text-teal-800"
            }`}>
              <div className="text-[11px] font-medium">رده‌های با کمبود سرباز</div>
              <div className="text-xl font-extrabold mt-0.5 flex items-center justify-center gap-1">
                {shortageUnits.length > 0 ? "⚠️" : "✅"} {toFaDigits(shortageUnits.length)} رده
              </div>
            </div>
          </div>

          {/* Shortage Alert Banner (if any) */}
          {shortageUnits.length > 0 && (
            <div className="bg-orange-50 border-2 border-orange-400 rounded-xl p-3.5 flex items-center justify-between gap-3 text-orange-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-500 text-white rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">
                    هشدار کمبود نیرو: {toFaDigits(shortageUnits.length)} رده خدمتی کمتر از درصد ظرفیت ابلاغی پرسنل دارند!
                  </div>
                  <div className="text-[11px] text-orange-800 mt-0.5">
                    رده‌هایی که درصد اشغال آن‌ها از «ظرفیت ابلاغی» کمتر است با رنگ نارنجی مشخص شده‌اند.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setFilterMode(filterMode === "shortage" ? "all" : "shortage")}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow transition shrink-0"
              >
                {filterMode === "shortage" ? "نمایش همه رده‌ها" : "مشاهده رده‌های دارای کمبود"}
              </button>
            </div>
          )}

          {/* Action Toolbar: Excel Import / Export */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
            <div>
              <div className="text-xs font-bold text-emerald-800 mb-1.5">📤 خروجی اکسل و الگوی بارگذاری:</div>
              <div className="flex gap-2">
                <a
                  href="/api/service-units/export"
                  target="_blank"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود لیست با درصد ابلاغی</span>
                </a>
                <a
                  href="/api/service-units/import"
                  target="_blank"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود الگوی اکسل</span>
                </a>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-emerald-800 mb-1.5">📥 بارگذاری اکسل رده‌ها (همراه ظرفیت):</div>
              <label className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? "در حال بارگذاری..." : "بارگذاری فایل اکسل (.xlsx)"}</span>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Feedback Banner */}
          {message && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${
              message.type === "success"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}>
              {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Form for manual creation */}
          <form onSubmit={handleAddUnit} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>افزودن رده جدید و تعیین ظرفیت ابلاغی</span>
              </div>
              <span className="text-[11px] text-slate-500">حداقل درصد مجاز برای پایش کمبود پرسنل</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="نام رده خدمتی (مثال: منابع سرباز)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="کد رده (مثال: SR-01)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(Math.max(1, Number(e.target.value) || 1))}
                    title="ظرفیت کل رده (تعداد معین سرباز)"
                    placeholder="ظرفیت کل (نفر)"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 pl-8 font-mono"
                    required
                  />
                  <span className="absolute left-2 top-1.5 text-[10px] text-slate-400 font-bold">نفر</span>
                </div>
              </div>
              <div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newMandated}
                    onChange={(e) => setNewMandated(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    title="ظرفیت ابلاغی (درصد)"
                    placeholder="ظرفیت ابلاغی (%)"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 pl-6 font-mono"
                    required
                  />
                  <span className="absolute left-2 top-1.5 text-[10px] text-slate-400 font-bold">٪</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="توضیحات تکمیلی یا وظیفه رده (اختیاری)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="w-full sm:w-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ثبت رده</span>
                </button>
              </div>
            </div>
          </form>

          {/* Unit List & Filtering */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setFilterMode("all")}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    filterMode === "all"
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  همه ({toFaDigits(units.length)})
                </button>
                <button
                  onClick={() => setFilterMode("shortage")}
                  className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                    filterMode === "shortage"
                      ? "bg-orange-600 text-white shadow"
                      : "bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>کمبود سرباز ({toFaDigits(shortageUnits.length)})</span>
                </button>
                <button
                  onClick={() => setFilterMode("ok")}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    filterMode === "ok"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                >
                  مناسب / تکمیل ({toFaDigits(units.length - shortageUnits.length)})
                </button>
              </div>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در نام و کد رده..."
                className="border border-slate-300 rounded-lg px-3 py-1 text-xs w-52 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Units Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="max-h-72 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>در حال دریافت اطلاعات رده‌های خدمتی...</span>
                  </div>
                ) : filteredUnits.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    رده خدمتی با شرایط انتخاب‌شده یافت نشد.
                  </div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 font-bold">نام رده خدمتی</th>
                        <th className="p-2.5 text-center font-bold">کد</th>
                        <th className="p-2.5 text-center font-bold">ظرفیت کل</th>
                        <th className="p-2.5 text-center font-bold">ظرفیت ابلاغی</th>
                        <th className="p-2.5 text-center font-bold">سربازان فعال</th>
                        <th className="p-2.5 text-center font-bold w-40">میزان تکمیل</th>
                        <th className="p-2.5 text-center font-bold">وضعیت نیرو</th>
                        <th className="p-2.5 text-center font-bold">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUnits.map((u) => {
                        const isEditing = editingId === u.id;
                        const isShortage = u.isShortage;

                        // Row background: Orange if shortage, otherwise normal
                        const rowClasses = isShortage
                          ? "bg-orange-50/90 hover:bg-orange-100/80 border-r-4 border-r-orange-500 text-orange-950 transition-colors"
                          : "hover:bg-slate-50 text-slate-800 transition-colors";

                        return (
                          <tr key={u.id + u.name} className={rowClasses}>
                            {/* Unit Name */}
                            <td className="p-2.5 font-bold">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="border border-slate-300 rounded px-2 py-1 text-xs w-full bg-white"
                                />
                              ) : (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span>{u.name}</span>
                                    {isShortage && (
                                      <span className="text-[10px] bg-orange-600 text-white font-extrabold px-1.5 py-0.2 rounded">
                                        کمبود
                                      </span>
                                    )}
                                  </div>
                                  {u.description && (
                                    <div className="text-[10px] text-slate-500 font-normal line-clamp-1">
                                      {u.description}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Code */}
                            <td className="p-2.5 text-center text-slate-500 font-mono">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editCode}
                                  onChange={(e) => setEditCode(e.target.value)}
                                  className="border border-slate-300 rounded px-1.5 py-1 text-xs w-16 text-center bg-white"
                                />
                              ) : (
                                u.code || "—"
                              )}
                            </td>

                            {/* Capacity */}
                            <td className="p-2.5 text-center font-extrabold">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={editCapacity}
                                  onChange={(e) => setEditCapacity(Math.max(1, Number(e.target.value) || 1))}
                                  className="border border-slate-300 rounded px-1 py-1 text-xs w-16 text-center bg-white font-mono"
                                />
                              ) : (
                                <span>{toFaDigits(u.capacity)} نفر</span>
                              )}
                            </td>

                            {/* Mandated Percentage */}
                            <td className="p-2.5 text-center font-extrabold">
                              {isEditing ? (
                                <div className="inline-flex items-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={editMandated}
                                    onChange={(e) => setEditMandated(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                                    className="border border-slate-300 rounded px-1 py-1 text-xs w-14 text-center bg-white font-mono"
                                  />
                                  <span className="text-[11px] text-slate-500 mr-0.5">٪</span>
                                </div>
                              ) : (
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300">
                                  {toFaDigits(u.mandatedPercentage)}٪
                                </span>
                              )}
                            </td>

                            {/* Soldier Count */}
                            <td className="p-2.5 text-center font-bold">
                              <span className={isShortage ? "text-orange-700 font-extrabold" : "text-emerald-700"}>
                                {toFaDigits(u.soldierCount)} نفر
                              </span>
                            </td>

                            {/* Progress bar */}
                            <td className="p-2.5">
                              <div className="w-full">
                                <div className="flex justify-between items-center text-[10.5px] mb-1 font-bold">
                                  <span className={isShortage ? "text-orange-800" : "text-emerald-800"}>
                                    {toFaDigits(u.fillPercentage)}٪
                                  </span>
                                  <span className="text-slate-400 font-normal">
                                    هدف: {toFaDigits(u.mandatedPercentage)}٪
                                  </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden relative">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      isShortage ? "bg-orange-500" : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(100, u.fillPercentage)}%` }}
                                  />
                                  {/* Marker for mandated percentage */}
                                  <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-slate-700 z-10"
                                    style={{ right: `${u.mandatedPercentage}%` }}
                                    title={`ظرفیت ابلاغی: ${u.mandatedPercentage}٪`}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Status Badge */}
                            <td className="p-2.5 text-center">
                              {isShortage ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-orange-500 text-white shadow-sm border border-orange-600 animate-pulse"
                                  title={`کمبود ${u.shortageCount || 1} سرباز جهت رسیدن به حد نصاب ابلاغی`}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>کمبود سرباز ({toFaDigits(u.shortageCount || 1)})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <Check className="w-3 h-3" />
                                  <span>مناسب</span>
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="p-2.5 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleSaveEdit(u)}
                                    disabled={updating}
                                    className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition"
                                    title="ذخیره"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-1 text-slate-500 hover:bg-slate-200 rounded transition"
                                    title="انصراف"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => startEdit(u)}
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                                    title="ویرایش ظرفیت و سهمیه ابلاغی"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUnit(u.id, u.name)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                    title="حذف رده"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            رده‌های دارای کمبود با <span className="font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-300">رنگ نارنجی</span> مشخص شده‌اند.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
