import { db } from "@/db";
import { notificationRules } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { toEnDigits } from "@/lib/jalali";

export const dynamic = "force-dynamic";

const VALID_DATE_FIELDS = [
  "marriageDate", "serviceEndDate", "dispatchDate", "birthDate", "serviceStartDate",
  "marriage_date", "service_end_date", "dispatch_date", "birth_date", "service_start_date",
  // فیلدهای محاسبه‌ای/ماموریت
  "service_mid_date", "mission_start_date", "mission_end_date",
  "serviceMidDate", "missionStartDate", "missionEndDate",
];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];
const VALID_RECURRENCES = ["yearly", "once"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });
  const rows = await db.select().from(notificationRules).orderBy(desc(notificationRules.createdAt));
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { name, description, dateField, daysBefore, priority, recurrence, filters, messageTemplate, isActive } = body;

  if (!name || !dateField) {
    return Response.json({ error: "نام و فیلد تاریخ الزامی است" }, { status: 400 });
  }
  if (!VALID_DATE_FIELDS.includes(dateField)) {
    return Response.json({ error: "فیلد تاریخ نامعتبر" }, { status: 400 });
  }

  const row = await db.insert(notificationRules).values({
    name: String(name).slice(0, 200),
    description: description ? String(description).slice(0, 1000) : null,
    dateField,
    daysBefore: Number(toEnDigits(String(daysBefore ?? ""))) || 5,
    priority: VALID_PRIORITIES.includes(priority) ? priority : "normal",
    recurrence: VALID_RECURRENCES.includes(recurrence) ? recurrence : "yearly",
    filters: filters || {},
    messageTemplate: messageTemplate || "{{firstName}} {{lastName}}",
    isActive: isActive !== false,
    createdBy: user.id,
  }).returning();

  try {
    const { evaluateRuleNotifications } = await import("@/lib/notification-engine");
    await evaluateRuleNotifications(row[0].id);
  } catch (e) {
    console.error("Rule realtime evaluation error:", e);
  }

  return Response.json({ data: row[0] });
}
