"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SOLDIER_SECTIONS, SOLDIER_FIELDS, DATE_KEYS, ADJUSTMENT_TYPES, UNIT_OPTIONS } from "@/lib/fields";
import { isoToJalali, toFaDigits, toEnDigits, jalaliToDate } from "@/lib/jalali";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { getServiceStatus } from "@/lib/service-status";
import { LEGAL_SERVICE_DAYS, netAdjustmentDays, computeBaseServiceEnd } from "@/lib/service-date";
import { TRANSFER_TYPES, TRANSFER_TYPE_MISSION, TRANSFER_TYPE_PERMANENT, normalizeTransferType, pickCurrentTransfer } from "@/lib/transfer-info";

const SECTION_ICONS: Record<string, string> = {
  "هویتی": "👤",
  "تماس": "📞",
  "خدمتی": "🪖",
  "تحصیلی": "🎓",
  "جسمانی": "💪",
  "دوره خدمت": "⏱️",
  "آموزش": "📚",
  "وضعیت": "📋",
  "سایر": "📌",
};

const dateSet = new Set(DATE_KEYS);

interface Adjustment {
  id: number;
  type: string;
  effectDirection: string;
  days: number;
  effectiveDate: string | null;
  title: string | null;
  description: string | null;
  legalDocumentNumber: string | null;
}
interface Transfer {
  id: number;
  transferDate: string | null;
  fromServiceUnit: string | null;
  toServiceUnit: string | null;
  transferReason: string | null;
  status: string;
  documentNumber: string | null;
  transferType: string | null;
  missionStartDate: string | null;
  missionEndDate: string | null;
}

