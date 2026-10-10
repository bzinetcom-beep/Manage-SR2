"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Eye,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserPlus,
  Check,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { toFaDigits } from "@/lib/jalali";

interface SoldierRow {
  id: number;
  rowNumber: number | null;
  personnelCode: string | null;
  nationalCode: string | null;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  serviceUnit: string | null;
  city: string | null;
  dispatchDate: string | null;
  maritalStatus: string | null;
  educationLevel: string | null;
  phoneNumber: string | null;
  physicalStatus?: string | null;
}

interface QuickAddState {
  firstName: string;
  lastName: string;
  nationalCode: string;
  serviceUnit: string;
  phoneNumber: string;
}

interface FullFormState {
  firstName: string;
  lastName: string;
  fatherName: string;
  nationalCode: string;
  personnelCode: string;
  serviceUnit: string;
  city: string;
  maritalStatus: string;
  educationLevel: string;
  dispatchDate: string;
  phoneNumber: string;
}

const EMPTY_QUICK: QuickAddState = {
  firstName: "",
  lastName: "",
  nationalCode: "",
  serviceUnit: "",
  phoneNumber: "",
};

const EMPTY_FULL: FullFormState = {
  firstName: "",
  lastName: "",
  fatherName: "",
  nationalCode: "",
  personnelCode: "",
  serviceUnit: "",
  city: "",
  maritalStatus: "",
  educationLevel: "",
  dispatchDate: "",
  phoneNumber: "",
};

