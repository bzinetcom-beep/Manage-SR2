import * as jalaali from "jalaali-js";
import { addDaysIso, addMonthsIso } from "./jalali";

/**
 * مدت قانونی خدمت: ۲۱ ماه شمسی (یک سال و نه ماه).
 * مثال: اعزام ۱۴۰۴/۱۱/۰۱  →  پایان خدمت ۱۴۰۶/۰۸/۰۱
 */
export const LEGAL_SERVICE_MONTHS = 21;

/** فقط برای نمایش نمودارها (۲۱ ماه × ۳۰ روز). محاسبه‌ی تاریخ پایان دیگر بر پایه‌ی روز نیست. */
export const LEGAL_SERVICE_DAYS = 630;

export interface AdjustmentLike {
  effectDirection: string; // increase | decrease
  days: number;
}

/** هر تاریخ (شمسی یا میلادی، yyyy-mm-dd) را به «شمسی ISO» تبدیل می‌کند. */
export function toJalaliIsoString(input: string | null | undefined): string | null {
  if (!input) return null;
  const parts = String(input).split("T")[0].trim().split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  let [y, m, d] = parts;
  if (y > 1700) {
    const j = jalaali.toJalaali(y, m, d);
    y = j.jy;
    m = j.jm;
    d = j.jd;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** تاریخ را به «اول همان ماه» رُند می‌کند: ۱۴۰۵/۰۵/۲۱ → ۱۴۰۵/۰۵/۰۱ */
export function roundToMonthStart(input: string | null | undefined): string | null {
  const j = toJalaliIsoString(input);
  if (!j) return null;
  const [y, m] = j.split("-");
  return `${y}-${m}-01`;
}

/** تاریخ پایان خدمت پایه = تاریخ اعزام + ۲۱ ماه (همان روز ماه) */
export function computeBaseServiceEnd(dispatchDate: string | null | undefined): string | null {
  const j = toJalaliIsoString(dispatchDate);
  if (!j) return null;
  return addMonthsIso(j, LEGAL_SERVICE_MONTHS);
}

/**
 * محاسبه‌ی تاریخ پایان خدمت.
 *  پایه  = تاریخ اعزام + ۲۱ ماه
 *  سپس کسری‌ها کم و اضافه‌خدمت‌ها به‌صورت روز اعمال می‌شوند.
 */
export function computeServiceEndDate(
  dispatchDate: string | null | undefined,
  adjustments: AdjustmentLike[] = [],
): string | null {
  const base = computeBaseServiceEnd(dispatchDate);
  if (!base) return null;
  const net = netAdjustmentDays(adjustments);
  return net === 0 ? base : addDaysIso(base, net);
}

export function netAdjustmentDays(adjustments: AdjustmentLike[] = []): number {
  return adjustments.reduce((acc, a) => {
    const d = Number(a.days) || 0;
    return acc + (a.effectDirection === "decrease" ? -d : d);
  }, 0);
}
