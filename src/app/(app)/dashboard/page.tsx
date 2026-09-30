"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatCard, BarList, Donut } from "@/components/ui";
import { toFaDigits } from "@/lib/jalali";
import DashboardNotifications from "@/components/DashboardNotifications";

interface ReportData {
  kpis: { total: number; married: number; single: number; transfers: number; adjustments: number };
  settledHidden: number;
  byUnit: { label: string; value: number }[];
  byCity: { label: string; value: number }[];
  byEducation: { label: string; value: number }[];
  byMarital: { label: string; value: number }[];
  dispatchTrend: { label: string; value: number }[];
}

const LS_KEY = "srms-dash-include-settled";

export default function DashboardPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeSettled, setIncludeSettled] = useState(false);

  useEffect(() => {
    try {
      setIncludeSettled(localStorage.getItem(LS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback((withSettled: boolean) => {
    setLoading(true);
    fetch(`/api/reports?quick=true&settled=${withSettled ? "all" : "exclude"}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(includeSettled);
  }, [includeSettled, load]);

  function toggleSettled() {
    const next = !includeSettled;
    setIncludeSettled(next);
    try {
      localStorage.setItem(LS_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">داشبورد</h1>
          <p className="text-slate-500 text-sm mt-1">نمای کلی از وضعیت منابع سرباز</p>
        </div>
        <Link
          href="/soldiers/new"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-4 py-2"
        >
          ➕ ثبت سرباز جدید
        </Link>
      </div>

      {/* Settled visibility toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🎖️</span>
          <div>
            <div className="text-sm font-bold text-slate-700">نمایش سربازان تسویه‌شده در آمار</div>
            <div className="text-[11px] text-slate-400">
              به‌صورت پیش‌فرض، سربازانی که پایان خدمتشان گذشته از آمار و نمودارها پنهان هستند
            </div>
          </div>
        </div>
        <button
          onClick={toggleSettled}
          role="switch"
          aria-checked={includeSettled}
          className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
            includeSettled ? "bg-emerald-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
              includeSettled ? "right-6" : "right-1"
            }`}
          />
        </button>
      </div>

      {/* Hidden settled notice */}
      {!loading && data && !includeSettled && data.settledHidden > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm">
          <span className="text-amber-800">
            🎖️ <b>{toFaDigits(data.settledHidden)}</b> سرباز تسویه‌شده از آمار پنهان هستند
          </span>
          <div className="flex gap-2">
            <button onClick={toggleSettled} className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg px-3 py-1.5 transition">
              افزودن به آمار
            </button>
            <Link href="/settled" className="text-xs font-bold text-amber-800 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition">
              مشاهده بخش تسویه‌شده‌ها ←
            </Link>
          </div>
        </div>
      )}

      {/* Notifications widget — always shown at the top */}
      <DashboardNotifications limit={6} />

      {loading || !data ? (
        <div className="text-slate-400">در حال بارگذاری...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              title={includeSettled ? "کل سربازان (با تسویه)" : "سربازان در حال خدمت"}
              value={data.kpis.total}
              icon="🪖"
              color="emerald"
            />
            <StatCard title="متاهل" value={data.kpis.married} icon="💍" color="blue" />
            <StatCard title="مجرد" value={data.kpis.single} icon="👤" color="violet" />
            <StatCard title="انتقالات" value={data.kpis.transfers} icon="🔄" color="amber" />
            <StatCard title="تغییرات خدمت" value={data.kpis.adjustments} icon="📝" color="rose" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <BarList title="توزیع بر اساس رده خدمتی" data={data.byUnit} color="emerald" />
            <BarList title="توزیع بر اساس شهر" data={data.byCity} color="blue" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Donut title="وضعیت تاهل" data={data.byMarital} />
            <BarList title="روند اعزام (به تفکیک سال شمسی)" data={data.dispatchTrend} color="violet" />
          </div>
        </>
      )}
    </div>
  );
}