export default function SoldierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [soldier, setSoldier] = useState<Record<string, unknown> | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [role, setRole] = useState("viewer");
  const [showAdj, setShowAdj] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [editAdj, setEditAdj] = useState<Adjustment | null>(null);
  const [editTr, setEditTr] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch(`/api/soldiers/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("سرباز مورد نظر یافت نشد.");
        } else {
          setError("خطا در دریافت اطلاعات. لطفاً دوباره تلاش کنید.");
        }
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setSoldier(data.data);
      setAdjustments(data.adjustments || []);
      setTransfers(data.transfers || []);
    } catch {
      setError("خطا در ارتباط با سرور.");
    }
  }
  useEffect(() => {
    load();
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d.user?.role || "viewer"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canWrite = role === "admin" || role === "operator";

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-5xl">⚠️</div>
        <p className="text-red-600 text-lg font-medium">{error}</p>
        <button onClick={load} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm">
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (!soldier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">در حال بارگذاری اطلاعات سرباز...</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  محاسبات پیشرفته پیشرفت خدمت (مبنای ۶۳۰ روز قانونی)
  // ════════════════════════════════════════════════════════════════
  const dispatchDate = soldier.dispatchDate as string | null;
  const serviceEndDate = soldier.serviceEndDate as string | null;

  // روزهای کاهش / افزایش از لیست adjustments
  const decreaseDays = adjustments
    .filter((a) => a.effectDirection === "decrease")
    .reduce((s, a) => s + (Number(a.days) || 0), 0);
  const increaseDays = adjustments
    .filter((a) => a.effectDirection === "increase")
    .reduce((s, a) => s + (Number(a.days) || 0), 0);
  const netAdj = netAdjustmentDays(adjustments); // می‌تواند منفی باشد
  // مدت قانونی = ۲۱ ماه شمسی؛ تعداد روز واقعی آن از روی تاریخ اعزام محاسبه می‌شود
  const legalDays = (() => {
    const d1 = jalaliToDate(dispatchDate);
    const d2 = jalaliToDate(computeBaseServiceEnd(dispatchDate));
    return d1 && d2 ? Math.round((d2.getTime() - d1.getTime()) / 86400000) : LEGAL_SERVICE_DAYS;
  })();
  const effectiveTotalDays = legalDays + netAdj; // روز واقعی خدمت

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let daysElapsed = 0;
  let daysRemaining: number | null = null;
  let hasFinished = false;
  let baseStart: Date | null = null;
  let baseEnd: Date | null = null;
  let adjProgressRatio = 0; // برای نمایش گرافیکی در سگمنت بار

  if (dispatchDate) {
    const d1 = jalaliToDate(dispatchDate);
    if (d1) {
      baseStart = d1;
      // تاریخ پایان مؤثر = تاریخ اعزام + ۶۳۰ + نت
      baseEnd = new Date(d1.getTime());
      baseEnd.setDate(baseEnd.getDate() + effectiveTotalDays);
      daysElapsed = Math.max(
        0,
        Math.min(
          effectiveTotalDays,
          Math.round((startOfToday.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        ),
      );
      daysRemaining = Math.round(
        (baseEnd.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
      );
      hasFinished = daysRemaining < 0;
      adjProgressRatio = effectiveTotalDays > 0 ? daysElapsed / effectiveTotalDays : 0;
    }
  }
  const serviceProgress = Math.min(100, Math.round(adjProgressRatio * 100));

  const remainingBreakdown = (() => {
    if (daysRemaining === null || daysRemaining <= 0) return null;
    const months = Math.floor(daysRemaining / 30);
    const days = daysRemaining % 30;
    if (months === 0) return `${toFaDigits(days)} روز`;
    if (days === 0) return `${toFaDigits(months)} ماه`;
    return `${toFaDigits(months)} ماه و ${toFaDigits(days)} روز`;
  })();

  // روزِ هم‌ارز تاریخ پایان (برچسب پایین بار)
  const effectiveEndLabel = baseEnd ? isoToJalali(baseEnd.toISOString().slice(0, 10)) : val("serviceEndDate");

  // گروه‌بندی adjustment ها بر اساس نوع برای نمایش تراشه‌ها
  type AdjBucket = { label: string; days: number; tone: "emerald" | "rose" | "amber" | "indigo" };
  const buckets: Record<string, AdjBucket> = {};
  for (const a of adjustments) {
    const key = a.type || "سایر";
    if (!buckets[key]) {
      const isDec = a.effectDirection === "decrease";
      buckets[key] = {
        label: key,
        days: 0,
        tone: isDec
          ? key.includes("کسری") || key.includes("ایثار") ? "emerald"
          : key.includes("غیبت") || key.includes("اضافه") ? "rose"
          : "indigo"
          : "amber",
      };
    }
    buckets[key].days += Number(a.days) || 0;
  }
  const bucketList = Object.values(buckets);
  const totalAdjDays = Math.abs(netAdj);

  const meta = (soldier.metadata as Record<string, unknown>) || {};

  function val(key: string): string {
    let v = (soldier as Record<string, unknown>)[key] ?? meta[key];
    if (v == null || v === "") return "—";
    if (dateSet.has(key)) v = isoToJalali(String(v));
    return toFaDigits(String(v));
  }

  async function delAdj(aid: number) {
    if (!confirm("حذف این تغییر خدمت؟")) return;
    await fetch(`/api/adjustments/${aid}`, { method: "DELETE" });
    load();
  }
  async function delTr(tid: number) {
    if (!confirm("حذف این انتقال؟")) return;
    await fetch(`/api/transfers/${tid}`, { method: "DELETE" });
    load();
  }

  const serviceStatus = getServiceStatus(serviceEndDate);
  const currentTransfer = pickCurrentTransfer(transfers);

  return (
    <div>
      {/* ═══ Hero header ═══ */}
      <div className="bg-gradient-to-l from-emerald-600 via-emerald-700 to-teal-700 rounded-2xl p-6 mb-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl translate-x-24 translate-y-24" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl border border-white/30 shadow-lg">
              🪖
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {String(soldier.firstName)} {String(soldier.lastName)}
              </h1>
              <p className="text-emerald-50 text-sm mt-1 flex items-center gap-2 flex-wrap">
                <span>🆔 {val("nationalCode")}</span>
                <span className="text-emerald-200">•</span>
                <span>🏢 {val("serviceUnit")}</span>
                <span className="text-emerald-200">•</span>
                <span>🎖️ {val("rank")}</span>
                <span className="text-emerald-200">•</span>
                {currentTransfer ? (
                  <span
                    title={currentTransfer.type === TRANSFER_TYPE_MISSION ? `از ${toFaDigits(isoToJalali(currentTransfer.missionStartDate))} تا ${toFaDigits(isoToJalali(currentTransfer.missionEndDate))}` : "انتقال دائم به رده‌ی مقصد"}
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                      currentTransfer.type === TRANSFER_TYPE_MISSION
                        ? currentTransfer.missionExpired
                          ? "bg-rose-500/30 border-rose-200/50 text-white"
                          : "bg-amber-400/30 border-amber-200/60 text-white"
                        : "bg-white/20 border-white/40 text-white"
                    }`}
                  >
                    {currentTransfer.type === TRANSFER_TYPE_MISSION ? "📌" : "🔁"} {currentTransfer.type}
                    {currentTransfer.type === TRANSFER_TYPE_MISSION && currentTransfer.missionEndDate
                      ? currentTransfer.missionExpired
                        ? " (ماموریت پایان یافته — نیازمند انتقال جدید)"
                        : ` تا ${toFaDigits(isoToJalali(currentTransfer.missionEndDate))}`
                      : ""}
                    {currentTransfer.isDraft ? " (پیش‌نویس)" : ""}
                  </span>
                ) : (
                  <span className="text-emerald-100/90 text-xs">🔁 نوع انتقال: ثبت نشده</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className={`px-4 py-2 rounded-full text-sm font-bold border backdrop-blur-sm ${
              serviceStatus === "تسویه شده"
                ? "bg-rose-500/20 border-rose-300/40 text-rose-50"
                : "bg-emerald-400/30 border-emerald-200/50 text-white"
            }`}>
              {serviceStatus === "تسویه شده" ? "✓ تسویه شده" : "⚡ در حال خدمت"}
            </span>
            {canWrite && (
              <Link href={`/soldiers/${id}/edit`} className="bg-white text-emerald-700 hover:bg-emerald-50 text-sm rounded-lg px-4 py-2 font-bold shadow">
                ✏️ ویرایش
              </Link>
            )}
            <Link href="/soldiers" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-sm rounded-lg px-4 py-2">
              ← بازگشت
            </Link>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           ═══  پنل پیشرفته‌ی پیشرفت خدمت (مبنای ۶۳۰ روز قانونی) ═══
          ════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white mb-4 shadow-sm">
        {/* پس‌زمینه تزئینی */}
        <div className="absolute inset-0 bg-gradient-to-bl from-emerald-50/70 via-white to-sky-50/60 pointer-events-none" />
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-emerald-200/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-sky-200/30 blur-3xl pointer-events-none" />

        <div className="relative p-5">
          {/* هدر پنل */}
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-500/30">
                ⏱️
              </div>
              <div>
                <h2 className="font-extrabold text-slate-800 text-base">پیشرفت دوره خدمت</h2>
                <p className="text-xs text-slate-500">مبنای محاسبه: ۶۳۰ روز قانونی + تغییرات ثبت‌شده</p>
              </div>
            </div>
            {daysRemaining !== null && (
              hasFinished ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                  ✅ خدمت پایان یافته
                  <span className="font-normal">({toFaDigits(Math.abs(daysRemaining))} روز پیش)</span>
                </span>
              ) : daysRemaining === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
                  🎯 امروز آخرین روز
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm ${
                    daysRemaining <= 30
                      ? "bg-rose-100 text-rose-800 border-rose-300"
                      : daysRemaining <= 90
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-indigo-100 text-indigo-800 border-indigo-300"
                  }`}
                >
                  ⏳ {toFaDigits(daysRemaining)} روز باقی‌مانده
                  {remainingBreakdown && daysRemaining >= 30 && (
                    <span className="font-normal opacity-80">({remainingBreakdown})</span>
                  )}
                </span>
              )
            )}
          </div>

          {/* ===== ردیف اعداد کلیدی ===== */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur px-4 py-3">
              <div className="text-[11px] text-slate-500 font-medium">مبنای قانونی</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-slate-800">{toFaDigits(legalDays)}</span>
                <span className="text-[11px] text-slate-500">روز (۲۱ ماه)</span>
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 backdrop-blur ${
              netAdj < 0 ? "border-emerald-200 bg-emerald-50/80" : netAdj > 0 ? "border-rose-200 bg-rose-50/80" : "border-slate-200/80 bg-white/70"
            }`}>
              <div className="text-[11px] text-slate-500 font-medium">مجموع تغییرات</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                {netAdj === 0 ? (
                  <span className="text-xl font-extrabold text-slate-500">بدون تغییر</span>
                ) : (
                  <>
                    <span className={`text-xl font-extrabold ${netAdj < 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {netAdj < 0 ? "−" : "+"}
                      {toFaDigits(Math.abs(netAdj))}
                    </span>
                    <span className="text-[11px] text-slate-500">روز</span>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 backdrop-blur px-4 py-3">
              <div className="text-[11px] text-sky-700 font-medium">مدت مؤثر خدمت</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-sky-800">{toFaDigits(effectiveTotalDays)}</span>
                <span className="text-[11px] text-slate-500">روز</span>
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 backdrop-blur ${
              hasFinished ? "border-emerald-300 bg-emerald-100/80" : daysRemaining !== null && daysRemaining <= 30 ? "border-rose-200 bg-rose-50/80" : "border-slate-200/80 bg-white/70"
            }`}>
              <div className="text-[11px] text-slate-500 font-medium">روزهای سپری‌شده</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-slate-800">{toFaDigits(daysElapsed)}</span>
                <span className="text-[11px] text-slate-500">از {toFaDigits(effectiveTotalDays)} ({toFaDigits(serviceProgress)}٪)</span>
              </div>
            </div>
          </div>

          {/* ===== نوار پیشرفت چند قسمتی با نمایش کسر/اضافه ===== */}
          <div className="mb-2">
            <div className="relative h-7 rounded-full bg-slate-200/80 overflow-hidden shadow-inner ring-1 ring-slate-300/50">
              {/* بخش‌های قانونی/کسر/اضافه/باقیمانده */}
              {(() => {
                const total = Math.max(1, effectiveTotalDays);
                const doneW = Math.min(100, (daysElapsed / total) * 100);
                // درصدی از میله که مربوط به ۶۳۰ روز قانونی است
                const legalPct = Math.min(100, (legalDays / total) * 100);
                // بخش سپری‌شده‌ای که در محدوده قانونی می‌افتد
                const doneLegalPct = Math.min(doneW, legalPct);
                // اگر نت منفی (کسری) → مازاد سپری‌شده با رنگ سبز تیره
                // اگر نت مثبت (اضافه) → بخش اضافه با رنگ قرمز کم‌رنگ
                const adjPct = (Math.abs(netAdj) / total) * 100;
                const doneAdjPct = netAdj < 0 ? Math.max(0, doneW - legalPct) : 0;
                const remainingPct = Math.max(0, 100 - doneW - (netAdj > 0 ? adjPct : 0));
                return (
                  <>
                    {/* قسمت قانونی سپری‌شده */}
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all"
                      style={{ width: `${doneLegalPct}%` }}
                    />
                    {/* قسمت کسری سپری‌شده (روزهایی که به‌واسطه کسری زودتر تمام شده) */}
                    {netAdj < 0 && doneW > legalPct && (
                      <div
                        className="absolute top-0 bottom-0 bg-gradient-to-l from-teal-400 to-emerald-500 transition-all"
                        style={{ right: `${legalPct}%`, width: `${doneAdjPct}%` }}
                      />
                    )}
                    {/* قسمت اضافه‌خدمت/غیبت (انتهای میله در صورت داشتن اضافه) */}
                    {netAdj > 0 && (
                      <div
                        className="absolute top-0 bottom-0 bg-gradient-to-l from-rose-400 to-rose-500/80"
                        style={{ right: `calc(${legalPct}%)`, width: `${adjPct}%`, opacity: 0.4 }}
                      />
                    )}
                    {/* نقطه پایان قانونی */}
                    {legalDays < total && (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-rose-600 z-10"
                        style={{ right: `${(legalDays / total) * 100}%` }}
                        title="پایان قانونی"
                      />
                    )}
                    {netAdj < 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-emerald-700 z-10"
                        style={{ right: "100%" }}
                      />
                    )}
                    {/* متن درصد وسط میله */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {serviceProgress >= 10 && (
                        <span className="text-[11px] text-white font-extrabold drop-shadow">
                          {toFaDigits(serviceProgress)}٪
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* راهنما */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10.5px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> خدمت عادی سپری‌شده
              </span>
              {netAdj < 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-teal-500 inline-block" /> روزهای کسر خدمت
                </span>
              )}
              {netAdj > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-rose-400 inline-block" /> اضافه‌خدمت/غیبت
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> باقی‌مانده
              </span>
            </div>

            {/* نقاط زمانی */}
            <div className="flex items-center justify-between mt-2 text-[10.5px] text-slate-500">
              <span className="text-right">
                <div className="text-slate-400">شروع</div>
                <div className="font-bold text-slate-700">{val("dispatchDate")}</div>
              </span>
              {daysRemaining !== null && daysRemaining > 0 && (
                <span className="text-center">
                  <div className="text-slate-400">مانده</div>
                  <div className="font-bold text-sky-700">{toFaDigits(daysRemaining)} روز</div>
                </span>
              )}
              <span className="text-left">
                <div className="text-slate-400">پایان مؤثر</div>
                <div className="font-bold text-emerald-700">{effectiveEndLabel}</div>
              </span>
            </div>
          </div>

          {/* ===== تفکیک انواع تغییرات ===== */}
          {adjustments.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50/80 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-slate-700">📐 تفکیک تغییرات خدمتی</div>
                <div className="text-[10.5px] text-slate-500">
                  مجموع خالص:{" "}
                  <b className={netAdj < 0 ? "text-emerald-700" : netAdj > 0 ? "text-rose-700" : "text-slate-700"}>
                    {netAdj < 0 ? "−" : netAdj > 0 ? "+" : ""}{toFaDigits(Math.abs(netAdj))} روز
                  </b>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bucketList.map((b, i) => {
                  const toneClasses: Record<string, string> = {
                    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
                    rose: "bg-rose-100 text-rose-800 border-rose-300",
                    amber: "bg-amber-100 text-amber-800 border-amber-300",
                    indigo: "bg-indigo-100 text-indigo-800 border-indigo-300",
                  };
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${toneClasses[b.tone] || "bg-slate-100 text-slate-700 border-slate-300"}`}
                    >
                      {b.label}
                      <span className="font-mono font-extrabold">{toFaDigits(b.days)}</span>
                      <span className="opacity-70">روز</span>
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold bg-white text-slate-700 border-slate-300">
                  مجموع: {toFaDigits(decreaseDays)}- / {toFaDigits(increaseDays)}+
                </span>
              </div>
            </div>
          )}

          {adjustments.length === 0 && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500 text-center">
              هیچ تغییر خدمتی (کسری / اضافه / غیبت / مرخصی) برای این سرباز ثبت نشده است. پایان خدمت بر اساس ۶۳ روز قانونی محاسبه شده.
            </div>
          )}
        </div>
      </div>

      {/* ===== دکمه‌های فرم و خلاصه وضعیت ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">📄 فرم‌های رسمی (چاپ / PDF)</h3>
            <span className="text-[10.5px] text-slate-400">سایزهای A4 و A5</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={`/documents/kartax/${id}`} target="_blank" className="inline-flex items-center gap-1.5 bg-gradient-to-l from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-sm rounded-lg px-4 py-2 shadow-sm shadow-emerald-600/20">
              🗂️ فرم کارتکس
            </a>
            <a href={`/documents/form111/${id}`} target="_blank" className="inline-flex items-center gap-1.5 bg-gradient-to-l from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-sm rounded-lg px-4 py-2 shadow-sm shadow-indigo-600/20">
              📋 فرم ۱۱۱
            </a>
            <a href={`/documents/settlement/${id}`} target="_blank" className="inline-flex items-center gap-1.5 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm rounded-lg px-4 py-2 shadow-sm shadow-amber-500/20">
              ✅ فرم تسویه حساب
            </a>
            {transfers.length > 0 && (
              <a href={`/documents/transfer/${transfers[0].id}`} target="_blank" className="inline-flex items-center gap-1.5 bg-gradient-to-l from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white text-sm rounded-lg px-4 py-2 shadow-sm">
                📨 حکم انتقال
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] text-slate-500">تاریخ اعزام</div>
            <div className="font-bold text-slate-800 mt-1">{val("dispatchDate")}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] text-slate-500">تاریخ پایان مؤثر</div>
            <div className="font-bold text-emerald-700 mt-1">{effectiveEndLabel}</div>
          </div>
        </div>
      </div>

      {/* ═══ Fields grouped — Modern card layout ═══ */}
      <div className="mb-4">
        <h2 className="font-bold text-slate-700 mb-3 text-lg">📋 مشخصات کامل</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOLDIER_SECTIONS.map((section) => {
            const fields = SOLDIER_FIELDS.filter((f) => f.section === section).filter(f => {
              if (f.key === "marriageDate" && val("maritalStatus") !== "متاهل") return false;
              if (f.key === "childrenCount" && val("maritalStatus") !== "متاهل") return false;
              return true;
            });
            if (fields.length === 0) return null;
            const icon = SECTION_ICONS[section] || "📄";
            return (
              <div key={section} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="bg-gradient-to-l from-emerald-50 to-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <h3 className="text-sm font-bold text-slate-700">{section}</h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {fields.map((f) => {
                      const value = val(f.key);
                      const isEmpty = value === "—";
                      return (
                        <div
                          key={f.key}
                          className="bg-slate-50 hover:bg-emerald-50/50 rounded-lg p-3 border border-transparent hover:border-emerald-200 transition-colors"
                        >
                          <div className="text-[11px] text-slate-500 font-medium mb-1">{f.label}</div>
                          <div className={`text-sm font-semibold ${isEmpty ? "text-slate-300" : "text-slate-800"} break-words`}>
                            {value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Adjustments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-700">تغییرات تاریخ پایان خدمت (کسری / اضافه خدمت)</h2>
          {canWrite && (
            <button onClick={() => { setEditAdj(null); setShowAdj(true); }} className="bg-emerald-600 text-white text-sm rounded-lg px-3 py-1.5">➕ ثبت تغییر</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">نوع</th>
                <th className="px-3 py-2 text-right">جهت</th>
                <th className="px-3 py-2 text-right">روز</th>
                <th className="px-3 py-2 text-right">تاریخ موثر</th>
                <th className="px-3 py-2 text-right">شماره سند</th>
                <th className="px-3 py-2 text-right">توضیح</th>
                {canWrite && <th className="px-3 py-2 text-right"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.length === 0 ? (
                <tr><td colSpan={8} className="p-4 text-center text-slate-400">موردی ثبت نشده</td></tr>
              ) : adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2">{a.type}</td>
                  <td className="px-3 py-2">
                    <span className={a.effectDirection === "decrease" ? "text-emerald-600" : "text-rose-600"}>
                      {a.effectDirection === "decrease" ? "کاهش ▼" : "افزایش ▲"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{toFaDigits(a.days)}</td>
                  <td className="px-3 py-2">{a.effectiveDate ? toFaDigits(isoToJalali(a.effectiveDate)) : "—"}</td>
                  <td className="px-3 py-2">{a.legalDocumentNumber || "—"}</td>
                  <td className="px-3 py-2">{a.description || "—"}</td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditAdj(a); setShowAdj(true); }} className="text-blue-600 hover:underline">ویرایش</button>
                        <button onClick={() => delAdj(a.id)} className="text-red-600 hover:underline">حذف</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfers */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-700">انتقال رده خدمتی</h2>
          {canWrite && (
            <button onClick={() => { setEditTr(null); setShowTr(true); }} className="bg-emerald-600 text-white text-sm rounded-lg px-3 py-1.5">➕ ثبت انتقال</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">تاریخ</th>
                <th className="px-3 py-2 text-right">نوع انتقال</th>
                <th className="px-3 py-2 text-right">از رده</th>
                <th className="px-3 py-2 text-right">به رده</th>
                <th className="px-3 py-2 text-right">علت</th>
                <th className="px-3 py-2 text-right">وضعیت</th>
                <th className="px-3 py-2 text-right">فرم</th>
                {canWrite && <th className="px-3 py-2 text-right"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.length === 0 ? (
                <tr><td colSpan={8} className="p-4 text-center text-slate-400">موردی ثبت نشده</td></tr>
              ) : transfers.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2">{t.transferDate ? toFaDigits(isoToJalali(t.transferDate)) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${normalizeTransferType(t.transferType) === TRANSFER_TYPE_MISSION ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-700"}`}>
                      {normalizeTransferType(t.transferType)}
                    </span>
                    {normalizeTransferType(t.transferType) === TRANSFER_TYPE_MISSION && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        معرفی: {t.missionStartDate ? toFaDigits(isoToJalali(t.missionStartDate)) : "—"}
                        {" "}• پایان: {t.missionEndDate ? toFaDigits(isoToJalali(t.missionEndDate)) : "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{t.fromServiceUnit || "—"}</td>
                  <td className="px-3 py-2">{t.toServiceUnit || "—"}</td>
                  <td className="px-3 py-2">{t.transferReason || "—"}</td>
                  <td className="px-3 py-2">{t.status}</td>
                  <td className="px-3 py-2"><a href={`/documents/transfer/${t.id}`} target="_blank" className="text-indigo-600 hover:underline">چاپ فرم</a></td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditTr(t); setShowTr(true); }} className="text-blue-600 hover:underline">ویرایش</button>
                        <button onClick={() => delTr(t.id)} className="text-red-600 hover:underline">حذف</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdj && <AdjustmentModal soldierId={id} initial={editAdj} onClose={() => { setShowAdj(false); setEditAdj(null); }} onSaved={() => { setShowAdj(false); setEditAdj(null); load(); }} />}
      {showTr && <TransferModal soldierId={id} currentUnit={String(soldier.serviceUnit || "")} initial={editTr} onClose={() => { setShowTr(false); setEditTr(null); }} onSaved={() => { setShowTr(false); setEditTr(null); load(); }} />}
    </div>
  );
}

function AdjustmentModal({ soldierId, initial, onClose, onSaved }: { soldierId: string; initial?: Adjustment | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState(initial?.type || ADJUSTMENT_TYPES[0].type);
  const [days, setDays] = useState(initial ? String(initial.days) : "");
  const [effectiveDate, setEffectiveDate] = useState(initial?.effectiveDate ? isoToJalali(initial.effectiveDate, false) : "");
  const [legalDocumentNumber, setDoc] = useState(initial?.legalDocumentNumber || "");
  const [description, setDesc] = useState(initial?.description || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isEdit = !!initial;
  const direction = ADJUSTMENT_TYPES.find((t) => t.type === type)?.direction || "increase";

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const { jalaliToIso, toEnDigits } = await import("@/lib/jalali");
      const payload = { type, effectDirection: direction, days: Number(toEnDigits(days)) || 0, effectiveDate: effectiveDate ? jalaliToIso(effectiveDate) : null, legalDocumentNumber, description, title: type };
      const res = await fetch(isEdit ? `/api/adjustments/${initial!.id}` : `/api/soldiers/${soldierId}/adjustments`, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("خطا");
      setMessage({ type: "success", text: "تغییر خدمت با موفقیت ذخیره شد." });
      setTimeout(() => onSaved(), 700);
    } catch (e) { setMessage({ type: "error", text: (e as Error).message && (e as Error).message !== "خطا" ? (e as Error).message : "خطا در ذخیره اطلاعات. لطفاً دوباره تلاش کنید." }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="bg-gradient-to-l from-amber-500 to-orange-600 p-5 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-x-20 -translate-y-20" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-2xl">
              {direction === "decrease" ? "📉" : "📈"}
            </div>
            <div>
              <h3 className="text-lg font-bold">{isEdit ? "ویرایش تغییر تاریخ پایان خدمت" : "ثبت تغییر تاریخ پایان خدمت"}</h3>
              <p className="text-xs text-amber-100 mt-0.5">بازمحاسبه خودکار تاریخ پایان خدمت پس از ذخیره</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors relative z-10">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Feedback ── */}
          {message && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${message.type === "success" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700" : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700"}`}>
              {message.type === "success" ? "✅" : "❌"} {message.text}
            </div>
          )}

          {/* ── Section: نوع تغییر ── */}
          <div className="bg-amber-50/70 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-1.5">🏷️ نوع تغییر و جهت اثر</div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100">
              {ADJUSTMENT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
            </select>
            <div className={`mt-2 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${direction === "decrease" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${direction === "decrease" ? "bg-emerald-500" : "bg-rose-500"}`} />
              {direction === "decrease" ? "کاهشی — جلو انداختن تاریخ پایان خدمت" : "افزایشی — عقب انداختن تاریخ پایان خدمت"}
            </div>
          </div>

          {/* ── Section: جزئیات ── */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">📋 جزئیات تغییر</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">تعداد روز <span className="text-red-500">*</span></label>
                <input value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" placeholder="مثال: ۱۵" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100" />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">تاریخ موثر (شمسی)</label>
                <JalaliDatePicker value={effectiveDate} onChange={setEffectiveDate} placeholder="۱۴۰۳/۰۱/۱۵" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">شماره سند قانونی</label>
              <input value={legalDocumentNumber} onChange={(e) => setDoc(e.target.value)} placeholder="مثال: م-۱۲۳۴" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">توضیحات</label>
              <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="توضیحات تکمیلی..." className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 resize-none dark:text-slate-100" />
            </div>
          </div>

          {/* ── Action Button ── */}
          <button onClick={save} disabled={saving} className="w-full bg-gradient-to-l from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl py-3 shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> در حال ذخیره...</> : isEdit ? "💾 ذخیره و بازمحاسبه" : "✅ ثبت و بازمحاسبه"}
          </button>
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-lg transition-colors">بستن</button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ soldierId, currentUnit, initial, onClose, onSaved }: { soldierId: string; currentUnit: string; initial?: Transfer | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial;
  const [form, setForm] = useState<Record<string, string>>(
    initial
      ? { fromServiceUnit: initial.fromServiceUnit || "", toServiceUnit: initial.toServiceUnit || "", transferReason: initial.transferReason || "", documentNumber: initial.documentNumber || "", status: initial.status || "پیش‌نویس", transferDate: initial.transferDate ? isoToJalali(initial.transferDate, false) : "", transferType: normalizeTransferType(initial.transferType), missionStartDate: initial.missionStartDate ? isoToJalali(initial.missionStartDate, false) : "", missionEndDate: initial.missionEndDate ? isoToJalali(initial.missionEndDate, false) : "" }
      : { fromServiceUnit: currentUnit, status: "پیش‌نویس", transferType: TRANSFER_TYPE_PERMANENT },
  );
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/service-units").then((r) => r.json()).then((d) => { if (d.data && Array.isArray(d.data)) { const names = d.data.map((u: { name: string }) => u.name); setUnitOptions(Array.from(new Set([...UNIT_OPTIONS, ...names]))); } }).catch(() => setUnitOptions(UNIT_OPTIONS));
  }, []);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  async function save() {
    setSaving(true); setMessage(null);
    try {
      const { jalaliToIso } = await import("@/lib/jalali");
      const isMissionType = form.transferType === TRANSFER_TYPE_MISSION;
      const payload = {
        ...form,
        transferDate: form.transferDate ? jalaliToIso(form.transferDate) : null,
        missionStartDate: isMissionType && form.missionStartDate ? jalaliToIso(form.missionStartDate) : null,
        missionEndDate: isMissionType && form.missionEndDate ? jalaliToIso(form.missionEndDate) : null,
      };
      const res = await fetch(isEdit ? `/api/transfers/${initial!.id}` : `/api/soldiers/${soldierId}/transfers`, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "خطا");
      }
      setMessage({ type: "success", text: "انتقال با موفقیت ثبت شد." });
      setTimeout(() => onSaved(), 700);
    } catch (e) { setMessage({ type: "error", text: (e as Error).message && (e as Error).message !== "خطا" ? (e as Error).message : "خطا در ذخیره اطلاعات. لطفاً دوباره تلاش کنید." }); }
    finally { setSaving(false); }
  }

  const fields: [string, string][] = [["transferReason", "علت انتقال"], ["documentNumber", "شماره سند"], ["approvedBy", "تاییدکننده"], ["issuerName", "نام صادرکننده"], ["issuerRole", "سمت صادرکننده"]];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="bg-gradient-to-l from-indigo-600 to-purple-700 px-5 py-3.5 text-white flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-x-16 -translate-y-16" />
          <div className="relative flex items-center gap-2.5">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg text-lg">🔄</div>
            <div>
              <h3 className="text-sm font-bold">{isEdit ? "ویرایش انتقال" : "ثبت انتقال"}</h3>
              <p className="text-[10px] text-indigo-100">انتقال بین رده‌های خدمتی</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors relative z-10 text-sm">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* ── Feedback ── */}
          {message && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${message.type === "success" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700" : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700"}`}>
              {message.type === "success" ? "✅" : "❌"} {message.text}
            </div>
          )}

          {/* ── نوع انتقال (منوی آبشاری) ── */}
          <div className="bg-amber-50/70 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
            <label className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">🧭 نوع انتقال <span className="text-red-500">*</span></label>
            <select
              value={form.transferType || TRANSFER_TYPE_PERMANENT}
              onChange={(e) => set("transferType", e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100"
            >
              {TRANSFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-5">
              {form.transferType === TRANSFER_TYPE_MISSION
                ? "مامور: سرباز به‌صورت موقت در رده‌ی مقصد خدمت می‌کند و پس از پایان ماموریت باید به رده‌ی جدیدی منتقل شود."
                : "انتقال دائم: سرباز به‌صورت دائم در رده‌ی مقصد مشغول خدمت خواهد شد."}
            </p>
            {form.transferType === TRANSFER_TYPE_MISSION && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">تاریخ معرفی <span className="text-red-500">*</span></label>
                  <JalaliDatePicker value={form.missionStartDate || ""} onChange={(v) => set("missionStartDate", v)} placeholder="۱۴۰۵/۰۱/۰۱" />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">تاریخ پایان ماموریت <span className="text-red-500">*</span></label>
                  <JalaliDatePicker value={form.missionEndDate || ""} onChange={(v) => set("missionEndDate", v)} placeholder="۱۴۰۵/۰۶/۰۱" />
                </div>
              </div>
            )}
          </div>

          {/* ── Section 1: تاریخ و رده‌ها ── */}
          <div className="bg-indigo-50/70 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800">
            <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-1.5">📍 مبدأ، مقصد و تاریخ</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="col-span-2">
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">تاریخ انتقال (شمسی)</label>
                <JalaliDatePicker value={form.transferDate || ""} onChange={(v) => set("transferDate", v)} placeholder="۱۴۰۳/۰۱/۱۵" />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">از رده مبدأ <span className="text-red-500">*</span></label>
                <select value={form.fromServiceUnit || ""} onChange={(e) => set("fromServiceUnit", e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100">
                  <option value="">— انتخاب رده مبدأ —</option>
                  {unitOptions.map((u) => <option key={"f-" + u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">به رده مقصد <span className="text-red-500">*</span></label>
                <select value={form.toServiceUnit || ""} onChange={(e) => set("toServiceUnit", e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100">
                  <option value="">— انتخاب رده مقصد —</option>
                  {unitOptions.map((u) => <option key={"t-" + u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 2: اطلاعات سند ── */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">📄 اطلاعات سند و تاییدات</div>
            <div className="grid grid-cols-2 gap-2">
              {fields.map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">{label}</label>
                  <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder={label} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100" />
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 3: وضعیت و توضیحات ── */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">📌 وضعیت و توضیحات</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">وضعیت انتقال</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100">
                  <option value="پیش‌نویس">📝 پیش‌نویس</option>
                  <option value="تایید شده">✅ تایید شده</option>
                  <option value="لغو شده">❌ لغو شده</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">توضیحات</label>
              <textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="توضیحات تکمیلی..." className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none dark:text-slate-100" />
            </div>
          </div>

          {/* ── Action Button ── */}
          <button onClick={save} disabled={saving} className="w-full bg-gradient-to-l from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg py-2.5 shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> در حال ذخیره...</> : isEdit ? "💾 ذخیره تغییرات" : "✅ ثبت انتقال"}
          </button>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors">بستن</button>
        </div>
      </div>
    </div>
  );
}
