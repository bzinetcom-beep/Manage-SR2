"use client";

import { useState, useEffect } from "react";
import { Download, Upload, Plus, Trash2, X, RefreshCw, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

interface ServiceUnitItem {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  soldierCount: number;
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

  // Form state for adding new unit manually
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        body: JSON.stringify({ name: newName.trim(), code: newCode.trim(), description: newDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ثبت رده");

      setNewName("");
      setNewCode("");
      setNewDesc("");
      setMessage({ type: "success", text: `رده خدمتی «${data.data.name}» با موفقیت اضافه شد.` });
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در افزودن رده" });
    } finally {
      setSaving(false);
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
        text: `فایل اکسل با موفقیت پردازش شد: ${data.created} رده خدمتی ثبت/به‌روزرسانی گردید.`,
      });
      loadUnits();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "خطا در بارگذاری اکسل" });
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset file input
    }
  }

  const filteredUnits = units.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.code && u.code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto dir-rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">مدیریت و ایمپورت/اکسپورت رده‌های خدمتی</h3>
              <p className="text-xs text-emerald-100 mt-0.5">افزودن، ویرایش و ورود/خروج رده‌های خدمتی از فایل Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Action Toolbar: Excel Import / Export */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
            <div>
              <div className="text-xs font-bold text-emerald-800 mb-2">📤 خروجی و الگو:</div>
              <div className="flex gap-2">
                <a
                  href="/api/service-units/export"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود لیست اکسل</span>
                </a>
                <a
                  href="/api/service-units/import"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود الگوی خالی</span>
                </a>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-emerald-800 mb-2">📥 ورودی (آپلود فایل اکسل):</div>
              <label className={`inline-flex items-center justify-center gap-2 px-4 py-2 w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                <Upload className="w-4 h-4" />
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
              message.type === "success" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300"
            }`}>
              {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Form for manual creation */}
          <form onSubmit={handleAddUnit} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-2">➕ افزودن دستی رده جدید</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="نام رده خدمتی (الزامی)"
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="کد رده (اختیاری)"
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="توضیحات (اختیاری)"
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ثبت رده</span>
              </button>
            </div>
          </form>

          {/* Unit List Table */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold text-slate-700">
                لیست رده‌های خدمتی ثبت‌شده ({units.length})
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در رده‌ها..."
                className="border border-slate-300 rounded-lg px-3 py-1 text-xs w-48 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال دریافت...</span>
                </div>
              ) : filteredUnits.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">رده خدمتی یافت نشد.</div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="p-2.5">نام رده خدمتی</th>
                      <th className="p-2.5">کد رده</th>
                      <th className="p-2.5 text-center">سربازان فعال</th>
                      <th className="p-2.5 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUnits.map((u) => (
                      <tr key={u.id + u.name} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-bold text-slate-800">{u.name}</td>
                        <td className="p-2.5 text-slate-500">{u.code || "—"}</td>
                        <td className="p-2.5 text-center font-bold text-emerald-600">
                          {u.soldierCount} نفر
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleDeleteUnit(u.id, u.name)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
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
