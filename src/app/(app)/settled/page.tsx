"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Search, Eye, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { StatCard, BarList, Donut } from "@/components/ui";
import { toFaDigits } from "@/lib/jalali";

interface ChartData {
  label: string;
  value: number;
}
interface ReportData {
  kpis: { total: number; married: number; single: number };
  byUnit: ChartData[];
  byCity: ChartData[];
  byEducation: ChartData[];
  byMarital: ChartData[];
  dispatchTrend: ChartData[];
}
interface SettledSoldier {
  id: number;
  rowNumber: number | null;
  personnelCode: string | null;
  nationalCode: string | null;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  serviceUnit: string | null;
  rank: string | null;
  city: string | null;
  phoneNumber: string | null;
  physicalStatus: string | null;
  marriageDate: string | null;
  childrenCount: number | null;
  dispatchDate: string | null;
  serviceEndDate: string | null;
  maritalStatus: string | null;
  educationLevel: string | null;
}
interface ListData {
  data: SettledSoldier[];
  total: number;
  page: number;
  totalPages: number;
}

function faDate(iso: string | null): string {
  if (!iso) return "—";
  const p = iso.split("T")[0].split("-");
  if (p.length < 3) return toFaDigits(iso);
  return toFaDigits(`${p[0]}/${p[1].padStart(2, "0")}/${p[2].padStart(2, "0")}`);
}

const OPTIONAL_COLS = [
  { key: "city", label: "شهر محل سکونت" },
  { key: "marriageDate", label: "تاریخ ازدواج" },
  { key: "childrenCount", label: "تعداد فرزند" },
];

