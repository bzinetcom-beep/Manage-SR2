"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/jalali";
import ServiceUnitModal from "@/components/ServiceUnitModal";
import {
  CITY_OPTIONS, UNIT_OPTIONS, MARITAL_OPTIONS, EDUCATION_OPTIONS,
  RANK_OPTIONS, MEMBERSHIP_OPTIONS, PHYSICAL_OPTIONS,
} from "@/lib/fields";

interface ChartData { label: string; value: number }
interface FilteredSoldier {
  id: number;
  personnelCode: string | null;
  nationalCode: string | null;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  city: string | null;
  serviceUnit: string | null;
  rank: string | null;
  maritalStatus: string | null;
  marriageDate: string | null;
  childrenCount: number | null;
  dispatchDate: string | null;
  serviceEndDate: string | null;
  serviceStatus: string;
  educationLevel: string | null;
  phoneNumber: string | null;
  physicalStatus: string | null;
}
interface ReportData {
  kpis: { total: number; married: number; single: number; transfers: number; adjustments: number; mamoor: number };
  byUnit: ChartData[];
  byCity: ChartData[];
  byEducation: ChartData[];
  byMarital: ChartData[];
  byRank: ChartData[];
  byBlood: ChartData[];
  byPhysical: ChartData[];
  bySeparation: ChartData[];
  byRecruitment: ChartData[];
  byTransferType: ChartData[];
  dispatchTrend: ChartData[];
  totalFiltered: number;
  soldiers: FilteredSoldier[];
}

const CHART_TYPES = [
  { id: "bar", label: "📊 میله‌ای", icon: "📊" },
  { id: "pie", label: "🥧 دایره‌ای", icon: "🥧" },
  { id: "hbar", label: "📋 افقی", icon: "📋" },
  { id: "table", label: "📑 جدولی", icon: "📑" },
] as const;

const SERVICE_STATUS_OPTIONS = [
  { label: "در حال خدمت", value: "در حال خدمت" },
  { label: "تسویه شده", value: "تسویه شده" },
];

const FILTER_FIELDS: { key: string; label: string; options: { label: string; value: string }[] }[] = [
  { key: "city", label: "شهر", options: CITY_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "serviceUnit", label: "رده خدمتی", options: UNIT_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "maritalStatus", label: "وضعیت تاهل", options: MARITAL_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "serviceStatus", label: "وضعیت خدمت", options: SERVICE_STATUS_OPTIONS },
  { key: "educationLevel", label: "مدرک تحصیلی", options: EDUCATION_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "rank", label: "درجه", options: RANK_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "membershipType", label: "نوع عضویت", options: MEMBERSHIP_OPTIONS.map(o => ({ label: o, value: o })) },
  { key: "physicalStatus", label: "وضعیت جسمانی", options: [{ label: "سالم", value: "سالم" }, { label: "معاف از رزم", value: "معاف از رزم" }] },
  { key: "transferType", label: "نوع انتقال", options: ["انتقال دائم", "مامور"].map(o => ({ label: o, value: o })) },
];

const DISPLAY_CHARTS: { key: keyof ReportData; title: string }[] = [
  { key: "byUnit", title: "توزیع بر اساس رده خدمتی" },
  { key: "byCity", title: "توزیع بر اساس شهر" },
  { key: "byEducation", title: "توزیع بر اساس مدرک تحصیلی" },
  { key: "byMarital", title: "توزیع بر اساس وضعیت تاهل" },
  { key: "byRank", title: "توزیع بر اساس درجه" },
  { key: "byBlood", title: "توزیع بر اساس گروه خون" },
  { key: "byPhysical", title: "توزیع بر اساس وضعیت جسمانی" },
  { key: "bySeparation", title: "توزیع بر اساس نوع جدایی" },
  { key: "byRecruitment", title: "توزیع بر اساس نوع جذب" },
  { key: "byTransferType", title: "توزیع بر اساس نوع انتقال" },
  { key: "dispatchTrend", title: "روند اعزام (سال شمسی)" },
];

const COLORS = ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#6366f1"];

function formatJalali(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return "";
  return `${parts[0]}/${parts[1].padStart(2, "0")}/${parts[2].padStart(2, "0")}`;
}

const OPTIONAL_REPORT_COLUMNS = [
  { key: "city", label: "شهر محل سکونت" },
  { key: "marriageDate", label: "تاریخ ازدواج" },
  { key: "childrenCount", label: "تعداد فرزند" },
];

