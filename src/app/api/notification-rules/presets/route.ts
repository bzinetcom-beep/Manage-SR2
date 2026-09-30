import { db } from "@/db";
import { notificationRules } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { NOTIFICATION_RULE_PRESETS } from "@/lib/notification-presets";

export const dynamic = "force-dynamic";

/** فهرست قوانین پیشنهادی + اینکه کدام‌ها از قبل ساخته شده‌اند */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });
  const existing = new Set((await db.select({ name: notificationRules.name }).from(notificationRules)).map((r) => r.name));
  return Response.json({
    data: NOTIFICATION_RULE_PRESETS.map((p) => ({ ...p, exists: existing.has(p.name) })),
  });
}

/** افزودن همه‌ی قوانین پیشنهادی که هنوز وجود ندارند (هم‌نام‌ها تکرار نمی‌شوند) */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  const existing = new Set((await db.select({ name: notificationRules.name }).from(notificationRules)).map((r) => r.name));
  let created = 0;
  for (const p of NOTIFICATION_RULE_PRESETS) {
    if (existing.has(p.name)) continue;
    await db.insert(notificationRules).values({
      name: p.name,
      description: p.description,
      dateField: p.dateField,
      daysBefore: p.daysBefore,
      priority: p.priority,
      recurrence: p.recurrence,
      filters: p.filters,
      messageTemplate: p.messageTemplate,
      isActive: true,
      createdBy: user.id,
    });
    created++;
  }
  // اعلان‌های مربوط به قوانین جدید بلافاصله تولید شوند
  if (created > 0) {
    try {
      const { runNotificationEngine } = await import("@/lib/notification-engine");
      await runNotificationEngine();
    } catch (e) {
      console.error("notification engine run after presets failed", e);
    }
  }
  return Response.json({ created, skipped: NOTIFICATION_RULE_PRESETS.length - created });
}
