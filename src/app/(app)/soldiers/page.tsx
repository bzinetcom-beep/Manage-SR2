"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LIST_FIELDS, LIST_OPTIONAL_FIELDS, LIST_ALL_FIELDS, DATE_KEYS, withRequiredColumns } from "@/lib/fields";
import { isoToJalali, toFaDigits } from "@/lib/jalali";
import { getServiceStatus } from "@/lib/service-status";

type Row = Record<string, unknown> & { id: number };

const dateSet = new Set(DATE_KEYS);
const CLIENT_PAGE_SIZE = 20;

export default function SoldiersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visible, setVisible] = useState<string[]>(LIST_FIELDS.map((f) => f.key));
  const [showCols, setShowCols] = useState(false);
  const [role, setRole] = useState("viewer");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Show-all mode (server-side pagination)
  const [showAll, setShowAll] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role || "viewer"));
    // Fetch total count for the "show all" button
    fetch("/api/soldiers?showAll=true&page=1")
      .then((r) => r.json())
      .then((d) => setTotalRecords(d.total || 0))
      .catch(() => {});
  }, []);

  // Debounced search: instant search on typing (works in both modes)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      // If in showAll mode and query cleared, go back to showAll
      if (showAll) {
        setSearched(true);
        setPage(1);
      } else {
        setRows([]);
        setSearched(false);
        setPage(1);
      }
      return;
    }
    // Exit show-all when user types a search query
    if (showAll) {
      setShowAll(false);
      setTotalRecords(0);
      setTotalPages(1);
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const params = new URLSearchParams();
        params.set("q", q.trim());
        const res = await fetch(`/api/soldiers?${params.toString()}`);
        const data = await res.json();
        setRows(data.data || []);
        setPage(1);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, showAll]);

  // Fetch page when show-all mode changes page
  useEffect(() => {
    if (!showAll) return;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("showAll", "true");
        params.set("page", String(page));
        const res = await fetch(`/api/soldiers?${params.toString()}`);
        const data = await res.json();
        setRows(data.data || []);
        setTotalRecords(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [showAll, page]);

  // Exit show-all mode when user types a search query
  useEffect(() => {
    if (q.trim() && showAll) {
      setShowAll(false);
      setTotalRecords(0);
      setTotalPages(1);
    }
  }, [q]);

  const canWrite = role === "admin" || role === "operator";

  // Client-side sorting for search mode
  const sorted = useMemo(() => {
    if (showAll) return rows; // already sorted server-side
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (av == null) return 1;
      if (bv == null) return -1;
      const r = String(av).localeCompare(String(bv), "fa", { numeric: true });
      return sortDir === "asc" ? r : -r;
    });
    return arr;
  }, [rows, sortKey, sortDir, showAll]);

  const clientTotalPages = Math.max(1, Math.ceil(sorted.length / CLIENT_PAGE_SIZE));
  const clientPageRows = sorted.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function del(id: number) {
    if (!confirm("آیا از حذف این سرباز مطمئن هستید؟")) return;
    await fetch(`/api/soldiers/${id}`, { method: "DELETE" });
    if (showAll) {
      // Refetch current page
      const params = new URLSearchParams();
      params.set("showAll", "true");
      params.set("page", String(page));
      const res = await fetch(`/api/soldiers?${params.toString()}`);
      const data = await res.json();
      setRows(data.data || []);
      setTotalRecords(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } else {
      const params = new URLSearchParams();
      params.set("q", q.trim());
      const res = await fetch(`/api/soldiers?${params.toString()}`);
      const data = await res.json();
      setRows(data.data || []);
    }
  }

  const cols = LIST_ALL_FIELDS.filter((f) => f.listRequired || visible.includes(f.key));

  function exportExcel() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (showAll) params.set("showAll", "true");
    params.set("columns", withRequiredColumns(visible).join(","));
    window.open(`/api/soldiers/export?${params.toString()}`, "_blank");
  }

  function activateShowAll() {
    setShowAll(true);
    setSearched(true);
    setQ("");
    setPage(1);
    setRows([]);
  }

  function exitShowAll() {
    setShowAll(false);
    setSearched(false);
    setRows([]);
    setTotalRecords(0);
    setTotalPages(1);
  }

  // Determine which page/rows to display
  const displayPage = showAll ? totalPages : clientTotalPages;
  const displayRows = showAll ? rows : clientPageRows;
  const displayPageNum = showAll ? page : page;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مدیریت سربازان</h1>
          <p className="text-slate-500 text-sm mt-1">جستجو، مشاهده و مدیریت اطلاعات سربازان</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(searched && !showAll && rows.length > 0) && (
            <button onClick={exportExcel} className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-4 py-2">
              📤 خروجی اکسل ({toFaDigits(rows.length)})
            </button>
          )}
          {canWrite && (
            <Link href="/soldiers/new" className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-2">
              ➕ سرباز جدید
            </Link>
          )}
        </div>
      </div>

      {/* Single search bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-bold text-slate-700">🔍 جستجوی سرباز</label>
          {showAll && (
            <button
              onClick={exitShowAll}
              className="text-xs text-slate-500 hover:text-red-500 underline"
            >
              ✕ بستن لیست
            </button>
          )}
        </div>
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="نام، نام خانوادگی، کد ملی، کد پرسنلی، شماره پرونده، رده خدمتی، شهر و ..."
              className="w-full border-2 border-slate-300 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm outline-none transition"
              disabled={showAll}
              autoFocus={!showAll}
            />
            {loading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowCols(!showCols)} className="border border-slate-300 text-sm rounded-lg px-3 py-3 hover:bg-slate-50" title="تنظیم ستون‌ها">
              ⚙️
            </button>
            {showCols && (
              <div className="absolute z-20 mt-2 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-56 max-h-72 overflow-auto scrollbar-thin">
                <div className="text-xs font-bold text-slate-500 mb-2">ستون‌های قابل نمایش</div>
                {LIST_FIELDS.map((f) => (
                  <label key={f.key} className={`flex items-center gap-2 text-sm py-1 ${f.listRequired ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={f.listRequired ? true : visible.includes(f.key)}
                      disabled={!!f.listRequired}
                      onChange={(e) =>
                        setVisible((v) =>
                          e.target.checked ? [...v, f.key] : v.filter((k) => k !== f.key),
                        )
                      }
                    />
                    {f.label}
                    {f.listRequired && <span className="text-[10px] text-emerald-600 font-bold">ضروری</span>}
                  </label>
                ))}
                <div className="text-xs font-bold text-slate-500 mt-3 mb-2 pt-2 border-t border-slate-200">ستون‌های اختیاری</div>
                {LIST_OPTIONAL_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visible.includes(f.key)}
                      onChange={(e) =>
                        setVisible((v) =>
                          e.target.checked ? [...v, f.key] : v.filter((k) => k !== f.key),
                        )
                      }
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {searched && !showAll && (
          <div className="mt-2 text-xs text-slate-400">
            {toFaDigits(rows.length)} نتیجه یافت شد
          </div>
        )}
        {showAll && (
          <div className="mt-2 text-xs text-slate-400">
            نمایش {toFaDigits(totalRecords)} سرباز — صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!searched && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-slate-600 mb-2">جستجوی سربازان</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            برای مشاهده لیست سربازان، در فیلد بالا عبارت مورد نظر خود را تایپ کنید.
            <br />
            می‌توانید بر اساس <b>نام</b>، <b>کد ملی</b>، <b>کد پرسنلی</b>، <b>رده خدمتی</b>، <b>شهر</b> و ... جستجو کنید.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={activateShowAll}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-xl px-6 py-3 transition font-bold shadow-lg shadow-emerald-100"
            >
              📋 نمایش همه سربازان ({toFaDigits(totalRecords > 0 ? totalRecords : "...")})
            </button>
          </div>
          <div className="mt-6 flex gap-3 justify-center flex-wrap">
            {["علی", "محمدی", "0012", "فرهنگی", "تهران"].map((sample) => (
              <button
                key={sample}
                onClick={() => setQ(sample)}
                className="bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-sm rounded-lg px-4 py-2 transition"
              >
                مثال: {sample}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show-all mode: info bar */}
      {showAll && !loading && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-emerald-700 font-bold">
            📋 نمایش همه سربازان — {toFaDigits(totalRecords)} سرباز ثبت شده
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-3 py-1.5">
              📤 خروجی اکسل
            </button>
            <button
              onClick={exitShowAll}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm rounded-lg px-3 py-1.5"
            >
              ✕ بازگشت به جستجو
            </button>
          </div>
        </div>
      )}

      {/* Results table */}
      {searched && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading && rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-slate-500 font-bold">در حال بارگذاری...</div>
            </div>
          ) : rows.length === 0 && !loading ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">😕</div>
              <div className="text-slate-500 font-bold">نتیجه‌ای یافت نشد</div>
              <div className="text-slate-400 text-sm mt-1">عبارت دیگری را امتحان کنید</div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-3 text-center font-medium whitespace-nowrap">مشاهده</th>
                      <th className="px-3 py-3 text-right font-medium">#</th>
                      {cols.map((f) => (
                        <th
                          key={f.key}
                          onClick={() => toggleSort(f.key)}
                          className="px-3 py-3 text-right font-medium cursor-pointer whitespace-nowrap hover:text-emerald-600"
                        >
                          {f.label} {sortKey === f.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center font-medium whitespace-nowrap">وضعیت خدمت</th>
                      {canWrite && <th className="px-3 py-3 text-center font-medium whitespace-nowrap">عملیات</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.map((r, i) => (
                      <tr key={r.id} className="hover:bg-emerald-50/40 transition group">
                        <td className="px-3 py-2.5 text-center">
                          <Link
                            href={`/soldiers/${r.id}`}
                            title="مشاهده مشخصات کامل"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">
                          {showAll
                            ? toFaDigits((page - 1) * 25 + i + 1)
                            : toFaDigits((page - 1) * CLIENT_PAGE_SIZE + i + 1)}
                        </td>
                        {cols.map((f) => {
                          let v = r[f.key] as string;
                          if (dateSet.has(f.key) && v) v = isoToJalali(v);
                          return (
                            <td key={f.key} className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                              {v ? toFaDigits(v) : "—"}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                          {(() => {
                            const st = getServiceStatus(r.serviceEndDate as string);
                            return (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                st === "تسویه شده" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {st}
                              </span>
                            );
                          })()}
                        </td>
                        {canWrite && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                          <div className="flex gap-1 justify-center">
                            <Link
                              href={`/soldiers/${r.id}/edit`}
                              title="ویرایش"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </Link>
                            <button
                              onClick={() => del(r.id)}
                              title="حذف"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {displayPage > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-slate-100 text-sm">
                  <div className="text-slate-500">
                    صفحه {toFaDigits(displayPageNum)} از {toFaDigits(displayPage)} — {showAll ? toFaDigits(totalRecords) : toFaDigits(rows.length)} نتیجه
                  </div>
                  <div className="flex gap-2">
                    <button disabled={displayPageNum <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50">◀ قبلی</button>
                    <button disabled={displayPageNum >= displayPage} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50">بعدی ▶</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
