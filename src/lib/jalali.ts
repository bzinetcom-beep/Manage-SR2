import * as jalaali from "jalaali-js";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFaDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function toEnDigits(input: string): string {
  if (!input) return "";
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Convert a Gregorian ISO timestamp (e.g. "2026-03-24T14:30:00Z") to a Jalali date+time string "۱۴۰۵/۰۱/۰۴ ۱۴:۳۰". */
export function isoTimestampToJalali(iso: string | null | undefined, includeTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const { jy, jm, jd } = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const dateStr = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  if (!includeTime) return toFaDigits(dateStr);
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return toFaDigits(`${dateStr} ${timeStr}`);
}

/**
 * Format a date string into Jalali display format yyyy/mm/dd (Persian digits by default).
 * Supports both:
 * - Gregorian ISO strings e.g. "2026-03-24" -> "۱۴۰۵/۰۱/۰۴"
 * - Stored Jalali ISO strings e.g. "1405-01-22" -> "۱۴۰۵/۰۱/۲۲"
 */
export function isoToJalali(iso: string | null | undefined, faDigits = true): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return "";
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "";

  let jy = y;
  let jm = m;
  let jd = d;

  // If year > 1700, it is Gregorian -> convert to Jalali
  if (y > 1700) {
    const res = jalaali.toJalaali(y, m, d);
    jy = res.jy;
    jm = res.jm;
    jd = res.jd;
  }

  const s = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  return faDigits ? toFaDigits(s) : s;
}

/** Convert a Jalali string (yyyy/mm/dd or yyyy-mm-dd) to normalized Jalali ISO "yyyy-mm-dd" or Gregorian ISO. */
export function jalaliToIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const clean = toEnDigits(input.trim()).replace(/[.\-]/g, "/");
  const parts = clean.split("/").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [jy, jm, jd] = parts;

  // Standard Jalali year validation
  if (jy >= 1300 && jy <= 1500) {
    return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
  }

  // If Gregorian (> 1700), validate and format
  return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
}

/** Add months to a Jalali ISO date (e.g. "1405-01-22" + 21 months -> "1406-10-22") */
export function addMonthsIso(iso: string, months: number): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return iso;
  let [jy, jm, jd] = parts.map((p) => parseInt(p, 10));

  if (jy > 1700) {
    const res = jalaali.toJalaali(jy, jm, jd);
    jy = res.jy; jm = res.jm; jd = res.jd;
  }

  const totalMonths = (jy * 12) + (jm - 1) + months;
  const newJy = Math.floor(totalMonths / 12);
  const newJm = (totalMonths % 12) + 1;
  
  // Bound days according to Jalali month rules
  const maxDays = newJm <= 6 ? 31 : newJm <= 11 ? 30 : jalaali.isLeapJalaaliYear(newJy) ? 30 : 29;
  const newJd = Math.min(jd, maxDays);

  return `${newJy}-${String(newJm).padStart(2, "0")}-${String(newJd).padStart(2, "0")}`;
}

/** Add days to a Jalali ISO date (e.g. "1405-01-22" + 15 days -> "1405-02-07") */
export function addDaysIso(iso: string, days: number): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return iso;
  let [y, m, d] = parts.map((p) => parseInt(p, 10));

  // Convert to Gregorian Date to perform exact day arithmetic, then return as Jalali ISO
  let gy = y, gm = m, gd = d;
  if (y < 1700) {
    const g = jalaali.toGregorian(y, m, d);
    gy = g.gy; gm = g.gm; gd = g.gd;
  }

  const dateObj = new Date(Date.UTC(gy, gm - 1, gd));
  dateObj.setUTCDate(dateObj.getUTCDate() + days);

  const resJ = jalaali.toJalaali(dateObj.getUTCFullYear(), dateObj.getUTCMonth() + 1, dateObj.getUTCDate());
  return `${resJ.jy}-${String(resJ.jm).padStart(2, "0")}-${String(resJ.jd).padStart(2, "0")}`;
}

export function todayIso(): string {
  const t = new Date();
  const j = jalaali.toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate());
  return `${j.jy}-${String(j.jm).padStart(2, "0")}-${String(j.jd).padStart(2, "0")}`;
}

export function jalaliToDate(jalaliStr: string | null | undefined): Date | null {
  if (!jalaliStr) return null;
  const parts = jalaliStr.split("T")[0].split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => isNaN(n))) return null;
  const [y, m, d] = parts;
  let gy = y, gm = m, gd = d;
  if (y < 1700) {
    const g = jalaali.toGregorian(y, m, d);
    gy = g.gy; gm = g.gm; gd = g.gd;
  }
  return new Date(Date.UTC(gy, gm - 1, gd));
}

export function todayJalali(): string {
  return isoToJalali(todayIso());
}
