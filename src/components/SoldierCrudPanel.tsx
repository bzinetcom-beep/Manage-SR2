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
  Archive,
  ChevronRight,
  ChevronLeft,
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
interface FormState {
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
const EMPTY: FormState = {
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [canWrite, setCanWrite] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SoldierRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ ids: number[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (searchQ: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQ.trim()) {
        params.set("q", searchQ.trim());
      } else {
        params.set("showAll", "true");
        params.set("page", String(pg));
      }
      const res = await fetch(`/api/soldiers?${params}`);
      const data = await res.json();
      setRows(data.data || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setSelected(new Set());
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
    load("", 1);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function onSearch(v: string) {
    setQ(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      setPage(1);
      load(v, 1);
    }, 350);
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // ---------------- Create / Update ----------------
  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormErr(null);
    setFormOpen(true);
  }
  function openEdit(s: SoldierRow) {
    setEditing(s);
    setForm({
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
    setFormErr(null);
    setFormOpen(true);
  }
  async function saveForm() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormErr("نام و نام خانوادگی الزامی است");
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) if (v.trim()) payload[k] = v.trim();
      const res = editing
        ? await fetch(`/api/soldiers/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/soldiers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره");
      setToast(editing ? `«${form.firstName} ${form.lastName}» ویرایش شد` : `«${form.firstName} ${form.lastName}» ثبت شد`);
      setFormOpen(false);
      load(q, page);
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Delete ----------------
  async function doDelete(hard: boolean) {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.ids.length === 1 && !hard) {
        const res = await fetch(`/api/soldiers/${deleteTarget.ids[0]}`, { method: "DELETE" });
        if (!res.ok) throw new Error("حذف ناموفق بود");
      } else {
        const res = await fetch("/api/soldiers/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: deleteTarget.ids, hard }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "حذف ناموفق بود");
      }
      setToast(
        hard
          ? `${toFaDigits(deleteTarget.ids.length)} رکورد به‌صورت قطعی حذف شد`
          : `${toFaDigits(deleteTarget.ids.length)} رکورد به آرشیو منتقل شد`,
      );
      setDeleteTarget(null);
      load(q, page);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const searching = q.trim().length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-bold text-slate-700">۴. مدیریت مستقیم رکوردها (CRUD)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ایجاد، ویرایش و حذف سربازان مستقیماً روی پایگاه‌داده — {toFaDigits(total)} رکورد
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => load(q, page)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> تازه‌سازی
          </button>
          {canWrite && (
            <>
              <button
                onClick={() => setDeleteTarget({ ids: Array.from(selected), label: `${toFaDigits(selected.size)} رکورد انتخاب‌شده` })}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 border border-rose-300 bg-rose-50 hover:bg-rose-100 rounded-lg px-3 py-2 transition disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" /> حذف انتخاب‌شده‌ها ({toFaDigits(selected.size)})
              </button>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 transition shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" /> سرباز جدید
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="جستجو: نام، کد ملی، کد پرسنلی، شهر، یگان..."
          className="w-full border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              {canWrite && (
                <th className="p-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="accent-emerald-600 w-4 h-4 cursor-pointer"
                  />
                </th>
              )}
              <th className="p-2.5 text-right">ردیف</th>
              <th className="p-2.5 text-right">کد پرسنلی</th>
              <th className="p-2.5 text-right">نام و نام خانوادگی</th>
              <th className="p-2.5 text-right">کد ملی</th>
              <th className="p-2.5 text-right">یگان خدمتی</th>
              <th className="p-2.5 text-right">شماره تماس</th>
              <th className="p-2.5 text-right">وضعیت جسمانی</th>
              <th className="p-2.5 text-right">تاریخ اعزام</th>
              <th className="p-2.5 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className={`border-t border-slate-100 hover:bg-emerald-50/40 transition ${selected.has(s.id) ? "bg-emerald-50/70" : ""}`}
              >
                {canWrite && (
                  <td className="p-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                      className="accent-emerald-600 w-4 h-4 cursor-pointer"
                    />
                  </td>
                )}
                <td className="p-2.5 text-slate-400">{toFaDigits(s.rowNumber ?? s.id)}</td>
                <td className="p-2.5 font-mono text-xs text-slate-500">{s.personnelCode || "—"}</td>
                <td className="p-2.5 font-bold text-slate-700 whitespace-nowrap">
                  {s.firstName} {s.lastName}
                </td>
                <td className="p-2.5 font-mono text-xs text-slate-500">{s.nationalCode || "—"}</td>
                <td className="p-2.5 text-slate-600">{s.serviceUnit || "—"}</td>
                <td className="p-2.5 text-slate-600 text-xs whitespace-nowrap">{s.phoneNumber || "—"}</td>
                <td className="p-2.5 text-slate-600 text-xs whitespace-nowrap">{s.physicalStatus || "—"}</td>
                <td className="p-2.5 text-slate-500 text-xs">{s.dispatchDate ? toFaDigits(s.dispatchDate) : "—"}</td>
                <td className="p-2.5">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/soldiers/${s.id}`}
                      title="مشاهده پرونده"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => openEdit(s)}
                          title="ویرایش"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ ids: [s.id], label: `«${s.firstName} ${s.lastName}»` })}
                          title="حذف"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 9 : 8} className="p-8 text-center text-sm text-slate-400">
                  {loading ? "در حال بارگذاری..." : "رکوردی یافت نشد"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!searching && totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-slate-400">
            صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const p = Math.max(1, page - 1);
                setPage(p);
                load(q, p);
              }}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-3.5 h-3.5" /> قبلی
            </button>
            <button
              onClick={() => {
                const p = Math.min(totalPages, page + 1);
                setPage(p);
                load(q, p);
              }}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              بعدی <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" onClick={() => !saving && setFormOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto scrollbar-thin animate-[fadeIn_.2s_ease]">
            <h3 className="font-bold text-slate-800 mb-4">{editing ? `ویرایش: ${editing.firstName} ${editing.lastName}` : "ثبت سرباز جدید"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام *" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="نام خانوادگی *" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
              <Field label="نام پدر" value={form.fatherName} onChange={(v) => setForm({ ...form, fatherName: v })} />
              <Field label="کد ملی" value={form.nationalCode} onChange={(v) => setForm({ ...form, nationalCode: v })} />
              <Field label="کد پرسنلی" value={form.personnelCode} onChange={(v) => setForm({ ...form, personnelCode: v })} />
              <Field label="یگان خدمتی" value={form.serviceUnit} onChange={(v) => setForm({ ...form, serviceUnit: v })} />
              <Field label="شهر" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="تاریخ اعزام (جلالی)" value={form.dispatchDate} onChange={(v) => setForm({ ...form, dispatchDate: v })} placeholder="1403-01-15" />
              <Field label="تلفن" value={form.phoneNumber} onChange={(v) => setForm({ ...form, phoneNumber: v })} />
              <div>
                <label className="text-xs text-slate-500 block mb-1">وضعیت تأهل</label>
                <select
                  value={form.maritalStatus}
                  onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="مجرد">مجرد</option>
                  <option value="متاهل">متاهل</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">تحصیلات</label>
                <select
                  value={form.educationLevel}
                  onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {["زیر دیپلم", "دیپلم", "فوق دیپلم", "کارشناسی", "کارشناسی ارشد", "دکتری"].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            {formErr && (
              <div className="mt-3 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                <XCircle className="w-4 h-4 shrink-0" /> {formErr}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setFormOpen(false)}
                disabled={saving}
                className="text-sm text-slate-600 hover:bg-slate-100 rounded-lg px-4 py-2 transition"
              >
                انصراف
              </button>
              <button
                onClick={saveForm}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg px-5 py-2 transition disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "ذخیره تغییرات" : "ثبت سرباز"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-[fadeIn_.2s_ease]">
            <div className="flex items-start gap-3 mb-4">
              <span className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </span>
              <div>
                <h3 className="font-bold text-slate-800">حذف {deleteTarget.label}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-6">نوع حذف را انتخاب کنید:</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              <button
                onClick={() => doDelete(false)}
                disabled={deleting}
                className="w-full flex items-center gap-3 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg p-3 text-right transition disabled:opacity-60"
              >
                <Archive className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  <span className="block text-sm font-bold text-amber-800">حذف معمولی (انتقال به آرشیو)</span>
                  <span className="block text-xs text-amber-600 mt-0.5">رکورد از دید سامانه پنهان می‌شود ولی در پایگاه‌داده باقی می‌ماند</span>
                </span>
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={deleting}
                className="w-full flex items-center gap-3 border border-rose-300 bg-rose-50 hover:bg-rose-100 rounded-lg p-3 text-right transition disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-5 h-5 text-rose-600 animate-spin shrink-0" /> : <Trash2 className="w-5 h-5 text-rose-600 shrink-0" />}
                <span>
                  <span className="block text-sm font-bold text-rose-800">حذف قطعی از پایگاه‌داده</span>
                  <span className="block text-xs text-rose-600 mt-0.5">همراه با کسری‌ها، انتقال‌ها و اعلان‌های وابسته — غیرقابل بازگشت</span>
                </span>
              </button>
            </div>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="w-full text-sm text-slate-600 hover:bg-slate-100 rounded-lg px-4 py-2 transition"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white text-sm rounded-xl shadow-2xl px-5 py-3.5 max-w-sm animate-[fadeIn_.2s_ease] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
      />
    </div>
  );
}
