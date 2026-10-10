"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Settings,
  RefreshCw,
} from "lucide-react";
import { toFaDigits, toEnDigits, isoToJalali, jalaliToIso } from "@/lib/jalali";
import JalaliDatePicker from "@/components/JalaliDatePicker";

export interface SoldierLeaveItem {
  id: string;
  type: "مرخصی استحقاقی" | "مرخصی استعلاجی" | "مرخصی تشویقی" | "مرخصی بین‌راهی" | "مرخصی بدون حقوق";
  status: "استفاده شده" | "استفاده نشده";
  days: number;
  startDate: string | null;
  endDate: string | null;
  docNumber: string | null;
  approver: string | null;
  description: string | null;
  createdAt: string;
}

export interface LeaveSummary {
  eligibleQuota: number;
  eligibleUsed: number;
  eligibleUnusedRegistered: number;
  eligibleRemaining: number;
  medicalQuota: number;
  medicalUsed: number;
  medicalUnusedRegistered: number;
  medicalRemaining: number;
  incentiveUsed: number;
  incentiveUnusedRegistered: number;
  otherUsed: number;
  otherUnusedRegistered: number;
  totalUsedDays: number;
  totalLeavesCount: number;
}

const LEAVE_TYPES: Array<SoldierLeaveItem["type"]> = [
  "مرخصی استحقاقی",
  "مرخصی استعلاجی",
  "مرخصی تشویقی",
  "مرخصی بین‌راهی",
  "مرخصی بدون حقوق",
];

