import { getSoldier } from "@/lib/soldier-service";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { serviceAdjustments, transfers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  v,
  DocPage,
  Bismillah,
  DocHeader,
  SectionTitle,
  Signatures,
  DocFooter,
} from "@/lib/doc-utils";
import {
  isoToJalali,
  toFaDigits,
  todayJalali,
  jalaliToDate,
  toEnDigits,
} from "@/lib/jalali";
import { computeBaseServiceEnd, LEGAL_SERVICE_DAYS } from "@/lib/service-date";
import { getServiceStatus } from "@/lib/service-status";

export const dynamic = "force-dynamic";

interface ServicePeriod {
  unitName: string;
  type: string;
  fromJalali: string;
  toJalali: string;
  days: number;
  months: number;
  extraDays: number;
  isCurrent: boolean;
  notes?: string;
}

interface TimelineEvent {
  date: string;
  rawDate: string;
  title: string;
  category: "dispatch" | "transfer" | "leave" | "absence" | "deduction" | "reward" | "milestone";
  typeLabel: string;
  days?: number;
  unit?: string;
  docNumber?: string;
  description?: string;
  color: "emerald" | "blue" | "amber" | "rose" | "indigo" | "violet" | "slate" | "teal";
}

export default async function WorkReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSoldier(Number(id));
  if (!s) notFound();

  // Load adjustments and transfers
  const adjs = await db
    .select()
    .from(serviceAdjustments)
    .where(eq(serviceAdjustments.soldierId, Number(id)))
    .orderBy(asc(serviceAdjustments.id));

  const trs = await db
    .select()
    .from(transfers)
    .where(eq(transfers.soldierId, Number(id)))
    .orderBy(asc(transfers.id));

  const fullName = [v(s, "firstName"), v(s, "lastName")].filter(Boolean).join(" ");
  const nationalCode = v(s, "nationalCode") || "نامشخص";
  const dispatchDate = s.dispatchDate || s.serviceStartDate;
  const dispatchJalali = dispatchDate ? isoToJalali(dispatchDate) : "—";
  const serviceEndDate = s.serviceEndDate;
  const serviceEndJalali = serviceEndDate ? isoToJalali(serviceEndDate) : "—";
  const todayStr = todayJalali();

  // ════════════════════════════════════════════════════════════════════
  // ۱. محاسبه بازه‌های زمانی حضور در رده‌های خدمتی (از اول تا کنون)
  // ════════════════════════════════════════════════════════════════════
  const periods: ServicePeriod[] = [];
  const validTransfers = trs.filter((t) => t.status !== "لغو شده");

  function calcDiffDays(startJ: string, endJ: string): number {
    try {
      const d1 = jalaliToDate(startJ);
      const d2 = jalaliToDate(endJ);
      if (d1 && d2) {
        return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  if (validTransfers.length === 0) {
    // فقط در یک رده خدمتی بوده است
    const startJ = dispatchJalali !== "—" ? dispatchJalali : todayStr;
    const endJ = serviceEndDate && s.serviceEndDate && new Date(s.serviceEndDate) < new Date()
      ? serviceEndJalali
      : todayStr;
    const diff = calcDiffDays(startJ, endJ);
    periods.push({
      unitName: v(s, "serviceUnit") || "رده خدمتی پیش‌فرض",
      type: "استقرار دائم (یگان پایه)",
      fromJalali: startJ,
      toJalali: endJ,
      days: diff,
      months: Math.floor(diff / 30),
      extraDays: diff % 30,
      isCurrent: true,
      notes: "از بدو اعزام تا کنون بدون جابجایی",
    });
  } else {
    // دارای سوابق انتقال یا ماموریت
    let prevDate = dispatchJalali !== "—" ? dispatchJalali : isoToJalali(validTransfers[0].transferDate || todayStr);
    let prevUnit = validTransfers[0].fromServiceUnit || v(s, "serviceUnit") || "رده اعزام اولیه";

    // رده اولیه قبل از اولین انتقال
    const firstTrDate = isoToJalali(validTransfers[0].transferDate || validTransfers[0].missionStartDate || todayStr);
    if (firstTrDate !== prevDate) {
      const diff = calcDiffDays(prevDate, firstTrDate);
      periods.push({
        unitName: prevUnit,
        type: "یگان اولیه اعزام",
        fromJalali: prevDate,
        toJalali: firstTrDate,
        days: diff,
        months: Math.floor(diff / 30),
        extraDays: diff % 30,
        isCurrent: false,
        notes: "حضور تا زمان صدور اولین حکم انتقال",
      });
      prevDate = firstTrDate;
    }

    // بازه‌های انتقالات
    for (let i = 0; i < validTransfers.length; i++) {
      const t = validTransfers[i];
      const curUnit = t.toServiceUnit || "رده نامشخص";
      const startDate = isoToJalali(t.transferDate || t.missionStartDate || prevDate);
      const isLast = i === validTransfers.length - 1;
      const nextDate = isLast
        ? (t.missionEndDate ? isoToJalali(t.missionEndDate) : todayStr)
        : isoToJalali(validTransfers[i + 1].transferDate || validTransfers[i + 1].missionStartDate || todayStr);

      const diff = calcDiffDays(startDate, nextDate);
      periods.push({
        unitName: curUnit,
        type: t.transferType || "انتقال دائم",
        fromJalali: startDate,
        toJalali: nextDate,
        days: diff,
        months: Math.floor(diff / 30),
        extraDays: diff % 30,
        isCurrent: isLast && (!t.missionEndDate || t.transferType !== "مامور"),
        notes: t.transferReason ? `علت: ${t.transferReason}` : (t.transferType === "مامور" ? "مأموریت موقت" : "انتقال قطعی"),
      });
      prevDate = nextDate;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ۲. تحلیل مرخصی‌ها (استحقاقی، استعلاجی، تشویقی - استفاده شده و نشده)
  // ════════════════════════════════════════════════════════════════════
  const meta = (s.metadata as Record<string, unknown>) || {};
  const registeredLeaves: Array<{
    id: string;
    type: string;
    status: "استفاده شده" | "استفاده نشده";
    days: number;
    startDate: string | null;
    endDate: string | null;
    docNumber: string | null;
    approver: string | null;
    description: string | null;
  }> = Array.isArray(meta.leaves) ? (meta.leaves as any[]) : [];
  const quotas = (meta.leaveQuota as Record<string, number>) || {};

  // خواندن مقادیر ثابت یا metadata
  const rawEligibleField = Number(meta.leaveEligible ?? s.leaveTypes ?? 0) || 0;
  const rawMedicalField = Number(meta.leaveMedical ?? 0) || 0;
  const rawIncentiveField = Number(meta.leaveIncentive ?? 0) || 0;

  let adjEligibleDays = 0;
  let adjMedicalDays = 0;
  let adjIncentiveDays = 0;
  let adjAbsenceDays = 0;
  let adjServiceGapDays = 0;
  let adjPenaltyDays = 0;
  let adjDeductionDays = 0;

  const leaveRecords: Array<{
    type: string;
    status: "استفاده شده" | "استفاده نشده";
    days: number;
    date: string;
    endDate?: string;
    doc: string;
    approver?: string;
    desc: string;
  }> = [];

  const absenceRecords: Array<{
    type: string;
    days: number;
    date: string;
    doc: string;
    desc: string;
    penalty: number;
  }> = [];

  // ۱. اضافه کردن مرخصی‌های ثبت‌شده در بخش مرخصی (metadata.leaves)
  if (registeredLeaves.length > 0) {
    for (const l of registeredLeaves) {
      const isUsed = l.status === "استفاده شده";
      const days = Number(l.days) || 0;
      const dateStr = l.startDate ? toFaDigits(isoToJalali(l.startDate)) : "—";
      const endDateStr = l.endDate ? toFaDigits(isoToJalali(l.endDate)) : undefined;
      const doc = l.docNumber || "—";
      const approver = l.approver || "—";
      const desc = l.description || "—";

      if (l.type.includes("استحقاق")) {
        if (isUsed) adjEligibleDays += days;
      } else if (l.type.includes("استعلاج") || l.type.includes("پزشکی")) {
        if (isUsed) adjMedicalDays += days;
      } else if (l.type.includes("تشویق")) {
        if (isUsed) adjIncentiveDays += days;
      }

      leaveRecords.push({
        type: l.type,
        status: l.status,
        days,
        date: dateStr,
        endDate: endDateStr,
        doc,
        approver,
        desc,
      });
    }
  }

  // ۲. استخراج غیبت‌ها، خلا خدمتی، کسری‌ها و اضافه خدمت از adjustments (مرخصی‌ها کاملاً در بخش مرخصی مستقل هستند)
  for (const a of adjs) {
    const t = a.type || "";
    // اگر رکوردی از مرخصی‌ها در adjustments بود نادیده گرفته می‌شود
    if (t.includes("مرخصی") || t.includes("استحقاق") || t.includes("استعلاج") || t.includes("تشویق")) {
      continue;
    }
    const days = Number(a.days) || 0;
    const dateStr = a.effectiveDate ? toFaDigits(isoToJalali(a.effectiveDate)) : "—";
    const doc = a.legalDocumentNumber || "—";
    const desc = a.description || a.title || "—";

    if (t.includes("غیبت")) {
      adjAbsenceDays += days;
      const penalty = a.effectDirection === "increase" ? days : 0;
      adjPenaltyDays += penalty;
      absenceRecords.push({ type: "غیبت غیرموجه", days, date: dateStr, doc, desc, penalty });
    } else if (t.includes("خلا") || t.includes("فرار")) {
      adjServiceGapDays += days;
      const penalty = a.effectDirection === "increase" ? days : 0;
      adjPenaltyDays += penalty;
      absenceRecords.push({ type: t.includes("فرار") ? "فرار از خدمت" : "خلاء خدمتی", days, date: dateStr, doc, desc, penalty });
    } else if (t.includes("اضافه")) {
      adjPenaltyDays += days;
      absenceRecords.push({ type: "اضافه‌خدمت انضباطی", days, date: dateStr, doc, desc, penalty: days });
    } else if (a.effectDirection === "decrease" && !t.includes("استحقاق")) {
      adjDeductionDays += days;
    }
  }

  // محاسبات تجمیعی مرخصی‌ها
  const totalEligibleUsed = adjEligibleDays > 0 ? adjEligibleDays : rawEligibleField;
  const totalMedicalUsed = adjMedicalDays > 0 ? adjMedicalDays : rawMedicalField;
  const totalIncentiveUsed = adjIncentiveDays > 0 ? adjIncentiveDays : rawIncentiveField;

  // سهمیه‌ها
  const isMarried = s.maritalStatus === "متاهل";
  const defaultEligibleQuota = isMarried ? 36 : 30;
  const standardEligibleTotal = quotas.eligibleQuota && quotas.eligibleQuota > 0 ? quotas.eligibleQuota : defaultEligibleQuota;
  const eligibleRemaining = Math.max(0, standardEligibleTotal - totalEligibleUsed);

  const standardMedicalTotal = quotas.medicalQuota && quotas.medicalQuota > 0 ? quotas.medicalQuota : 30;
  const medicalRemaining = Math.max(0, standardMedicalTotal - totalMedicalUsed);

  // غیبت اولیه برگ اعزام (در صورت وجود)
  const dispatchAbsence = Number(toEnDigits(String(s.absenceDuration || "0")).replace(/[^0-9]/g, "")) || 0;
  const dispatchExtra = Number(toEnDigits(String(s.extraServiceOnDispatch || "0")).replace(/[^0-9]/g, "")) || 0;
  if (dispatchAbsence > 0) {
    absenceRecords.unshift({
      type: "غیبت ثبت‌شده در برگ اعزام",
      days: dispatchAbsence,
      date: dispatchJalali,
      doc: v(s, "dispatchOffice") || "برگ اعزام",
      desc: "غیبت اولیه ورود به خدمت",
      penalty: dispatchExtra,
    });
  }

  const totalAbsenceDays = adjAbsenceDays + adjServiceGapDays + dispatchAbsence;
  const totalPenalties = adjPenaltyDays + dispatchExtra;

  // ════════════════════════════════════════════════════════════════════
  // ۳. تولید تایم‌لاین کامل به ترتیب تاریخ (از اول خدمت تا کنون)
  // ════════════════════════════════════════════════════════════════════
  const timeline: TimelineEvent[] = [];

  // نقطه ۱: اعزام به خدمت
  if (dispatchDate) {
    timeline.push({
      date: dispatchJalali,
      rawDate: dispatchDate,
      title: "اعزام رسمی به خدمت مقدس وظیفه عمومی",
      category: "dispatch",
      typeLabel: "شروع دوره خدمت",
      unit: periods[0]?.unitName || v(s, "serviceUnit") || "مرکز آموزش",
      description: `اعزام با درجه ${v(s, "rank") || "سرباز"} و مدرک تحصیلی ${v(s, "educationLevel") || "دیپلم"}`,
      color: "emerald",
    });
  }

  // نقطه‌های انتقالات
  for (const t of validTransfers) {
    const d = t.transferDate || t.missionStartDate;
    if (d) {
      timeline.push({
        date: isoToJalali(d),
        rawDate: d,
        title: `${t.transferType || "انتقال"} به رده «${t.toServiceUnit}»`,
        category: "transfer",
        typeLabel: t.transferType || "انتقال",
        unit: `${t.fromServiceUnit || "مبدأ"} ← ${t.toServiceUnit}`,
        docNumber: t.documentNumber || undefined,
        description: t.transferReason ? `علت: ${t.transferReason}` : undefined,
        color: "indigo",
      });
    }
  }

  // نقطه‌های مرخصی‌ها
  for (const l of leaveRecords) {
    const isUnused = l.status === "استفاده نشده";
    timeline.push({
      date: l.date,
      rawDate: l.date,
      title: isUnused
        ? `ثبت سهمیه/طلب ${l.type} به مدت ${toFaDigits(l.days)} روز (${l.status})`
        : `استفاده از ${l.type} به مدت ${toFaDigits(l.days)} روز (${l.status})`,
      category: "leave",
      typeLabel: `${l.type} (${l.status})`,
      days: l.days,
      docNumber: l.doc !== "—" ? l.doc : undefined,
      description: l.desc !== "—" ? l.desc : undefined,
      color: isUnused ? "violet" : l.type.includes("تشویقی") ? "emerald" : l.type.includes("استعلاجی") ? "amber" : "blue",
    });
  }

  // نقطه‌های غیبت‌ها و خلاهای خدمتی
  for (const ab of absenceRecords) {
    timeline.push({
      date: ab.date,
      rawDate: ab.date,
      title: `ثبت ${ab.type} به مدت ${toFaDigits(ab.days)} روز`,
      category: "absence",
      typeLabel: ab.type,
      days: ab.days,
      docNumber: ab.doc !== "—" ? ab.doc : undefined,
      description: ab.penalty > 0 ? `اضافه‌خدمت مصوب: ${toFaDigits(ab.penalty)} روز • ${ab.desc}` : ab.desc,
      color: "rose",
    });
  }

  // نقطه‌های کسری‌های خدمت
  for (const a of adjs) {
    if (a.effectDirection === "decrease" && !a.type.includes("استحقاق")) {
      const d = a.effectiveDate ? isoToJalali(a.effectiveDate) : todayStr;
      timeline.push({
        date: d,
        rawDate: a.effectiveDate || todayStr,
        title: `اعمال ${a.type} به میزان ${toFaDigits(a.days)} روز`,
        category: "deduction",
        typeLabel: "کسری خدمت",
        days: a.days,
        docNumber: a.legalDocumentNumber || undefined,
        description: a.description || undefined,
        color: "teal",
      });
    }
  }

  // مرتب‌سازی تایم‌لاین بر اساس تاریخ
  timeline.sort((a, b) => {
    try {
      const d1 = jalaliToDate(a.date);
      const d2 = jalaliToDate(b.date);
      if (d1 && d2) return d1.getTime() - d2.getTime();
    } catch {
      /* ignore */
    }
    return a.date.localeCompare(b.date);
  });

  // محاسبات روزهای کل خدمت
  let daysServed = 0;
  let daysLeft: number | null = null;
  if (dispatchDate) {
    try {
      const startD = jalaliToDate(dispatchDate);
      const nowD = new Date();
      if (startD) {
        daysServed = Math.max(0, Math.round((nowD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)));
      }
      if (serviceEndDate) {
        const endD = jalaliToDate(serviceEndDate);
        if (endD) {
          daysLeft = Math.round((endD.getTime() - nowD.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
    } catch {
      /* ignore */
    }
  }

  const isDischarged = getServiceStatus(s.serviceEndDate) === "تسویه شده" || (daysLeft !== null && daysLeft <= 0);

  // گروه‌بندی سلسله‌مراتبی تایم‌لاین بر اساس رده‌های خدمتی (Indented Stepped Timeline)
  interface PeriodTimelineGroup {
    period: (typeof periods)[0];
    index: number;
    events: TimelineEvent[];
  }

  const periodGroups: PeriodTimelineGroup[] = periods.map((p, idx) => ({
    period: p,
    index: idx,
    events: [],
  }));

  if (periodGroups.length === 0) {
    periodGroups.push({
      period: {
        unitName: v(s, "serviceUnit") || "رده خدمتی فعلی",
        type: "دوره خدمت",
        fromJalali: dispatchJalali || todayStr,
        toJalali: serviceEndJalali || todayStr,
        days: daysServed || 0,
        months: Math.floor((daysServed || 0) / 30),
        extraDays: (daysServed || 0) % 30,
        isCurrent: true,
        notes: "",
      },
      index: 0,
      events: [...timeline],
    });
  } else {
    for (const ev of timeline) {
      let matchedIndex = -1;
      try {
        const evDate = jalaliToDate(ev.date);
        if (evDate) {
          const t = evDate.getTime();
          for (let i = 0; i < periodGroups.length; i++) {
            const p = periodGroups[i].period;
            const fromD = jalaliToDate(p.fromJalali);
            const toD = jalaliToDate(p.toJalali);
            if (fromD && toD) {
              if (t >= fromD.getTime() && t <= toD.getTime()) {
                matchedIndex = i;
                break;
              }
            }
          }
        }
      } catch {
        /* ignore */
      }

      if (matchedIndex === -1) {
        if (ev.category === "dispatch") {
          matchedIndex = 0;
        } else if (ev.unit) {
          const found = periodGroups.findIndex((g) => ev.unit?.includes(g.period.unitName));
          matchedIndex = found !== -1 ? found : periodGroups.length - 1;
        } else {
          matchedIndex = periodGroups.length - 1;
        }
      }

      periodGroups[matchedIndex].events.push(ev);
    }
  }

  return (
    <DocPage
      filename={`${nationalCode}-گزارش-کار-${fullName || "سرباز"}`}
      formLabel="گزارش کار و سوابق جامع"
    >
      <Bismillah />

      {/* Header */}
      <DocHeader
        code="جمهوری اسلامی ایران — ستاد کل نیروهای مسلح / سپاه پاسداران"
        doctype="گزارش کار و کارنامه جامع عملکرد سرباز وظیفه"
        subtitle="سوابق حضور در رده‌ها، کارکرد مرخصی‌ها، غیبت‌ها، خلا خدمتی و تایم‌لاین رویدادها"
        formNo="فرم شماره ۷ — گزارش کارکرد پرسنلی"
        leftItems={[
          { label: "شماره پرسنلی", value: v(s, "personnelCode") || "—" },
          { label: "شماره پرونده", value: v(s, "fileNumber") || "—" },
          { label: "تاریخ گزارش", value: todayStr },
        ]}
        rightItems={[
          { label: "کد ملی", value: nationalCode },
          { label: "رده فعلی", value: v(s, "serviceUnit") || "—" },
          { label: "وضعیت پرسنل", value: isDischarged ? "تسویه شده / خاتمه خدمت" : "در حال خدمت" },
        ]}
      />

      {/* Identity bar */}
      <div className="bg-slate-100/90 border border-slate-300 rounded p-2.5 mb-3 text-[10.5px]">
        <div className="grid grid-cols-4 gap-2">
          <div>
            <span className="text-slate-500 ml-1">نام و نام خانوادگی:</span>
            <span className="font-extrabold text-slate-900">{fullName || "—"}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">نام پدر:</span>
            <span className="font-bold text-slate-800">{v(s, "fatherName")}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">درجه نظامی:</span>
            <span className="font-extrabold text-emerald-800">{v(s, "rank")}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">تحصیلات:</span>
            <span className="font-bold text-slate-800">{v(s, "educationLevel")}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">تاریخ اعزام:</span>
            <span className="font-mono font-bold text-slate-900">{dispatchJalali}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">پایان خدمت مؤثر:</span>
            <span className="font-mono font-bold text-emerald-800">{serviceEndJalali}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">وضعیت تاهل:</span>
            <span className="font-bold text-slate-800">{v(s, "maritalStatus")}</span>
          </div>
          <div>
            <span className="text-slate-500 ml-1">نوع عضویت:</span>
            <span className="font-bold text-slate-800">{v(s, "membershipType") || "وظیفه"}</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* بخش اول: بازه زمانی حضور در رده‌های خدمتی از اول خدمت تا زمان فعلی */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionTitle number={1} title="سوابق و بازه زمانی حضور در رده‌های خدمتی (از بدو خدمت تا زمان فعلی)" />
      <div className="mb-3 overflow-hidden border border-slate-300 rounded text-[10px]">
        <table className="w-full text-right">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
            <tr>
              <th className="p-1.5 text-center w-8">ردیف</th>
              <th className="p-1.5 font-bold">نام رده خدمتی</th>
              <th className="p-1.5 text-center font-bold">نوع حضور</th>
              <th className="p-1.5 text-center font-bold">از تاریخ</th>
              <th className="p-1.5 text-center font-bold">تا تاریخ</th>
              <th className="p-1.5 text-center font-bold">مدت حضور</th>
              <th className="p-1.5 text-center font-bold">وضعیت دوره</th>
              <th className="p-1.5">ملاحظات و توضیحات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {periods.map((p, idx) => (
              <tr key={idx} className={p.isCurrent ? "bg-emerald-50/70 font-semibold" : "bg-white"}>
                <td className="p-1.5 text-center font-mono text-slate-500">{toFaDigits(idx + 1)}</td>
                <td className="p-1.5 font-bold text-slate-900 flex items-center gap-1">
                  <span>🏢 {p.unitName}</span>
                  {p.isCurrent && (
                    <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-extrabold">
                      رده فعلی
                    </span>
                  )}
                </td>
                <td className="p-1.5 text-center text-slate-700">{p.type}</td>
                <td className="p-1.5 text-center font-mono text-slate-800">{toFaDigits(p.fromJalali)}</td>
                <td className="p-1.5 text-center font-mono text-slate-800">{toFaDigits(p.toJalali)}</td>
                <td className="p-1.5 text-center font-bold text-emerald-800">
                  {p.months > 0 ? `${toFaDigits(p.months)} ماه و ` : ""}
                  {toFaDigits(p.extraDays)} روز
                  <span className="text-slate-400 font-normal mr-1">({toFaDigits(p.days)} روز)</span>
                </td>
                <td className="p-1.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                    p.isCurrent ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600"
                  }`}>
                    {p.isCurrent ? "در حال خدمت" : "خاتمه یافته (انتقال)"}
                  </span>
                </td>
                <td className="p-1.5 text-slate-500 text-[9.5px]">{p.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* بخش دوم: تایم‌لاین سلسله‌مراتبی و پله‌ای رده‌های خدمتی و رویدادها (Indented Timeline) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionTitle number={2} title="تایم‌لاین رویدادها و سوابق خدمتی (ساختار پله‌ای به تفکیک رده‌های خدمتی — Indented Timeline)" />
      <div className="mb-4 bg-slate-50/70 border border-slate-300 rounded-lg p-3 text-[10px]">
        {periodGroups.length === 0 ? (
          <div className="text-center text-slate-400 py-3">رویداد ثبت‌شده‌ای در پرونده وجود ندارد.</div>
        ) : (
          <div className="relative space-y-4">
            {periodGroups.map((group, gIdx) => {
              const p = group.period;
              const hasEvents = group.events.length > 0;

              return (
                <div key={gIdx} className="relative">
                  {/* خط اتصال عمودی بیرونی بین رده‌ها */}
                  {gIdx < periodGroups.length - 1 && (
                    <div className="absolute right-[11px] top-7 bottom-0 w-0.5 bg-indigo-300" />
                  )}

                  {/* گره اصلی رده خدمتی (عقب‌تر / ستون اصلی سمت راست) */}
                  <div className="flex items-start gap-2.5">
                    <div className="relative z-10 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold shadow-xs shrink-0 ring-4 ring-indigo-50">
                      🏢
                    </div>
                    <div className="flex-1 bg-gradient-to-l from-indigo-50/90 to-slate-50 border border-indigo-200 rounded-md p-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-indigo-950 text-[11px]">
                            رده خدمتی: {p.unitName}
                          </span>
                          <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded font-bold border border-indigo-200">
                            {p.type}
                          </span>
                          {p.isCurrent && (
                            <span className="bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                              رده فعلی
                            </span>
                          )}
                        </div>
                        <div className="text-[9.5px] font-mono text-slate-600 flex items-center gap-1.5">
                          <span>بازه: <b>{toFaDigits(p.fromJalali)}</b> تا <b>{toFaDigits(p.toJalali)}</b></span>
                          <span className="text-indigo-800 font-bold">({toFaDigits(p.days)} روز)</span>
                        </div>
                      </div>
                      {p.notes && (
                        <div className="text-[9px] text-slate-500 mt-1">ملاحظات دوره: {p.notes}</div>
                      )}
                    </div>
                  </div>

                  {/* انشعاب پله‌ای جلوتر برای رویدادهای داخل این رده (Indented Stepped Branch) */}
                  <div className="mr-3 pr-5 my-2 border-r-2 border-dashed border-emerald-400 space-y-2">
                    {hasEvents ? (
                      group.events.map((ev, evIdx) => {
                        const badgeColors: Record<string, string> = {
                          emerald: "bg-emerald-100 text-emerald-900 border-emerald-300",
                          blue: "bg-blue-100 text-blue-900 border-blue-300",
                          amber: "bg-amber-100 text-amber-900 border-amber-300",
                          rose: "bg-rose-100 text-rose-900 border-rose-300",
                          indigo: "bg-indigo-100 text-indigo-900 border-indigo-300",
                          violet: "bg-violet-100 text-violet-900 border-violet-300",
                          slate: "bg-slate-100 text-slate-800 border-slate-300",
                          teal: "bg-teal-100 text-teal-900 border-teal-300",
                        };
                        const dotColors: Record<string, string> = {
                          emerald: "bg-emerald-500",
                          blue: "bg-blue-500",
                          amber: "bg-amber-500",
                          rose: "bg-rose-500",
                          indigo: "bg-indigo-600",
                          violet: "bg-violet-600",
                          slate: "bg-slate-500",
                          teal: "bg-teal-500",
                        };

                        return (
                          <div key={evIdx} className="relative flex items-start gap-2">
                            {/* نقطه پله‌ای گره داخلی */}
                            <span
                              className={`absolute -right-[25px] top-2 w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-slate-200 ${
                                dotColors[ev.color] || "bg-emerald-500"
                              }`}
                            />
                            {/* تاریخ */}
                            <div className="w-20 shrink-0 font-mono font-bold text-slate-600 pt-1 text-[9.5px]">
                              {toFaDigits(ev.date)}
                            </div>
                            {/* کارت تغییرات داخل رده */}
                            <div className="flex-1 bg-white border border-slate-200 rounded p-1.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-[10px] flex items-center gap-1">
                                  <span>↳</span>
                                  <span>{ev.title}</span>
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded-full border text-[8.5px] font-bold ${
                                    badgeColors[ev.color] || "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {ev.typeLabel}
                                </span>
                              </div>
                              {(ev.docNumber || ev.description || (ev.unit && ev.unit !== p.unitName)) && (
                                <div className="text-slate-600 text-[9px] space-y-0.5 mt-0.5 mr-3">
                                  {ev.unit && ev.unit !== p.unitName && (
                                    <div>مسیر رده: <span className="font-bold">{ev.unit}</span></div>
                                  )}
                                  {ev.docNumber && (
                                    <div>شماره دستور/سند: <span className="font-mono font-bold">{toFaDigits(ev.docNumber)}</span></div>
                                  )}
                                  {ev.description && (
                                    <div className="text-slate-500">{ev.description}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[9px] text-slate-400 py-1 italic flex items-center gap-1">
                        <span>▫️</span>
                        <span>در این بازه زمانی، تغییر انضباطی یا مرخصی خاصی ثبت نشده است (روال عادی خدمت).</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* بخش سوم: تفکیک و آمار مرخصی‌ها (استحقاقی، استعلاجی، تشویقی) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionTitle number={3} title="آمار و تفکیک مرخصی‌ها (استحقاقی / استعلاجی / تشویقی — استفاده شده و مانده)" />
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        {/* استحقاقی */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-extrabold text-blue-900 text-[11px]">🌴 مرخصی استحقاقی</span>
            <span className="text-[9.5px] text-blue-700 font-bold">۲.۵ روز در ماه</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center font-mono">
            <div className="bg-white p-1 rounded border border-blue-100">
              <div className="text-[9px] text-slate-400 font-sans">سهمیه کل</div>
              <div className="text-sm font-extrabold text-slate-800">{toFaDigits(standardEligibleTotal)}</div>
            </div>
            <div className="bg-white p-1 rounded border border-blue-100">
              <div className="text-[9px] text-slate-400 font-sans">استفاده شده</div>
              <div className="text-sm font-extrabold text-blue-700">{toFaDigits(totalEligibleUsed)}</div>
            </div>
            <div className="bg-white p-1 rounded border border-blue-100">
              <div className="text-[9px] text-slate-400 font-sans">استفاده‌نشده</div>
              <div className="text-sm font-extrabold text-emerald-700">{toFaDigits(eligibleRemaining)}</div>
            </div>
          </div>
          <div className="text-[9px] text-blue-800 mt-1 text-center">
            {eligibleRemaining > 0 ? `طلب مرخصی جهت تسویه حساب: ${toFaDigits(eligibleRemaining)} روز` : "سهمیه استحقاقی تمام شده است"}
          </div>
        </div>

        {/* استعلاجی */}
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-extrabold text-amber-900 text-[11px]">🏥 مرخصی استعلاجی</span>
            <span className="text-[9.5px] text-amber-700 font-bold">با تاییدیه پزشک</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center font-mono">
            <div className="bg-white p-1 rounded border border-amber-100">
              <div className="text-[9px] text-slate-400 font-sans">سقف مجاز</div>
              <div className="text-sm font-extrabold text-slate-800">{toFaDigits(standardMedicalTotal)}</div>
            </div>
            <div className="bg-white p-1 rounded border border-amber-100">
              <div className="text-[9px] text-slate-400 font-sans">استفاده شده</div>
              <div className="text-sm font-extrabold text-amber-700">{toFaDigits(totalMedicalUsed)}</div>
            </div>
            <div className="bg-white p-1 rounded border border-amber-100">
              <div className="text-[9px] text-slate-400 font-sans">مانده مجاز</div>
              <div className="text-sm font-extrabold text-slate-700">{toFaDigits(medicalRemaining)}</div>
            </div>
          </div>
          <div className="text-[9px] text-amber-800 mt-1 text-center">
            {totalMedicalUsed > 0 ? `تعداد ${toFaDigits(totalMedicalUsed)} روز استعلاجی تایید شده` : "فاقد مرخصی استعلاجی"}
          </div>
        </div>

        {/* تشویقی */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-extrabold text-emerald-900 text-[11px]">🎖️ مرخصی تشویقی</span>
            <span className="text-[9.5px] text-emerald-700 font-bold">حسن خدمت</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-center font-mono">
            <div className="bg-white p-1 rounded border border-emerald-100">
              <div className="text-[9px] text-slate-400 font-sans">اعطا شده</div>
              <div className="text-sm font-extrabold text-emerald-700">{toFaDigits(totalIncentiveUsed)}</div>
            </div>
            <div className="bg-white p-1 rounded border border-emerald-100">
              <div className="text-[9px] text-slate-400 font-sans">اثر بر پایان</div>
              <div className="text-xs font-bold text-slate-600 font-sans pt-1">بدون کسر</div>
            </div>
          </div>
          <div className="text-[9px] text-emerald-800 mt-1 text-center">
            {totalIncentiveUsed > 0 ? `${toFaDigits(totalIncentiveUsed)} روز تشویقی فرماندهی` : "تشویقی ثبت نشده"}
          </div>
        </div>
      </div>

      {/* جدول ریز سوابق انواع مرخصی‌های ثبت‌شده (استفاده شده و نشده) */}
      <div className="mb-3 border border-slate-300 rounded overflow-hidden text-[10px]">
        <div className="bg-slate-100 px-3 py-1 font-bold text-slate-700 border-b border-slate-300 flex items-center justify-between">
          <span>📋 فهرست ریز سوابق انواع مرخصی‌های ثبت‌شده (استفاده شده و نشده)</span>
          <span className="text-[9px] text-slate-500 font-mono">
            مجموع سوابق: {toFaDigits(leaveRecords.length)} مورد
          </span>
        </div>
        {leaveRecords.length === 0 ? (
          <div className="p-2.5 text-center text-slate-400 bg-white">
            هیچ سابقه مرخصی انفرادی برای این سرباز در پرونده ثبت نشده است.
          </div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="p-1.5 text-center w-8">ردیف</th>
                <th className="p-1.5 font-bold">نوع مرخصی</th>
                <th className="p-1.5 text-center font-bold">وضعیت بهره‌برداری</th>
                <th className="p-1.5 text-center font-bold">مدت (روز)</th>
                <th className="p-1.5 text-center font-bold">از تاریخ</th>
                <th className="p-1.5 text-center font-bold">تا تاریخ</th>
                <th className="p-1.5 text-center font-bold">شماره برگه/مجوز</th>
                <th className="p-1.5 text-center font-bold">مرجع تایید</th>
                <th className="p-1.5">شرح و علت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {leaveRecords.map((lr, idx) => {
                const isUsed = lr.status === "استفاده شده";
                return (
                  <tr key={idx} className={isUsed ? "hover:bg-slate-50" : "bg-blue-50/40 hover:bg-blue-50"}>
                    <td className="p-1.5 text-center font-mono text-slate-500">{toFaDigits(idx + 1)}</td>
                    <td className="p-1.5 font-bold text-slate-900">{lr.type}</td>
                    <td className="p-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        isUsed
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-blue-100 text-blue-900 border-blue-300"
                      }`}>
                        {lr.status}
                      </span>
                    </td>
                    <td className="p-1.5 text-center font-extrabold font-mono text-slate-800">
                      {toFaDigits(lr.days)} روز
                    </td>
                    <td className="p-1.5 text-center font-mono text-slate-700">{lr.date}</td>
                    <td className="p-1.5 text-center font-mono text-slate-700">{lr.endDate || "—"}</td>
                    <td className="p-1.5 text-center font-mono text-slate-600">{lr.doc}</td>
                    <td className="p-1.5 text-center text-slate-600">{lr.approver || "—"}</td>
                    <td className="p-1.5 text-slate-700">{lr.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* بخش چهارم: آمار غیبت‌ها و خلا خدمتی همراه با ذکر تاریخ هر کدام */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionTitle number={4} title="آمار غیبت‌ها و خلا خدمتی (همراه با ذکر تاریخ وقوع و اثر انضباطی)" />
      <div className="mb-3 border border-slate-300 rounded overflow-hidden text-[10px]">
        {absenceRecords.length === 0 ? (
          <div className="p-3 bg-emerald-50/60 text-emerald-800 text-center font-bold flex items-center justify-center gap-2">
            <span>✅ پرسنل فاقد هرگونه غیبت غیرموجه، خلاء خدمتی، فرار یا اضافه‌خدمت انضباطی در پرونده می‌باشد. (وضعیت انضباطی: عالی)</span>
          </div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-rose-50 text-rose-900 border-b border-rose-200">
              <tr>
                <th className="p-1.5 text-center w-8">ردیف</th>
                <th className="p-1.5 font-bold">نوع رویداد انضباطی</th>
                <th className="p-1.5 text-center font-bold">تاریخ وقوع / ثبت</th>
                <th className="p-1.5 text-center font-bold">مدت غیبت (روز)</th>
                <th className="p-1.5 text-center font-bold">اضافه‌خدمت مصوب</th>
                <th className="p-1.5 text-center font-bold">مستند قانونی / حکم</th>
                <th className="p-1.5">شرح و وضعیت رسیدگی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {absenceRecords.map((ab, idx) => (
                <tr key={idx} className="bg-rose-50/30">
                  <td className="p-1.5 text-center font-mono text-slate-500">{toFaDigits(idx + 1)}</td>
                  <td className="p-1.5 font-bold text-rose-900">{ab.type}</td>
                  <td className="p-1.5 text-center font-mono text-slate-800">{toFaDigits(ab.date)}</td>
                  <td className="p-1.5 text-center font-bold text-rose-800">{toFaDigits(ab.days)} روز</td>
                  <td className="p-1.5 text-center font-bold text-rose-900">
                    {ab.penalty > 0 ? `+${toFaDigits(ab.penalty)} روز` : "—"}
                  </td>
                  <td className="p-1.5 text-center text-slate-600 font-mono">{toFaDigits(ab.doc)}</td>
                  <td className="p-1.5 text-slate-700">{ab.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* بخش پنجم: خلاصه مجموع اطلاعات در آخر گزارش */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionTitle number={5} title="خلاصه تجمیعی و نتیجه‌گیری کارکرد کل دوره خدمت (مجموع اطلاعات)" />
      <div className="bg-gradient-to-l from-slate-100 to-slate-50 border-2 border-slate-300 rounded-lg p-3 mb-4 text-[10px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2.5">
          <div className="bg-white p-2 rounded border border-slate-200 text-center">
            <div className="text-slate-500 text-[9px]">مدت قانونی خدمت</div>
            <div className="font-extrabold text-slate-800 text-xs mt-0.5">{toFaDigits(LEGAL_SERVICE_DAYS)} روز (۲۱ ماه)</div>
          </div>
          <div className="bg-white p-2 rounded border border-slate-200 text-center">
            <div className="text-slate-500 text-[9px]">خدمت سپری‌شده تا تاریخ</div>
            <div className="font-extrabold text-emerald-800 text-xs mt-0.5">{toFaDigits(daysServed)} روز</div>
          </div>
          <div className="bg-white p-2 rounded border border-slate-200 text-center">
            <div className="text-slate-500 text-[9px]">روزهای باقیمانده خدمت</div>
            <div className={`font-extrabold text-xs mt-0.5 ${daysLeft && daysLeft <= 0 ? "text-slate-600" : "text-indigo-800"}`}>
              {daysLeft !== null && daysLeft <= 0 ? "پایان یافته" : `${toFaDigits(daysLeft ?? 0)} روز`}
            </div>
          </div>
          <div className="bg-white p-2 rounded border border-slate-200 text-center">
            <div className="text-slate-500 text-[9px]">تعداد رده‌های طی‌شده</div>
            <div className="font-extrabold text-slate-800 text-xs mt-0.5">{toFaDigits(periods.length)} رده خدمتی</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-white p-2 rounded border border-blue-200 text-center">
            <div className="text-blue-700 text-[9px] font-bold">مجموع مرخصی استفاده‌شده</div>
            <div className="font-extrabold text-blue-900 text-xs mt-0.5">
              {toFaDigits(totalEligibleUsed + totalMedicalUsed + totalIncentiveUsed)} روز
            </div>
            <div className="text-[8.5px] text-slate-400 mt-0.5">
              (استحقاقی: {toFaDigits(totalEligibleUsed)} | استعلاجی: {toFaDigits(totalMedicalUsed)} | تشویقی: {toFaDigits(totalIncentiveUsed)})
            </div>
          </div>

          <div className="bg-white p-2 rounded border border-emerald-200 text-center">
            <div className="text-emerald-700 text-[9px] font-bold">مرخصی استحقاقی مانده</div>
            <div className="font-extrabold text-emerald-900 text-xs mt-0.5">
              {toFaDigits(eligibleRemaining)} روز
            </div>
            <div className="text-[8.5px] text-emerald-600 mt-0.5">
              قابل استفاده یا تسویه
            </div>
          </div>

          <div className="bg-white p-2 rounded border border-rose-200 text-center">
            <div className="text-rose-700 text-[9px] font-bold">مجموع غیبت و خلا خدمتی</div>
            <div className="font-extrabold text-rose-900 text-xs mt-0.5">
              {toFaDigits(totalAbsenceDays)} روز
            </div>
            <div className="text-[8.5px] text-rose-600 mt-0.5">
              اضافه‌خدمت: {toFaDigits(totalPenalties)} روز
            </div>
          </div>

          <div className="bg-white p-2 rounded border border-teal-200 text-center">
            <div className="text-teal-700 text-[9px] font-bold">کسری‌های اعمال‌شده</div>
            <div className="font-extrabold text-teal-900 text-xs mt-0.5">
              {toFaDigits(adjDeductionDays)} روز
            </div>
            <div className="text-[8.5px] text-teal-600 mt-0.5">
              پایان قطعی: {serviceEndJalali}
            </div>
          </div>
        </div>

        {/* نتیجه‌گیری انضباطی */}
        <div className="mt-2.5 pt-2 border-t border-slate-300 text-slate-700 text-[9.5px] leading-relaxed">
          <b>ارزیابی نهایی کارکرد پرسنل:</b> سوابق فوق بر اساس پرونده پرسنلی، احکام انتقالات، برگه‌های مرخصی ثبت‌شده و کارتابل انضباطی یگان استخراج گردیده و صحت کلیه اطلاعات مندرج در این گزارش کار توسط مراجع ذی‌ربط تأیید می‌گردد. پرسنل نامبرده از حیث انضباط و سوابق خدمتی دارای وضعیت <b>{totalAbsenceDays === 0 ? "مطلوب و بدون غیبت" : "مستلزم احتساب اضافه‌خدمت مقرر"}</b> ارزیابی می‌گردد.
        </div>
      </div>

      {/* امضاها */}
      <Signatures
        items={[
          { title: "مسئول امور رده خدمتی", sub: v(s, "serviceUnit") || "یگان خدمتی" },
          { title: "مسئول منابع سرباز و نیروی انسانی", sub: "مدیریت سرمایه انسانی" },
          { title: "فرمانده / معاونت نیروی انسانی", sub: "مهر و امضا نهایی" },
        ]}
      />

      <DocFooter
        left="سامانه جامع منابع سرباز — گزارش کار پرسنلی"
        right="این سند حاوی سوابق رسمی خدمت وظیفه عمومی است و استناد به آن پس از مهر و امضای مراجع معتبر است."
      />
    </DocPage>
  );
}
