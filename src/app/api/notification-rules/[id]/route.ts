import { db } from "@/db";
import { notificationRules } from "@/db/schema";
import { eq } from "drizzle-orm";
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") update.name = body.name.slice(0, 200);
  if (typeof body.description === "string") update.description = body.description.slice(0, 1000);
  if (typeof body.dateField === "string" && VALID_DATE_FIELDS.includes(body.dateField)) update.dateField = body.dateField;
  if (body.daysBefore !== undefined) update.daysBefore = Number(toEnDigits(String(body.daysBefore))) || 5;
  if (typeof body.priority === "string" && VALID_PRIORITIES.includes(body.priority)) update.priority = body.priority;
  if (typeof body.recurrence === "string" && VALID_RECURRENCES.includes(body.recurrence)) update.recurrence = body.recurrence;
  if (body.filters && typeof body.filters === "object") update.filters = body.filters;
  if (typeof body.messageTemplate === "string") update.messageTemplate = body.messageTemplate;
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  const row = await db.update(notificationRules).set(update).where(eq(notificationRules.id, Number(id))).returning();
  if (row.length === 0) return Response.json({ error: "not found" }, { status: 404 });

  try {
    const { evaluateRuleNotifications } = await import("@/lib/notification-engine");
    await evaluateRuleNotifications(row[0].id);
  } catch (e) {
    console.error("Rule realtime evaluation error on update:", e);
  }

  return Response.json({ data: row[0] });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await params;
  await db.delete(notificationRules).where(eq(notificationRules.id, Number(id)));
  return Response.json({ ok: true });
}
