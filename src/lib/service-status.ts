import * as jalaali from "jalaali-js";
import { sql, type SQL } from "drizzle-orm";
import { soldiers } from "@/db/schema";
import { todayIso } from "./jalali";

// ---------------------------------------------------------------------------
// Settled (تسویه‌شده) filtering — shared by soldiers list, exports & reports.
// service_end_date is stored as zero-padded Jalali "yyyy-mm-dd", so plain
// string comparison against today's Jalali ISO is chronologically correct.
// ---------------------------------------------------------------------------
export type SettledMode = "exclude" | "only" | "all";

export function parseSettledMode(v: string | null | undefined): SettledMode {
  if (v === "only" || v === "all") return v;
  return "exclude"; // default: settled soldiers are hidden
}

/** Drizzle condition for the requested settled mode (undefined = no filter). */
export function settledCondition(mode: SettledMode): SQL | undefined {
  if (mode === "all") return undefined;
  const today = todayIso();
  if (mode === "only") {
    return sql`${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${today}`;
  }
  // exclude: keep in-service soldiers (end date missing or not yet passed)
  return sql`NOT (${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${today})`;
}

/** Raw-SQL fragment (for hand-written queries) — always starts with AND. */
export function settledRawSql(mode: SettledMode): string {
  if (mode === "all") return "";
  const today = todayIso();
  if (mode === "only") {
    return ` AND service_end_date IS NOT NULL AND service_end_date < '${today}'`;
  }
  return ` AND NOT (service_end_date IS NOT NULL AND service_end_date < '${today}')`;
}

/**
 * Compute service status based on serviceEndDate (ISO yyyy-mm-dd Gregorian).
 * - "تسویه شده" if end date is in the past
 * - "در حال خدمت" otherwise (including when end date is missing)
 */
export function getServiceStatus(serviceEndDate: string | null | undefined): "تسویه شده" | "در حال خدمت" {
  if (!serviceEndDate) return "در حال خدمت";
  const iso = serviceEndDate.split("T")[0];
  const parts = iso.split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((p) => isNaN(p))) return "در حال خدمت";
  // Convert Jalali-stored-as-ISO to real date for comparison.
  // In this project, service_end_date is stored as a Jalali date in ISO format (e.g. 1404-05-10 means 10 Mordad 1404).
  // Convert it to Gregorian for comparison with today.
  const [y, m, d] = parts;
  // If year is < 1900, treat as Jalali year
  let gy: number, gm: number, gd: number;
  if (y < 1900) {
    const g = jalaali.toGregorian(y, m, d);
    gy = g.gy; gm = g.gm; gd = g.gd;
  } else {
    gy = y; gm = m; gd = d;
  }
  const endDate = new Date(Date.UTC(gy, gm - 1, gd));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return endDate.getTime() < today.getTime() ? "تسویه شده" : "در حال خدمت";
}

/**
 * Format a Jalali-stored-as-ISO date (e.g. "1404-05-10") into Persian digits "۱۴۴/۰/۱۰".
 */
export function formatJalaliIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return "";
  const [y, m, d] = parts;
  const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const fa = (s: string) => s.replace(/[0-9]/g, (c) => FA[+c]);
  return `${fa(y)}/${fa(m.padStart(2, "0"))}/${fa(d.padStart(2, "0"))}`;
}
