import { db } from "@/db";
import { notificationRules, notifications, soldiers, transfers } from "@/db/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import * as jalaali from "jalaali-js";
import { getServiceStatus } from "./service-status";
import { realtimeBus } from "./realtime-bus";

/**
 * Convert a date (stored as Jalali-in-ISO format e.g. "1403-05-15" OR Gregorian ISO)
 * into a Jalali {jy, jm, jd} object. Returns null if invalid.
 */
function parseToJalali(iso: string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null;
  const parts = iso.split("T")[0].split("-");
  if (parts.length < 3) return null;
  const [y, m, d] = parts.map((x) => parseInt(x, 10));
  if ([y, m, d].some((x) => isNaN(x))) return null;
  if (y < 1900) return { jy: y, jm: m, jd: d }; // already Jalali
  return jalaali.toJalaali(y, m, d);
}

/** Today's Jalali date */
function todayJalali(): { jy: number; jm: number; jd: number } {
  const t = new Date();
  return jalaali.toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/**
 * Compute the target occurrence date in Jalali calendar.
 * - For "once": Preserves exact year, month, and day from baseJalali.
 * - For "yearly": Calculates the next occurrence of (month, day) >= today.
 */
function nextJalaliOccurrence(
  baseJalali: { jy: number; jm: number; jd: number },
  recurrence: "yearly" | "once"
): { jy: number; jm: number; jd: number } | null {
  const { jy, jm, jd } = baseJalali;
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  if (recurrence === "once") {
    return { jy, jm, jd };
  }
  // yearly recurrence
  const today = todayJalali();
  const thisYear = { jy: today.jy, jm, jd };
  if (cmpJalali(thisYear, today) >= 0) return thisYear;
  return { jy: today.jy + 1, jm, jd };
}

function cmpJalali(a: { jy: number; jm: number; jd: number }, b: { jy: number; jm: number; jd: number }): number {
  if (a.jy !== b.jy) return a.jy - b.jy;
  if (a.jm !== b.jm) return a.jm - b.jm;
  return a.jd - b.jd;
}

/** Difference in days between two Jalali dates (a - b). */
function diffDaysJalali(a: { jy: number; jm: number; jd: number }, b: { jy: number; jm: number; jd: number }): number {
  const g1 = jalaali.toGregorian(a.jy, a.jm, a.jd);
  const g2 = jalaali.toGregorian(b.jy, b.jm, b.jd);
  const d1 = Date.UTC(g1.gy, g1.gm - 1, g1.gd);
  const d2 = Date.UTC(g2.gy, g2.gm - 1, g2.gd);
  return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
}

function jalaliToStr(j: { jy: number; jm: number; jd: number }): string {
  return `${j.jy}-${String(j.jm).padStart(2, "0")}-${String(j.jd).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Date-field resolution — supports snake_case names coming from the rules UI
// (marriage_date → marriageDate) and a few computed / cross-table fields:
//   service_mid_date, mission_start_date, mission_end_date
// ---------------------------------------------------------------------------
type MissionInfo = { start: string | null; end: string | null };

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** آخرین انتقال تأییدشده‌ی هر سرباز؛ اگر از نوع «مامور» باشد اطلاعات ماموریت برگردانده می‌شود. */
async function loadMissionMap(): Promise<Map<number, MissionInfo>> {
  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.status, "تایید شده"))
    .orderBy(transfers.id);
  const latest = new Map<number, typeof rows[number]>();
  for (const r of rows) latest.set(r.soldierId, r);
  const out = new Map<number, MissionInfo>();
  for (const [sid, r] of latest) {
    if (r.transferType === "مامور") out.set(sid, { start: r.missionStartDate, end: r.missionEndDate });
  }
  return out;
}

function resolveDateValue(
  soldier: typeof soldiers.$inferSelect,
  field: string,
  missions: Map<number, MissionInfo>,
): string | null {
  const f = toCamel(field);
  if (f === "missionStartDate") return missions.get(soldier.id)?.start ?? null;
  if (f === "missionEndDate") return missions.get(soldier.id)?.end ?? null;
  if (f === "serviceMidDate") {
    const a = parseToJalali(soldier.dispatchDate);
    const b = parseToJalali(soldier.serviceEndDate);
    if (!a || !b) return null;
    const ga = jalaali.toGregorian(a.jy, a.jm, a.jd);
    const gb = jalaali.toGregorian(b.jy, b.jm, b.jd);
    const mid = new Date((Date.UTC(ga.gy, ga.gm - 1, ga.gd) + Date.UTC(gb.gy, gb.gm - 1, gb.gd)) / 2);
    const j = jalaali.toJalaali(mid.getUTCFullYear(), mid.getUTCMonth() + 1, mid.getUTCDate());
    return jalaliToStr(j);
  }
  const v = (soldier as Record<string, unknown>)[f];
  return typeof v === "string" ? v : null;
}

function yearsBetween(base: { jy: number }, event: { jy: number }): number {
  return Math.max(0, event.jy - base.jy);
}

function faDigits(s: string): string {
  const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return s.replace(/[0-9]/g, (c) => FA[+c]);
}

function formatDateJalali(j: { jy: number; jm: number; jd: number }): string {
  return faDigits(`${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`);
}

function renderTemplate(
  tpl: string,
  soldier: typeof soldiers.$inferSelect,
  daysLeft: number,
  eventDate: { jy: number; jm: number; jd: number },
  years = 0,
): string {
  return tpl
    .replace(/\{\{years\}\}/g, faDigits(String(years)))
    .replace(/\{\{firstName\}\}/g, soldier.firstName || "")
    .replace(/\{\{lastName\}\}/g, soldier.lastName || "")
    .replace(/\{\{nationalCode\}\}/g, soldier.nationalCode || "")
    .replace(/\{\{personnelCode\}\}/g, soldier.personnelCode || "")
    .replace(/\{\{serviceUnit\}\}/g, soldier.serviceUnit || "")
    .replace(/\{\{rank\}\}/g, soldier.rank || "")
    .replace(/\{\{daysLeft\}\}/g, faDigits(String(daysLeft)))
    .replace(/\{\{eventDate\}\}/g, formatDateJalali(eventDate));
}

async function getUnreadCount(): Promise<number> {
  const res = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.status, "unread"));
  return Number(res[0]?.count) || 0;
}

/**
 * Checks matching filters for a soldier against a rule
 */
function soldierMatchesFilters(soldier: typeof soldiers.$inferSelect, filters: Record<string, any>): boolean {
  if (filters.maritalStatus && soldier.maritalStatus !== filters.maritalStatus) return false;
  if (filters.serviceStatus) {
    const st = getServiceStatus(soldier.serviceEndDate);
    if (st !== filters.serviceStatus) return false;
  }
  if (filters.serviceUnit && soldier.serviceUnit !== filters.serviceUnit) return false;
  if (filters.city && soldier.city !== filters.city) return false;
  return true;
}

/**
 * Real-Time Targeted Evaluator:
 * Recalculates and updates notifications for a SINGLE soldier after creation or update.
 */
export async function evaluateSoldierNotifications(soldierId: number): Promise<{ created: number; updated: number; resolved: number }> {
  const today = todayJalali();
  let created = 0;
  let updated = 0;
  let resolved = 0;

  // 1. Fetch soldier
  const [soldier] = await db
    .select()
    .from(soldiers)
    .where(and(eq(soldiers.id, soldierId), isNull(soldiers.deletedAt)));

  // Fetch all existing active unread notifications for this soldier
  const existingNotifs = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.soldierId, soldierId), eq(notifications.status, "unread")));

  if (!soldier) {
    // Soldier deleted or missing -> Archive all pending unread notifications
    if (existingNotifs.length > 0) {
      await db
        .update(notifications)
        .set({ status: "archived" })
        .where(inArray(notifications.id, existingNotifs.map((n) => n.id)));
      resolved += existingNotifs.length;

      const unreadCount = await getUnreadCount();
      realtimeBus.broadcast({
        type: "notification",
        action: "archived",
        unreadCount,
        timestamp: new Date().toISOString(),
      });
    }
    return { created: 0, updated: 0, resolved };
  }

  // 2. Fetch active rules
  const activeRules = await db
    .select()
    .from(notificationRules)
    .where(eq(notificationRules.isActive, true));

  const matchedDedupeKeys = new Set<string>();
  const missions = await loadMissionMap();

  for (const rule of activeRules) {
    const daysBefore = rule.daysBefore;
    const recurrence = (rule.recurrence === "once" ? "once" : "yearly") as "once" | "yearly";
    const filters = (rule.filters || {}) as Record<string, unknown>;

    if (!soldierMatchesFilters(soldier, filters)) continue;

    const rawDate = resolveDateValue(soldier, rule.dateField, missions);
    const baseJalali = parseToJalali(rawDate);
    if (!baseJalali) continue;

    const nextEvent = nextJalaliOccurrence(baseJalali, recurrence);
    if (!nextEvent) continue;

    const daysLeft = diffDaysJalali(nextEvent, today);
    if (daysLeft < 0 || daysLeft > daysBefore) continue; // outside target window

    const dedupeKey = `rule-${rule.id}-soldier-${soldier.id}-${jalaliToStr(nextEvent)}`;
    matchedDedupeKeys.add(dedupeKey);

    const title = `${rule.name} — ${soldier.firstName} ${soldier.lastName}`;
    const message = renderTemplate(rule.messageTemplate, soldier, daysLeft, nextEvent, yearsBetween(baseJalali, nextEvent));

    // Check if notification already exists
    const existing = await db
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, dedupeKey))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      // Update if message or priority changed and it was unread
      if (current.status === "unread" && (current.message !== message || current.priority !== rule.priority || current.title !== title)) {
        await db
          .update(notifications)
          .set({ message, priority: rule.priority, title, triggeredAt: new Date() })
          .where(eq(notifications.id, current.id));
        updated++;
      }
    } else {
      // Insert new notification
      const inserted = await db
        .insert(notifications)
        .values({
          ruleId: rule.id,
          soldierId: soldier.id,
          dedupeKey,
          title,
          message,
          priority: rule.priority,
          status: "unread",
          eventDate: jalaliToStr(nextEvent),
        })
        .returning();

      created++;

      const unreadCount = await getUnreadCount();
      realtimeBus.broadcast({
        type: "notification",
        action: "created",
        data: inserted[0],
        unreadCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. Resolve / archive unread notifications for this soldier that no longer match active criteria
  for (const notif of existingNotifs) {
    if (notif.dedupeKey && !matchedDedupeKeys.has(notif.dedupeKey)) {
      await db.update(notifications).set({ status: "archived" }).where(eq(notifications.id, notif.id));
      resolved++;
    }
  }

  if (resolved > 0 || updated > 0) {
    const unreadCount = await getUnreadCount();
    realtimeBus.broadcast({
      type: "notification",
      action: "recalculated",
      unreadCount,
      timestamp: new Date().toISOString(),
    });
  }

  return { created, updated, resolved };
}

/**
 * Targeted Evaluator for a single notification rule across all soldiers
 */
export async function evaluateRuleNotifications(ruleId: number): Promise<{ created: number }> {
  const [rule] = await db.select().from(notificationRules).where(eq(notificationRules.id, ruleId));
  if (!rule || !rule.isActive) return { created: 0 };

  const allSoldiers = await db.select().from(soldiers).where(isNull(soldiers.deletedAt));
  const missions = await loadMissionMap();
  const today = todayJalali();
  let created = 0;
  const daysBefore = rule.daysBefore;
  const recurrence = (rule.recurrence === "once" ? "once" : "yearly") as "once" | "yearly";
  const filters = (rule.filters || {}) as Record<string, unknown>;

  for (const soldier of allSoldiers) {
    if (!soldierMatchesFilters(soldier, filters)) continue;

    const rawDate = resolveDateValue(soldier, rule.dateField, missions);
    const baseJalali = parseToJalali(rawDate);
    if (!baseJalali) continue;

    const nextEvent = nextJalaliOccurrence(baseJalali, recurrence);
    if (!nextEvent) continue;

    const daysLeft = diffDaysJalali(nextEvent, today);
    if (daysLeft < 0 || daysLeft > daysBefore) continue;

    const dedupeKey = `rule-${rule.id}-soldier-${soldier.id}-${jalaliToStr(nextEvent)}`;

    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupeKey, dedupeKey))
      .limit(1);

    if (existing.length === 0) {
      const title = `${rule.name} — ${soldier.firstName} ${soldier.lastName}`;
      const message = renderTemplate(rule.messageTemplate, soldier, daysLeft, nextEvent, yearsBetween(baseJalali, nextEvent));

      const inserted = await db
        .insert(notifications)
        .values({
          ruleId: rule.id,
          soldierId: soldier.id,
          dedupeKey,
          title,
          message,
          priority: rule.priority,
          status: "unread",
          eventDate: jalaliToStr(nextEvent),
        })
        .returning();

      created++;

      const unreadCount = await getUnreadCount();
      realtimeBus.broadcast({
        type: "notification",
        action: "created",
        data: inserted[0],
        unreadCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { created };
}

/**
 * Main engine scan (for scheduled fallback scan of all rules & all soldiers)
 */
export async function runNotificationEngine(): Promise<{ created: number; rules: number }> {
  const rules = await db.select().from(notificationRules).where(eq(notificationRules.isActive, true));
  const today = todayJalali();
  let created = 0;

  const allSoldiers = await db.select().from(soldiers).where(isNull(soldiers.deletedAt));
  const missions = await loadMissionMap();

  for (const rule of rules) {
    const daysBefore = rule.daysBefore;
    const recurrence = (rule.recurrence === "once" ? "once" : "yearly") as "once" | "yearly";
    const filters = (rule.filters || {}) as Record<string, unknown>;

    const candidates = allSoldiers.filter((s) => soldierMatchesFilters(s, filters));

    for (const soldier of candidates) {
      const rawDate = resolveDateValue(soldier, rule.dateField, missions);
      const baseJalali = parseToJalali(rawDate);
      if (!baseJalali) continue;

      const nextEvent = nextJalaliOccurrence(baseJalali, recurrence);
      if (!nextEvent) continue;

      const daysLeft = diffDaysJalali(nextEvent, today);
      if (daysLeft < 0 || daysLeft > daysBefore) continue;

      const dedupeKey = `rule-${rule.id}-soldier-${soldier.id}-${jalaliToStr(nextEvent)}`;

      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.dedupeKey, dedupeKey))
        .limit(1);

      if (existing.length > 0) continue;

      const message = renderTemplate(rule.messageTemplate, soldier, daysLeft, nextEvent, yearsBetween(baseJalali, nextEvent));
      const title = `${rule.name} — ${soldier.firstName} ${soldier.lastName}`;

      await db.insert(notifications).values({
        ruleId: rule.id,
        soldierId: soldier.id,
        dedupeKey,
        title,
        message,
        priority: rule.priority,
        status: "unread",
        eventDate: jalaliToStr(nextEvent),
      });
      created++;
    }
  }

  if (created > 0) {
    const unreadCount = await getUnreadCount();
    realtimeBus.broadcast({
      type: "notification",
      action: "recalculated",
      unreadCount,
      timestamp: new Date().toISOString(),
    });
  }

  return { created, rules: rules.length };
}