export default function SoldierCrudPanel() {
  const [rows, setRows] = useState<SoldierRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [canWrite, setCanWrite] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Quick Inline Add state
  const [quickForm, setQuickForm] = useState<QuickAddState>(EMPTY_QUICK);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickErr, setQuickErr] = useState<string | null>(null);
  const quickFirstInputRef = useRef<HTMLInputElement>(null);

  // Full Modal Form (for Edit or Detailed Add)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<SoldierRow | null>(null);
  const [fullForm, setFullForm] = useState<FullFormState>(EMPTY_FULL);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Inline Delete confirmation state: soldier id waiting for confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Bulk Delete modal
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Load all / bulk rows in a single scrollable view
  const load = useCallback(async (searchQuery: string, limit = 500) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      } else {
        params.set("showAll", "true");
        params.set("page", "1");
        params.set("limit", String(limit));
      }
      const res = await fetch(`/api/soldiers?${params}`);
      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { data: [] };
      }
      const validRows: SoldierRow[] = Array.isArray(data?.data)
        ? data.data.filter((r: any) => r && r.id != null)
        : [];
      setRows(validRows);
      setTotal(typeof data?.total === "number" ? data.total : validRows.length);
      setSelected(new Set());
      setConfirmDeleteId(null);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const role = d?.user?.role;
        if (role === "viewer") setCanWrite(false);
      })
      .catch(() => {});
    load("", 500);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function onSearch(v: string) {
    setQ(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      load(v, 500);
    }, 300);
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.filter((r) => r && r.id != null).map((r) => r.id)));
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // ---------------- Quick Inline Add ----------------
  async function submitQuickAdd(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!quickForm.firstName.trim() || !quickForm.lastName.trim()) {
      setQuickErr("نام و نام خانوادگی الزامی است");
      return;
    }
    setQuickSaving(true);
    setQuickErr(null);
    try {
      const payload: Record<string, string> = {
        firstName: quickForm.firstName.trim(),
        lastName: quickForm.lastName.trim(),
      };
      if (quickForm.nationalCode.trim()) payload.nationalCode = quickForm.nationalCode.trim();
      if (quickForm.serviceUnit.trim()) payload.serviceUnit = quickForm.serviceUnit.trim();
      if (quickForm.phoneNumber.trim()) payload.phoneNumber = quickForm.phoneNumber.trim();

      const res = await fetch("/api/soldiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ثبت سرباز");

      setToast(`سرباز «${quickForm.firstName} ${quickForm.lastName}» با موفقیت اضافه شد`);
      setQuickForm(EMPTY_QUICK);
      quickFirstInputRef.current?.focus();
      // Reload list to show newly added soldier
      await load(q, Math.max(500, rows.length + 10));
    } catch (err) {
      setQuickErr((err as Error).message);
    } finally {
      setQuickSaving(false);
    }
  }

  // ---------------- Detailed Modal Form ----------------
  function openDetailedCreate() {
    setEditingSoldier(null);
    setFullForm({
      ...EMPTY_FULL,
      firstName: quickForm.firstName,
      lastName: quickForm.lastName,
      nationalCode: quickForm.nationalCode,
      serviceUnit: quickForm.serviceUnit,
      phoneNumber: quickForm.phoneNumber,
    });
    setModalErr(null);
    setModalOpen(true);
  }

  function openEdit(s: SoldierRow) {
    setEditingSoldier(s);
    setFullForm({
      firstName: s.firstName || "",
      lastName: s.lastName || "",
      fatherName: s.fatherName || "",
      nationalCode: s.nationalCode || "",
      personnelCode: s.personnelCode || "",
      serviceUnit: s.serviceUnit || "",
      city: s.city || "",
      maritalStatus: s.maritalStatus || "",
      educationLevel: s.educationLevel || "",
      dispatchDate: s.dispatchDate || "",
      phoneNumber: s.phoneNumber || "",
    });
    setModalErr(null);
    setModalOpen(true);
  }

  async function saveModalForm() {
    if (!fullForm.firstName.trim() || !fullForm.lastName.trim()) {
      setModalErr("نام و نام خانوادگی الزامی است");
      return;
    }
    setModalSaving(true);
    setModalErr(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fullForm)) {
        if (typeof v === "string" && v.trim()) payload[k] = v.trim();
      }
      const res = editingSoldier
        ? await fetch(`/api/soldiers/${editingSoldier.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/soldiers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || `خطا در ذخیره اطلاعات (کد ${res.status})`);

      setToast(
        editingSoldier
          ? `«${fullForm.firstName} ${fullForm.lastName}» ویرایش شد`
          : `«${fullForm.firstName} ${fullForm.lastName}» ثبت شد`,
      );
      setModalOpen(false);
      load(q, Math.max(500, rows.length));
    } catch (err) {
      setModalErr((err as Error).message);
    } finally {
      setModalSaving(false);
    }
  }

  // ---------------- Fast 1-Click Delete ----------------
  async function executeDelete(id: number, name: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/soldiers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "حذف ناموفق بود");
      }
      // Instant optimistic UI update
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setToast(`سرباز «${name}» حذف شد`);
      setConfirmDeleteId(null);
    } catch (err) {
      setToast(`خطا: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  // ---------------- Bulk Delete ----------------
  async function executeBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/soldiers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, hard: true }),
      });
      if (!res.ok) throw new Error("حذف گروهی ناموفق بود");

      const deletedCount = ids.length;
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setTotal((t) => Math.max(0, t - deletedCount));
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      setToast(`${toFaDigits(deletedCount)} سرباز حذف شدند`);
    } catch (err) {
      setToast(`خطا: ${(err as Error).message}`);
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4">
      {/* ── Top Header & Stats ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-lg">
              <UserPlus className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              ۴. مدیریت مستقیم رکوردها (CRUD سریع و اسکرول یکپارچه)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            سربازان در یک صفحه با اسکرول سریع نمایش داده می‌شوند. با فرم زیر می‌توانید فوراً سرباز جدید ثبت کنید یا رکوردهای نامطلوب را حذف کنید.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            کل رکوردها: {toFaDigits(total)} | در حال نمایش: {toFaDigits(rows.length)}
          </span>

          <button
            onClick={() => load(q, 500)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg px-3 py-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> بروزرسانی لیست
          </button>

          {canWrite && selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg px-3 py-2 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> حذف گروهی ({toFaDigits(selected.size)})
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Add Bar (افزودن سریع و آسان بدون دردسر) ── */}
      {canWrite && (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <span>⚡</span> افزودن سریع سرباز جدید (تکمیل اینتر و ثبت درجا):
            </span>
            <button
              type="button"
              onClick={openDetailedCreate}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
            >
              + ثبت تفصیلی با تمامی فیلدها (مودال)
            </button>
          </div>

          <form onSubmit={submitQuickAdd} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div>
              <input
                ref={quickFirstInputRef}
                value={quickForm.firstName}
                onChange={(e) => setQuickForm({ ...quickForm, firstName: e.target.value })}
                placeholder="نام *"
                className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <input
                value={quickForm.lastName}
                onChange={(e) => setQuickForm({ ...quickForm, lastName: e.target.value })}
                placeholder="نام خانوادگی *"
                className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <input
                value={quickForm.nationalCode}
                onChange={(e) => setQuickForm({ ...quickForm, nationalCode: e.target.value })}
                placeholder="کد ملی"
                dir="ltr"
                className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <input
                value={quickForm.serviceUnit}
                onChange={(e) => setQuickForm({ ...quickForm, serviceUnit: e.target.value })}
                placeholder="یگان خدمتی"
                className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <input
                value={quickForm.phoneNumber}
                onChange={(e) => setQuickForm({ ...quickForm, phoneNumber: e.target.value })}
                placeholder="شماره تماس"
                dir="ltr"
                className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={quickSaving}
                className="w-full inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                {quickSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                ثبت سریع
              </button>
            </div>
          </form>

          {quickErr && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {quickErr}
            </p>
          )}
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="جستجوی سریع: نام، کد ملی، یگان، شهر، شماره پرسنلی..."
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg pr-9 pl-8 py-2 text-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
          />
          {q && (
            <button
              onClick={() => onSearch("")}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400">
          💡 برای مرور سربازان از اسکرول عمودی جدول زیر استفاده کنید.
        </div>
      </div>

      {/* ── Single Scrollable Table (اسکرول یکپارچه تمام سربازان با هدر چسبان) ── */}
      <div
        ref={tableContainerRef}
        className="max-h-[580px] overflow-y-auto overflow-x-auto scrollbar-thin border border-slate-200 dark:border-slate-700 rounded-xl relative bg-white dark:bg-slate-900"
      >
        <table className="w-full text-xs min-w-[780px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm border-b border-slate-200 dark:border-slate-700">
            <tr>
              {canWrite && (
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                  />
                </th>
              )}
              <th className="p-2.5 text-right w-14">ردیف</th>
              <th className="p-2.5 text-right">نام و نام خانوادگی</th>
              <th className="p-2.5 text-right">کد ملی</th>
              <th className="p-2.5 text-right">کد پرسنلی</th>
              <th className="p-2.5 text-right">یگان خدمتی</th>
              <th className="p-2.5 text-right">شماره تماس</th>
              <th className="p-2.5 text-right">شهر</th>
              <th className="p-2.5 text-right">تاریخ اعزام</th>
              <th className="p-2.5 text-center w-36">عملیات CRUD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.filter((s) => s && s.id != null).map((s, index) => {
              const isSelected = selected.has(s.id);
              const isConfirming = confirmDeleteId === s.id;
              const isDeleting = deletingId === s.id;

              return (
                <tr
                  key={s.id}
                  className={`hover:bg-emerald-50/50 dark:hover:bg-slate-800/80 transition-colors ${
                    isSelected ? "bg-emerald-50/80 dark:bg-emerald-950/40" : ""
                  }`}
                >
                  {canWrite && (
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(s.id)}
                        className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="p-2.5 text-slate-400 font-mono text-[11px]">
                    {toFaDigits(s.rowNumber ?? index + 1)}
                  </td>
                  <td className="p-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {s.nationalCode ? toFaDigits(s.nationalCode) : "—"}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {s.personnelCode ? toFaDigits(s.personnelCode) : "—"}
                  </td>
                  <td className="p-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {s.serviceUnit || "—"}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap" dir="ltr">
                    {s.phoneNumber || "—"}
                  </td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {s.city || "—"}
                  </td>
                  <td className="p-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {s.dispatchDate ? toFaDigits(s.dispatchDate) : "—"}
                  </td>
                  <td className="p-2.5 text-center whitespace-nowrap">
                    {isConfirming ? (
                      /* ── Inline Quick Delete Confirmation ── */
                      <div className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-2 py-0.5 rounded-lg animate-[fadeIn_.15s_ease]">
                        <span className="text-[10px] text-rose-700 dark:text-rose-300 font-bold">حذف شود؟</span>
                        <button
                          onClick={() => executeDelete(s.id, `${s.firstName} ${s.lastName}`)}
                          disabled={isDeleting}
                          className="bg-rose-600 hover:bg-rose-700 text-white rounded p-1 text-[10px] font-bold"
                          title="تأیید حذف قطعی"
                        >
                          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded p-1 text-[10px]"
                          title="انصراف"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      /* ── Standard Action Buttons ── */
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/soldiers/${s.id}`}
                          title="مشاهده پرونده کامل"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-700 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => openEdit(s)}
                              title="ویرایش سریع"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              title="حذف فوری سرباز"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 10 : 9} className="p-10 text-center text-slate-400 dark:text-slate-500">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      در حال بارگذاری لیست سربازان...
                    </div>
                  ) : (
                    "هیچ سربازی یافت نشد. با فرم بالا اولین سرباز را ثبت کنید."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer status bar ── */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 flex-wrap gap-2">
        <div>
          نمایش {toFaDigits(rows.length)} رکورد به صورت اسکرول یکپارچه (تعداد کل در سیستم: {toFaDigits(total)})
        </div>
        <div className="flex gap-2">
          {rows.length < total && (
            <button
              onClick={() => load(q, rows.length + 500)}
              disabled={loading}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
            >
              + بارگذاری {toFaDigits(Math.min(500, total - rows.length))} رکورد بعدی در همین صفحه
            </button>
          )}
        </div>
      </div>

      {/* ── Detailed Modal Form (ویرایش یا ثبت با تمامی فیلدها) ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
            onClick={() => !modalSaving && setModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto scrollbar-thin animate-[fadeIn_.2s_ease]">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">
              {editingSoldier ? `✏️ ویرایش: ${editingSoldier.firstName} ${editingSoldier.lastName}` : "➕ ثبت تفصیلی سرباز"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">نام *</label>
                <input
                  value={fullForm.firstName}
                  onChange={(e) => setFullForm({ ...fullForm, firstName: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">نام خانوادگی *</label>
                <input
                  value={fullForm.lastName}
                  onChange={(e) => setFullForm({ ...fullForm, lastName: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">نام پدر</label>
                <input
                  value={fullForm.fatherName}
                  onChange={(e) => setFullForm({ ...fullForm, fatherName: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">کد ملی</label>
                <input
                  value={fullForm.nationalCode}
                  onChange={(e) => setFullForm({ ...fullForm, nationalCode: e.target.value })}
                  dir="ltr"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">کد پرسنلی</label>
                <input
                  value={fullForm.personnelCode}
                  onChange={(e) => setFullForm({ ...fullForm, personnelCode: e.target.value })}
                  dir="ltr"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">یگان خدمتی</label>
                <input
                  value={fullForm.serviceUnit}
                  onChange={(e) => setFullForm({ ...fullForm, serviceUnit: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">شهر محل سکونت</label>
                <input
                  value={fullForm.city}
                  onChange={(e) => setFullForm({ ...fullForm, city: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">شماره تماس</label>
                <input
                  value={fullForm.phoneNumber}
                  onChange={(e) => setFullForm({ ...fullForm, phoneNumber: e.target.value })}
                  dir="ltr"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">تاریخ اعزام (شمسی)</label>
                <input
                  value={fullForm.dispatchDate}
                  onChange={(e) => setFullForm({ ...fullForm, dispatchDate: e.target.value })}
                  placeholder="مثال: 1403/02/01"
                  dir="ltr"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">وضعیت تأهل</label>
                <select
                  value={fullForm.maritalStatus}
                  onChange={(e) => setFullForm({ ...fullForm, maritalStatus: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                >
                  <option value="">—</option>
                  <option value="مجرد">مجرد</option>
                  <option value="متاهل">متاهل</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-slate-500 dark:text-slate-400 block mb-1">سطح تحصیلات</label>
                <select
                  value={fullForm.educationLevel}
                  onChange={(e) => setFullForm({ ...fullForm, educationLevel: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 bg-white dark:bg-slate-900"
                >
                  <option value="">—</option>
                  {["زیر دیپلم", "دیپلم", "فوق دیپلم", "کارشناسی", "کارشناسی ارشد", "دکتری"].map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {modalErr && (
              <div className="mt-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg p-2.5 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 shrink-0" /> {modalErr}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-5 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={modalSaving}
                className="text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-4 py-2 transition"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={saveModalForm}
                disabled={modalSaving}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg px-5 py-2 transition shadow-sm disabled:opacity-50"
              >
                {modalSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingSoldier ? "ذخیره تغییرات" : "ثبت نهایی"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Modal ── */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
            onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}
          />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-5 animate-[fadeIn_.2s_ease]">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <span className="p-2 bg-rose-100 dark:bg-rose-950 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </span>
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  حذف {toFaDigits(selected.size)} سرباز انتخاب‌شده
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  آیا از حذف دسته‌جمعی این موارد اطمینان دارید؟
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-4 py-2 transition"
              >
                انصراف
              </button>
              <button
                onClick={executeBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg px-4 py-2 transition disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                بله، همه را حذف کن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium rounded-xl shadow-2xl px-4 py-3 max-w-sm animate-[fadeIn_.2s_ease] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