export default function ReportsPage() {
  const [optCols, setOptCols] = useState<string[]>([]);
  const [showOptCols, setShowOptCols] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<string>("bar");
  const [activeChart, setActiveChart] = useState<string>("byUnit");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tableSearch, setTableSearch] = useState("");
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>(UNIT_OPTIONS);
  const [includeSettled, setIncludeSettled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("srms-reports-include-settled") === "1";
    } catch {
      return false;
    }
  });

  function toggleIncludeSettled() {
    const next = !includeSettled;
    setIncludeSettled(next);
    try {
      localStorage.setItem("srms-reports-include-settled", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    load(filters, next);
  }

  async function loadUnits() {
    try {
      const res = await fetch("/api/service-units");
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        const fetchedNames = json.data.map((u: any) => u.name);
        const merged = Array.from(new Set([...UNIT_OPTIONS, ...fetchedNames])).filter(Boolean);
        setUnitOptions(merged);
      }
    } catch (e) {
      console.error("Failed to load unit options:", e);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  function settledParamFor(withFilters: Record<string, string>, incSettled: boolean): string {
    // The explicit service-status filter takes precedence over the toggle
    const ss = withFilters.serviceStatus;
    if (ss === "تسویه شده") return "only";
    if (ss === "در حال خدمت") return "exclude";
    return incSettled ? "all" : "exclude";
  }

  async function load(withFilters: Record<string, string>, incSettled: boolean = includeSettled) {
    setLoading(true);
    const p = new URLSearchParams();
    Object.entries(withFilters).forEach(([k, v]) => v && p.set(k, v));
    p.set("settled", settledParamFor(withFilters, incSettled));
    try {
      const res = await fetch(`/api/reports?${p.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Reports load error:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(filters); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setFilter(key: string, val: string) {
    setFilters((f) => ({ ...f, [key]: val }));
  }

  function resetFilters() {
    const empty: Record<string, string> = {};
    setFilters(empty);
    load(empty);
  }

  function applyFilters() {
    load(filters);
  }

  function exportExcel() {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set("settled", settledParamFor(filters, includeSettled));
    if (optCols.length) p.set("optional", optCols.join(","));
    window.open(`/api/reports/export?${p.toString()}`, "_blank");
  }

  const activeData = data ? ((data[activeChart as keyof ReportData] as ChartData[]) || []) : [];
  const hasFilters = Object.values(filters).some(Boolean);
  const soldiers = data?.soldiers || [];

  const filteredSoldiers = soldiers.filter((s) => {
    if (!tableSearch) return true;
    const q = tableSearch.toLowerCase();
    return (
      (s.firstName || "").toLowerCase().includes(q) ||
      (s.lastName || "").toLowerCase().includes(q) ||
      (s.nationalCode || "").toLowerCase().includes(q) ||
      (s.personnelCode || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q) ||
      (s.serviceUnit || "").toLowerCase().includes(q)
    );
  });

  function toggleSelectAll() {
    if (selectedIds.size === filteredSoldiers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSoldiers.map((s) => s.id)));
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function exportSelected() {
    if (selectedIds.size === 0) {
      alert("لطفاً ابتدا حداقل یک سرباز را انتخاب کنید");
      return;
    }
    const ids = Array.from(selectedIds).join(",");
    window.open(`/api/soldiers/export?ids=${ids}`, "_blank");
  }

  function renderChart(chartData: ChartData[], type: string, maxItems?: number) {
    const d = maxItems ? chartData.slice(0, maxItems) : chartData;
    if (!d.length) return <div className="text-slate-400 text-sm text-center py-8">داده‌ای موجود نیست</div>;
    if (type === "bar") return <BarChart data={d} />;
    if (type === "pie") return <PieChart data={d.slice(0, 8)} />;
    if (type === "hbar") return <HBarChart data={d} />;
    if (type === "table") return <TableChart data={d} />;
    return <BarChart data={d} />;
  }

  // Compute KPIs for service status
  const dischargedCount = soldiers.filter((s) => s.serviceStatus === "تسویه شده").length;
  const activeCount = soldiers.filter((s) => s.serviceStatus === "در حال خدمت").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">گزارش‌گیری و آمار</h1>
          <p className="text-slate-500 text-sm mt-1">فیلتر، تحلیل و خروجی اکسل از داده‌های سربازان</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowUnitModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-4 py-2 shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <span>🏢 مدیریت و ایمپورت/اکسپورت رده‌های خدمتی</span>
          </button>
          <button onClick={exportExcel} className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-4 py-2 shadow-sm transition-colors">
            📤 خروجی اکسل نتایج فیلتر
          </button>
        </div>
      </div>

      {/* Filters panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-700">🔍 فیلترها</h2>
          {hasFilters && (
            <button onClick={resetFilters} className="text-xs text-red-500 hover:underline">✕ حذف همه فیلترها</button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {FILTER_FIELDS.map((f) => {
            const options =
              f.key === "serviceUnit"
                ? unitOptions.map((o) => ({ label: o, value: o }))
                : f.options;
            return (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1 font-medium">{f.label}</label>
                <select
                  value={filters[f.key] || ""}
                  onChange={(e) => setFilter(f.key, e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white"
                >
                  <option value="">همه ({f.label})</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={toggleIncludeSettled}
            title="سربازان تسویه‌شده به‌صورت پیش‌فرض از آمار پنهان هستند"
            className={`flex items-center gap-2 border text-sm rounded-lg px-4 py-2.5 transition ${
              includeSettled
                ? "bg-amber-50 border-amber-300 text-amber-800 font-bold"
                : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"
            }`}
          >
            🎖️ {includeSettled ? "تسویه‌شده‌ها: در آمار" : "تسویه‌شده‌ها: پنهان"}
          </button>
          <button onClick={applyFilters} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-6 py-2.5">
            🔍 اعمال فیلتر و مشاهده نتایج
          </button>
          {hasFilters && (
            <button onClick={() => { resetFilters(); applyFilters(); }} className="border border-slate-300 text-sm rounded-lg px-4 py-2.5 hover:bg-slate-50">
              بازنشانی
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-slate-400">در حال بارگذاری...</div>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
            <KPICard title="کل نتایج" value={data.kpis.total} icon="🪖" color="emerald" />
            <KPICard title="در حال خدمت" value={activeCount} icon="✅" color="blue" />
            <KPICard title="تسویه شده" value={dischargedCount} icon="" color="rose" />
            <KPICard title="متاهل" value={data.kpis.married} icon="💍" color="violet" />
            <KPICard title="مجرد" value={data.kpis.single} icon="👤" color="slate" />
            <KPICard title="انتقالات" value={data.kpis.transfers} icon="🔄" color="amber" />
            <KPICard title="مامور" value={data.kpis.mamoor} icon="📋" color="teal" />
            <KPICard title="تغییرات خدمت" value={data.kpis.adjustments} icon="📝" color="orange" />
          </div>

          {/* Chart type selector + chart selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-bold">نوع نمودار</label>
                <div className="flex gap-1">
                  {CHART_TYPES.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setChartType(ct.id)}
                      className={`text-sm px-4 py-2 rounded-lg transition ${
                        chartType === ct.id
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-bold">داده نمودار</label>
                <select
                  value={activeChart}
                  onChange={(e) => setActiveChart(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  {DISPLAY_CHARTS.filter((dc) => {
                    const d = data[dc.key as keyof ReportData];
                    return Array.isArray(d) && d.length > 0;
                  }).map((dc) => (
                    <option key={dc.key} value={dc.key}>{dc.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Render active chart */}
            <div className="bg-slate-50 rounded-xl p-4 min-h-[320px]">
              <h3 className="font-bold text-slate-700 mb-3 text-sm">
                {DISPLAY_CHARTS.find((d) => d.key === activeChart)?.title}
              </h3>
              {renderChart(activeData, chartType)}
            </div>
          </div>

          {/* Quick chart gallery */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {DISPLAY_CHARTS.filter((dc) => {
              const d = data[dc.key as keyof ReportData];
              return Array.isArray(d) && d.length > 0;
            }).slice(0, 6).map((dc) => (
              <div key={dc.key} className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-700 mb-3 text-sm">{dc.title}</h3>
                {renderChart((data[dc.key] as ChartData[]) || [], chartType, 10)}
              </div>
            ))}
          </div>

          {/* ═══ Filtered Results Table ═══ */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-slate-700">📋 نتایج فیلتر شده</h3>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {toFaDigits(filteredSoldiers.length)} سرباز
                </span>
                {selectedIds.size > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                    {toFaDigits(selectedIds.size)} انتخاب شده
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="جستجو در نتایج..."
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white w-48"
                />
                <div className="relative">
                  <button
                    onClick={() => setShowOptCols((v) => !v)}
                    className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm rounded-lg px-3 py-1.5"
                    title="ستون‌های اختیاری جدول"
                  >
                    ⚙️ ستون‌های اختیاری
                  </button>
                  {showOptCols && (
                    <div className="absolute z-20 mt-2 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-52">
                      <div className="text-xs font-bold text-slate-500 mb-2">ستون‌های اختیاری</div>
                      {OPTIONAL_REPORT_COLUMNS.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={optCols.includes(c.key)}
                            onChange={(e) => setOptCols((v) => (e.target.checked ? [...v, c.key] : v.filter((k) => k !== c.key)))}
                          />
                          {c.label}
                        </label>
                      ))}
                      <div className="text-[11px] text-slate-400 mt-2 leading-5">شماره تماس و وضعیت جسمانی همیشه نمایش داده می‌شوند.</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={exportExcel}
                  className="bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg px-3 py-1.5"
                  title="خروجی اکسل همه نتایج فیلتر شده"
                >
                  📤 اکسل همه
                </button>
                <button
                  onClick={exportSelected}
                  disabled={selectedIds.size === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50"
                  title="خروجی اکسل انتخاب شده‌ها"
                >
                  📤 اکسل انتخاب شده
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-right w-10">
                      <input
                        type="checkbox"
                        checked={filteredSoldiers.length > 0 && selectedIds.size === filteredSoldiers.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">ردیف</th>
                    <th className="px-3 py-2.5 text-right font-medium">کد پرسنلی</th>
                    <th className="px-3 py-2.5 text-right font-medium">کد ملی</th>
                    <th className="px-3 py-2.5 text-right font-medium">نام و نام خانوادگی</th>
                    <th className="px-3 py-2.5 text-right font-medium">نام پدر</th>
                    <th className="px-3 py-2.5 text-right font-medium">شماره تماس</th>
                    <th className="px-3 py-2.5 text-right font-medium">رده خدمتی</th>
                    <th className="px-3 py-2.5 text-right font-medium">درجه</th>
                    <th className="px-3 py-2.5 text-center font-medium">تاهل</th>
                    <th className="px-3 py-2.5 text-center font-medium">وضعیت جسمانی</th>
                    {optCols.includes("city") && <th className="px-3 py-2.5 text-right font-medium">شهر محل سکونت</th>}
                    {optCols.includes("marriageDate") && <th className="px-3 py-2.5 text-center font-medium">تاریخ ازدواج</th>}
                    {optCols.includes("childrenCount") && <th className="px-3 py-2.5 text-center font-medium">تعداد فرزند</th>}
                    <th className="px-3 py-2.5 text-center font-medium">اعزام</th>
                    <th className="px-3 py-2.5 text-center font-medium">پایان خدمت</th>
                    <th className="px-3 py-2.5 text-center font-medium">وضعیت</th>
                    <th className="px-3 py-2.5 text-center font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSoldiers.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="text-center py-8 text-slate-400">
                        سربازی با این فیلترها یافت نشد
                      </td>
                    </tr>
                  ) : filteredSoldiers.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-400">{toFaDigits(i + 1)}</td>
                      <td className="px-3 py-2 text-slate-600">{s.personnelCode || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono text-xs">{s.nationalCode || "—"}</td>
                      <td className="px-3 py-2 text-slate-800 font-medium">{s.firstName} {s.lastName}</td>
                      <td className="px-3 py-2 text-slate-600">{s.fatherName || "—"}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap" dir="ltr" style={{ textAlign: "right" }}>{s.phoneNumber ? toFaDigits(s.phoneNumber) : "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{s.serviceUnit || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{s.rank || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.maritalStatus === "متاهل" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {s.maritalStatus || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 text-xs whitespace-nowrap">{s.physicalStatus || "—"}</td>
                      {optCols.includes("city") && <td className="px-3 py-2 text-slate-600">{s.city || "—"}</td>}
                      {optCols.includes("marriageDate") && (
                        <td className="px-3 py-2 text-center text-slate-600 text-xs">
                          {s.maritalStatus === "متاهل" && s.marriageDate ? toFaDigits(formatJalali(s.marriageDate)) : "—"}
                        </td>
                      )}
                      {optCols.includes("childrenCount") && (
                        <td className="px-3 py-2 text-center text-slate-700 font-bold">
                          {s.maritalStatus === "متاهل" ? toFaDigits(s.childrenCount ?? 0) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center text-slate-600 text-xs">{toFaDigits(formatJalali(s.dispatchDate))}</td>
                      <td className="px-3 py-2 text-center text-slate-600 text-xs">{toFaDigits(formatJalali(s.serviceEndDate))}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          s.serviceStatus === "تسویه شده" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {s.serviceStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link href={`/soldiers/${s.id}`} className="text-emerald-600 hover:underline text-xs">مشاهده</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          خطا در بارگذاری گزارش‌ها
        </div>
      )}

      {showUnitModal && (
        <ServiceUnitModal
          onClose={() => setShowUnitModal(false)}
          onUnitsChanged={loadUnits}
        />
      )}
    </div>
  );
}

function KPICard({
  title, value, icon, color = "emerald",
}: {
  title: string; value: number | string; icon: string; color?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color] || colors.emerald}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs opacity-80">{title}</div>
          <div className="text-xl font-bold mt-1">{toFaDigits(value)}</div>
        </div>
        <div className="text-xl">{icon}</div>
      </div>
    </div>
  );
}

// Fixed BarChart — uses explicit heights so percentage-based bars render correctly
function BarChart({ data }: { data: ChartData[] }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-72 px-2 pb-2">
      {data.map((d, i) => {
        const pct = Math.max(2, (d.value / max) * 100);
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center h-full min-w-0 group">
            {/* value label */}
            <span className="text-xs text-slate-600 font-bold mb-1">{toFaDigits(d.value)}</span>
            {/* bar container fills remaining space */}
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full rounded-t-md transition-all duration-500 shadow-sm group-hover:opacity-80"
                style={{
                  height: `${pct}%`,
                  background: `linear-gradient(to top, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}dd)`,
                }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            {/* category label */}
            <span className="text-[10px] text-slate-500 mt-1.5 truncate w-full text-center leading-tight" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HBarChart({ data }: { data: ChartData[] }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-600 w-28 shrink-0 truncate" title={d.label}>{d.label}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end pr-2"
              style={{ width: `${Math.max(4, (d.value / max) * 100)}%`, background: COLORS[i % COLORS.length] }}
            >
              {d.value > 0 && <span className="text-[10px] text-white font-bold">{toFaDigits(d.value)}</span>}
            </div>
          </div>
          <span className="text-xs text-slate-500 w-10 text-left">{toFaDigits(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieChart({ data }: { data: ChartData[] }) {
  if (!data.length) return null;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  const R = 55;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
        <g transform="translate(65,65) rotate(-90)">
          {data.slice(0, 8).map((d, i) => {
            const frac = d.value / total;
            const dash = frac * C;
            const el = (
              <circle
                key={d.label}
                r={R}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth="20"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc}
              />
            );
            acc += dash;
            return el;
          })}
        </g>
        <text x="65" y="70" textAnchor="middle" className="fill-slate-700 font-bold" fontSize="14">
          {toFaDigits(total)}
        </text>
      </svg>
      <div className="space-y-1.5 text-sm">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="text-slate-400">({toFaDigits(d.value)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableChart({ data }: { data: ChartData[] }) {
  if (!data.length) return null;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="px-4 py-2 text-right font-medium">ردیف</th>
            <th className="px-4 py-2 text-right font-medium">عنوان</th>
            <th className="px-4 py-2 text-center font-medium">تعداد</th>
            <th className="px-4 py-2 text-center font-medium">درصد</th>
            <th className="px-4 py-2 text-center font-medium">نمودار</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((d, i) => (
            <tr key={d.label} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-400">{toFaDigits(i + 1)}</td>
              <td className="px-4 py-2.5 text-slate-700 font-medium">{d.label}</td>
              <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{toFaDigits(d.value)}</td>
              <td className="px-4 py-2.5 text-center text-slate-500">{toFaDigits(((d.value / total) * 100).toFixed(1))}٪</td>
              <td className="px-4 py-2.5">
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(d.value / total) * 100}%`, background: COLORS[i % COLORS.length] }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-bold text-slate-700">
            <td className="px-4 py-2" colSpan={2}>جمع کل</td>
            <td className="px-4 py-2 text-center">{toFaDigits(total)}</td>
            <td className="px-4 py-2 text-center">۱۰۰٪</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