export default function SettledPage() {
  const [optCols, setOptCols] = useState<string[]>([]);
  const [stats, setStats] = useState<ReportData | null>(null);
  const [list, setList] = useState<ListData | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    fetch("/api/reports?quick=true&settled=only")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const loadList = useCallback(async (query: string, pg: number) => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ settled: "only", showAll: "true", page: String(pg) });
      if (query.trim()) {
        params.delete("showAll");
        params.set("q", query.trim());
      }
      const res = await fetch(`/api/soldiers?${params}`);
      const data = await res.json();
      setList({ data: data.data || [], total: data.total ?? 0, page: data.page ?? 1, totalPages: data.totalPages ?? 1 });
    } catch {
      setList({ data: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList("", 1);
  }, [loadList]);

  function onSearch(v: string) {
    setQ(v);
    setPage(1);
    loadList(v, 1);
  }

  const total = stats?.kpis.total ?? list?.total ?? 0;

  return (
    <div className="pb-10">
      {/* ---------- Header band ---------- */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6 mb-5">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-20 right-1/3 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-3xl">
              🎖️
            </span>
            <div>
              <h1 className="text-2xl font-black">سربازان تسویه‌شده</h1>
              <p className="text-slate-400 text-sm mt-1">
                سربازانی که تاریخ پایان خدمت‌شان گذشته است — جدا از آمار جاری، با امکانات کامل گزارش‌گیری
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-[11px] text-slate-400">کل تسویه‌شده‌ها</div>
              <div className="text-4xl font-black text-emerald-400 leading-none mt-1">{toFaDigits(total)}</div>
            </div>
            <a
              href="/api/soldiers/export?settled=only"
              target="_blank"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition shadow-lg shadow-emerald-600/25"
            >
              <Download className="w-4 h-4" /> خروجی اکسل
            </a>
          </div>
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard title="کل تسویه‌شده" value={stats.kpis.total} icon="🎖️" color="emerald" />
          <StatCard title="متاهل" value={stats.kpis.married} icon="💍" color="blue" />
          <StatCard title="مجرد" value={stats.kpis.single} icon="👤" color="violet" />
          <StatCard
            title="بیشترین رده"
            value={stats.byUnit[0] ? `${stats.byUnit[0].label} (${toFaDigits(stats.byUnit[0].value)})` : "—"}
            icon="🏢"
            color="amber"
          />
        </div>
      )}

      {/* ---------- Charts ---------- */}
      {stats && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <BarList title="توزیع رده خدمتی (تسویه‌شده‌ها)" data={stats.byUnit} color="emerald" />
            <Donut title="وضعیت تاهل (تسویه‌شده‌ها)" data={stats.byMarital} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <BarList title="توزیع شهر (تسویه‌شده‌ها)" data={stats.byCity} color="blue" />
            <BarList title="توزیع مدرک تحصیلی (تسویه‌شده‌ها)" data={stats.byEducation} color="violet" />
          </div>
        </>
      )}

      {/* ---------- List ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-bold text-slate-700">فهرست سربازان تسویه‌شده ({toFaDigits(list?.total ?? 0)})</h2>
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="جستجو: نام، کد ملی، کد پرسنلی، شهر، یگان..."
              className="w-full border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap mb-2 text-xs text-slate-500">
          <span className="font-bold">ستون‌های اختیاری:</span>
          {OPTIONAL_COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={optCols.includes(c.key)}
                onChange={(e) => setOptCols((v) => (e.target.checked ? [...v, c.key] : v.filter((k) => k !== c.key)))}
              />
              {c.label}
            </label>
          ))}
          <span className="text-slate-400">(شماره تماس و وضعیت جسمانی همیشه نمایش داده می‌شوند)</span>
        </div>

        <div className="overflow-x-auto scrollbar-thin border border-slate-200 rounded-lg">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="p-2.5 text-right">ردیف</th>
                <th className="p-2.5 text-right">کد پرسنلی</th>
                <th className="p-2.5 text-right">نام و نام خانوادگی</th>
                <th className="p-2.5 text-right">کد ملی</th>
                <th className="p-2.5 text-right">رده خدمتی</th>
                <th className="p-2.5 text-right">شماره تماس</th>
                <th className="p-2.5 text-right">وضعیت جسمانی</th>
                {optCols.includes("city") && <th className="p-2.5 text-right">شهر محل سکونت</th>}
                {optCols.includes("marriageDate") && <th className="p-2.5 text-right">تاریخ ازدواج</th>}
                {optCols.includes("childrenCount") && <th className="p-2.5 text-right">تعداد فرزند</th>}
                <th className="p-2.5 text-right">تاریخ اعزام</th>
                <th className="p-2.5 text-right">پایان خدمت</th>
                <th className="p-2.5 text-right">وضعیت</th>
                <th className="p-2.5 text-right">پرونده</th>
              </tr>
            </thead>
            <tbody>
              {(list?.data || []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-emerald-50/40 transition">
                  <td className="p-2.5 text-slate-400">{toFaDigits(s.rowNumber ?? s.id)}</td>
                  <td className="p-2.5 font-mono text-xs text-slate-500">{s.personnelCode || "—"}</td>
                  <td className="p-2.5 font-bold text-slate-700 whitespace-nowrap">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="p-2.5 font-mono text-xs text-slate-500">{s.nationalCode || "—"}</td>
                  <td className="p-2.5 text-slate-600">{s.serviceUnit || "—"}</td>
                  <td className="p-2.5 text-slate-600 text-xs whitespace-nowrap">{s.phoneNumber ? toFaDigits(s.phoneNumber) : "—"}</td>
                  <td className="p-2.5 text-slate-600 text-xs whitespace-nowrap">{s.physicalStatus || "—"}</td>
                  {optCols.includes("city") && <td className="p-2.5 text-slate-600">{s.city || "—"}</td>}
                  {optCols.includes("marriageDate") && <td className="p-2.5 text-slate-500 text-xs">{faDate(s.marriageDate)}</td>}
                  {optCols.includes("childrenCount") && <td className="p-2.5 text-slate-600">{s.childrenCount != null ? toFaDigits(s.childrenCount) : "—"}</td>}
                  <td className="p-2.5 text-slate-500 text-xs">{faDate(s.dispatchDate)}</td>
                  <td className="p-2.5 text-slate-500 text-xs">{faDate(s.serviceEndDate)}</td>
                  <td className="p-2.5">
                    <span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">تسویه شده</span>
                  </td>
                  <td className="p-2.5">
                    <Link
                      href={`/soldiers/${s.id}`}
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-bold"
                    >
                      <Eye className="w-4 h-4" /> مشاهده
                    </Link>
                  </td>
                </tr>
              ))}
              {list && list.data.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-sm text-slate-400">
                    {loadingList ? "در حال بارگذاری..." : "سرباز تسویه‌شده‌ای یافت نشد"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {list && list.totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-slate-400">
              صفحه {toFaDigits(list.page)} از {toFaDigits(list.totalPages)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const p = Math.max(1, page - 1);
                  setPage(p);
                  loadList(q, p);
                }}
                disabled={page <= 1 || loadingList}
                className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                {loadingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />} قبلی
              </button>
              <button
                onClick={() => {
                  const p = Math.min(list.totalPages, page + 1);
                  setPage(p);
                  loadList(q, p);
                }}
                disabled={page >= list.totalPages || loadingList}
                className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                بعدی <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