export default function SoldierLeavesSection({
  soldierId,
  canWrite,
  maritalStatus,
  onLeavesUpdated,
}: {
  soldierId: string | number;
  canWrite: boolean;
  maritalStatus?: string | null;
  onLeavesUpdated?: () => void;
}) {
  const [leaves, setLeaves] = useState<SoldierLeaveItem[]>([]);
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"all" | "used" | "unused">("all");

  // Leave Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState<SoldierLeaveItem | null>(null);

  // Form Fields
  const [type, setType] = useState<SoldierLeaveItem["type"]>("مرخصی استحقاقی");
  const [status, setStatus] = useState<SoldierLeaveItem["status"]>("استفاده شده");
  const [days, setDays] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [approver, setApprover] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Quota Modal State
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [eligibleQuotaInput, setEligibleQuotaInput] = useState("30");
  const [medicalQuotaInput, setMedicalQuotaInput] = useState("30");
  const [savingQuota, setSavingQuota] = useState(false);

  async function loadLeaves() {
    setLoading(true);
    try {
      const res = await fetch(`/api/soldiers/${soldierId}/leaves`);
      const data = await res.json();
      if (res.ok) {
        setLeaves(data.data || []);
        setSummary(data.summary || null);
        if (data.quotas) {
          if (data.quotas.eligibleQuota) setEligibleQuotaInput(String(data.quotas.eligibleQuota));
          if (data.quotas.medicalQuota) setMedicalQuotaInput(String(data.quotas.medicalQuota));
        } else {
          setEligibleQuotaInput(maritalStatus === "متاهل" ? "36" : "30");
          setMedicalQuotaInput("30");
        }
      }
    } catch (e) {
      console.error("Error loading leaves:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaves();
  }, [soldierId]);

  function openCreateModal() {
    setEditingLeave(null);
    setType("مرخصی استحقاقی");
    setStatus("استفاده شده");
    setDays("1");
    setStartDate("");
    setEndDate("");
    setDocNumber("");
    setApprover("");
    setDescription("");
    setMsg(null);
    setShowModal(true);
  }

  function openEditModal(item: SoldierLeaveItem) {
    setEditingLeave(item);
    setType(item.type);
    setStatus(item.status);
    setDays(String(item.days));
    setStartDate(item.startDate ? isoToJalali(item.startDate, false) : "");
    setEndDate(item.endDate ? isoToJalali(item.endDate, false) : "");
    setDocNumber(item.docNumber || "");
    setApprover(item.approver || "");
    setDescription(item.description || "");
    setMsg(null);
    setShowModal(true);
  }

  async function handleSaveLeave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const parsedDays = Number(toEnDigits(days)) || 1;
    const startIso = startDate ? jalaliToIso(startDate) : null;
    const endIso = endDate ? jalaliToIso(endDate) : null;

    try {
      if (editingLeave) {
        // Edit existing
        const res = await fetch(`/api/soldiers/${soldierId}/leaves`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leaveId: editingLeave.id,
            type,
            status,
            days: parsedDays,
            startDate: startIso,
            endDate: endIso,
            docNumber: docNumber.trim() || null,
            approver: approver.trim() || null,
            description: description.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "خطا در ویرایش مرخصی");
        setLeaves(data.data || []);
        setSummary(data.summary || null);
        setMsg({ type: "success", text: "مرخصی با موفقیت ویرایش گردید." });
      } else {
        // Create new
        const res = await fetch(`/api/soldiers/${soldierId}/leaves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            status,
            days: parsedDays,
            startDate: startIso,
            endDate: endIso,
            docNumber: docNumber.trim() || null,
            approver: approver.trim() || null,
            description: description.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "خطا در ثبت مرخصی");
        setLeaves(data.leaves || []);
        setSummary(data.summary || null);
        setMsg({ type: "success", text: "مرخصی با موفقیت ثبت شد." });
      }

      setTimeout(() => {
        setShowModal(false);
        if (onLeavesUpdated) onLeavesUpdated();
      }, 700);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "خطا در عملیات" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLeave(leaveId: string) {
    if (!confirm("آیا از حذف این سابقه مرخصی اطمینان دارید؟")) return;

    try {
      const res = await fetch(`/api/soldiers/${soldierId}/leaves?leaveId=${encodeURIComponent(leaveId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در حذف مرخصی");
      setLeaves(data.leaves || []);
      setSummary(data.summary || null);
      if (onLeavesUpdated) onLeavesUpdated();
    } catch (err: any) {
      alert(err.message || "خطا در حذف مرخصی");
    }
  }

  async function handleSaveQuotas(e: React.FormEvent) {
    e.preventDefault();
    setSavingQuota(true);

    try {
      const res = await fetch(`/api/soldiers/${soldierId}/leaves`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateQuotas: true,
          eligibleQuota: Number(toEnDigits(eligibleQuotaInput)) || 30,
          medicalQuota: Number(toEnDigits(medicalQuotaInput)) || 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره سهمیه‌ها");
      setLeaves(data.data || []);
      setSummary(data.summary || null);
      setShowQuotaModal(false);
      if (onLeavesUpdated) onLeavesUpdated();
    } catch (err: any) {
      alert(err.message || "خطا در ذخیره سهمیه‌ها");
    } finally {
      setSavingQuota(false);
    }
  }

  const filteredLeaves = leaves.filter((l) => {
    if (filterTab === "used") return l.status === "استفاده شده";
    if (filterTab === "unused") return l.status === "استفاده نشده";
    return true;
  });

  const usedCount = leaves.filter((l) => l.status === "استفاده شده").length;
  const unusedCount = leaves.filter((l) => l.status === "استفاده نشده").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center text-xl shadow-xs">
            🌴
          </div>
          <div>
            <h2 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
              <span>مرخصی</span>
              <span className="text-[11px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                انواع مرخصی‌های استفاده شده و نشده
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ثبت و پایش مرخصی‌های استحقاقی، استعلاجی، تشویقی و... با انعکاس مستقیم در گزارش کار
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <>
              <button
                onClick={() => setShowQuotaModal(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-2 flex items-center gap-1.5 transition"
                title="تنظیم سقف سهمیه‌ها"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>تنظیم سهمیه مرخصی</span>
              </button>
              <button
                onClick={openCreateModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg px-4 py-2 flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت مرخصی جدید</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* استحقاقی */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-blue-900 text-xs font-bold mb-1">
              <span>🌴 مرخصی استحقاقی</span>
              <span className="text-[10px] text-blue-600 font-normal">
                سهمیه: {toFaDigits(summary.eligibleQuota)} روز
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2 font-mono">
              <div>
                <span className="text-xl font-extrabold text-blue-800">
                  {toFaDigits(summary.eligibleUsed)}
                </span>
                <span className="text-[10px] text-slate-500 font-sans mr-1">روز رفته</span>
              </div>
              <div className="text-left font-sans">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                  مانده: {toFaDigits(summary.eligibleRemaining)} روز
                </span>
              </div>
            </div>
          </div>

          {/* استعلاجی */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-amber-900 text-xs font-bold mb-1">
              <span>🏥 مرخصی استعلاجی</span>
              <span className="text-[10px] text-amber-700 font-normal">
                سقف: {toFaDigits(summary.medicalQuota)} روز
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2 font-mono">
              <div>
                <span className="text-xl font-extrabold text-amber-800">
                  {toFaDigits(summary.medicalUsed)}
                </span>
                <span className="text-[10px] text-slate-500 font-sans mr-1">روز استفاده</span>
              </div>
              <div className="text-left font-sans">
                <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                  مجاز: {toFaDigits(summary.medicalRemaining)} روز
                </span>
              </div>
            </div>
          </div>

          {/* تشویقی */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-emerald-900 text-xs font-bold mb-1">
              <span>🎖️ مرخصی تشویقی</span>
              <span className="text-[10px] text-emerald-700 font-normal">حسن خدمت</span>
            </div>
            <div className="flex items-baseline justify-between mt-2 font-mono">
              <div>
                <span className="text-xl font-extrabold text-emerald-800">
                  {toFaDigits(summary.incentiveUsed)}
                </span>
                <span className="text-[10px] text-slate-500 font-sans mr-1">روز اعطا شده</span>
              </div>
              <div className="text-left font-sans text-[10px] text-slate-500">
                بدون کسر از استحقاقی
              </div>
            </div>
          </div>

          {/* مجموع استفاده شده */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-slate-700 text-xs font-bold mb-1">
              <span>📊 کل مرخصی استفاده‌شده</span>
              <span className="text-[10px] text-slate-500 font-mono font-bold">
                {toFaDigits(summary.totalLeavesCount)} نوبت
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2 font-mono">
              <div>
                <span className="text-xl font-extrabold text-slate-900">
                  {toFaDigits(summary.totalUsedDays)}
                </span>
                <span className="text-[10px] text-slate-500 font-sans mr-1">روز کل</span>
              </div>
              <div className="text-left font-sans text-[10px] text-slate-500">
                ثبت در پرونده
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              filterTab === "all"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            همه سوابق ({toFaDigits(leaves.length)})
          </button>
          <button
            onClick={() => setFilterTab("used")}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
              filterTab === "used"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>استفاده شده ({toFaDigits(usedCount)})</span>
          </button>
          <button
            onClick={() => setFilterTab("unused")}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${
              filterTab === "unused"
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>استفاده نشده / سهمیه ({toFaDigits(unusedCount)})</span>
          </button>
        </div>
      </div>

      {/* Leaves Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
            <span>در حال بارگذاری سوابق مرخصی...</span>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
            هنوز سابقه‌ای در این بخش ثبت نشده است. برای ثبت مرخصی روی دکمه «➕ ثبت مرخصی جدید» کلیک کنید.
          </div>
        ) : (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
              <tr>
                <th className="p-2.5 text-center w-8">ردیف</th>
                <th className="p-2.5">نوع مرخصی</th>
                <th className="p-2.5 text-center">وضعیت</th>
                <th className="p-2.5 text-center">مدت</th>
                <th className="p-2.5 text-center">از تاریخ</th>
                <th className="p-2.5 text-center">تا تاریخ</th>
                <th className="p-2.5 text-center">شماره برگه/مجوز</th>
                <th className="p-2.5 text-center">مرجع تاییدکننده</th>
                <th className="p-2.5">شرح / علت</th>
                {canWrite && <th className="p-2.5 text-center w-20">عملیات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeaves.map((l, idx) => {
                const isUsed = l.status === "استفاده شده";
                const typeBadgeColors: Record<string, string> = {
                  "مرخصی استحقاقی": "bg-blue-100 text-blue-900 border-blue-200",
                  "مرخصی استعلاجی": "bg-amber-100 text-amber-900 border-amber-200",
                  "مرخصی تشویقی": "bg-emerald-100 text-emerald-900 border-emerald-200",
                  "مرخصی بین‌راهی": "bg-teal-100 text-teal-900 border-teal-200",
                  "مرخصی بدون حقوق": "bg-slate-100 text-slate-800 border-slate-200",
                };

                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 text-center font-mono text-slate-400">
                      {toFaDigits(idx + 1)}
                    </td>
                    <td className="p-2.5 font-bold">
                      <span className={`px-2 py-0.5 rounded-full border text-[10.5px] ${
                        typeBadgeColors[l.type] || "bg-slate-100 text-slate-800"
                      }`}>
                        {l.type}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isUsed
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-blue-50 text-blue-800 border-blue-300"
                      }`}>
                        {isUsed ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        <span>{l.status}</span>
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-extrabold font-mono text-slate-900">
                      {toFaDigits(l.days)} روز
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-700">
                      {l.startDate ? toFaDigits(isoToJalali(l.startDate)) : "—"}
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-700">
                      {l.endDate ? toFaDigits(isoToJalali(l.endDate)) : "—"}
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-600">
                      {l.docNumber ? toFaDigits(l.docNumber) : "—"}
                    </td>
                    <td className="p-2.5 text-center text-slate-600">
                      {l.approver || "—"}
                    </td>
                    <td className="p-2.5 text-slate-600 max-w-xs truncate" title={l.description || ""}>
                      {l.description || "—"}
                    </td>
                    {canWrite && (
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditModal(l)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                            title="ویرایش"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLeave(l.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Create or Edit Leave */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto dir-rtl"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-l from-teal-600 to-emerald-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🌴</span>
                <div>
                  <h3 className="text-base font-bold">
                    {editingLeave ? "ویرایش سابقه مرخصی" : "ثبت مرخصی سرباز"}
                  </h3>
                  <p className="text-[11px] text-teal-100">
                    ثبت مرخصی‌های استفاده‌شده و استفاده‌نشده با ثبت خودکار در گزارش کار
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="p-5 space-y-3.5 text-xs">
              {msg && (
                <div
                  className={`p-2.5 rounded-lg flex items-center gap-2 font-medium ${
                    msg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {msg.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span>{msg.text}</span>
                </div>
              )}

              {/* نوع مرخصی */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  نوع مرخصی <span className="text-red-500">*</span>
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SoldierLeaveItem["type"])}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  required
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* وضعیت مرخصی: استفاده شده یا استفاده نشده */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  وضعیت مرخصی <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer font-bold transition ${
                      status === "استفاده شده"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="استفاده شده"
                      checked={status === "استفاده شده"}
                      onChange={() => setStatus("استفاده شده")}
                    />
                    <span>✅ استفاده شده (رفتـه)</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer font-bold transition ${
                      status === "استفاده نشده"
                        ? "bg-blue-50 border-blue-500 text-blue-800"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="استفاده نشده"
                      checked={status === "استفاده نشده"}
                      onChange={() => setStatus("استفاده نشده")}
                    />
                    <span>⏳ استفاده نشده (طلب/سهمیه)</span>
                  </label>
                </div>
              </div>

              {/* تعداد روز */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  تعداد روز مرخصی <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm pl-8"
                    required
                  />
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">
                    روز
                  </span>
                </div>
              </div>

              {/* تاریخ شروع و پایان */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">از تاریخ (شروع)</label>
                  <JalaliDatePicker
                    value={startDate}
                    onChange={(v) => setStartDate(v)}
                    placeholder="۱۴۰۴/۰۱/۱۵"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">تا تاریخ (پایان)</label>
                  <JalaliDatePicker
                    value={endDate}
                    onChange={(v) => setEndDate(v)}
                    placeholder="۱۴۰۴/۰۱/۱۸"
                  />
                </div>
              </div>

              {/* شماره برگه مرخصی و مرجع تاییدکننده */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">شماره برگه / مجوز</label>
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="مثال: م-۱۰۴۵"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">مرجع تاییدکننده</label>
                  <input
                    type="text"
                    value={approver}
                    onChange={(e) => setApprover(e.target.value)}
                    placeholder="مثال: بهداری / فرماندهی"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* توضیحات */}
              <div>
                <label className="block text-slate-700 font-medium mb-1">توضیحات و علت</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="علت مرخصی، بستری، امور شخصی و..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* دکمه‌های فرم */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition flex items-center gap-1.5 shadow"
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{editingLeave ? "ذخیره تغییرات" : "ثبت سابقه مرخصی"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quota Settings */}
      {showQuotaModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto dir-rtl"
          onClick={() => setShowQuotaModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold">تنظیم سقف سهمیه‌های مرخصی</h3>
              </div>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuotas} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  سهمیه مرخصی استحقاقی قانونی (روز)
                </label>
                <input
                  type="number"
                  min="0"
                  value={eligibleQuotaInput}
                  onChange={(e) => setEligibleQuotaInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                  required
                />
                <span className="text-[10.5px] text-slate-500 mt-1 block">
                  پیش‌فرض: ۳۰ روز مجرد / ۳۶ روز متاهل
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  سقف مرخصی استعلاجی مجاز (روز)
                </label>
                <input
                  type="number"
                  min="0"
                  value={medicalQuotaInput}
                  onChange={(e) => setMedicalQuotaInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                  required
                />
                <span className="text-[10.5px] text-slate-500 mt-1 block">
                  سقف معمول با تاییدیه پزشکی: ۳۰ روز
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowQuotaModal(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingQuota}
                  className="px-5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition"
                >
                  {savingQuota ? "در حال ذخیره..." : "ذخیره سهمیه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
