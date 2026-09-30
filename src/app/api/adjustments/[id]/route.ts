import { db } from "@/db";
import { serviceAdjustments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recomputeServiceEndDate } from "@/lib/soldier-service";
import { toEnDigits } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const adjId = Number(id);
  const body = await req.json();
  const existing = await db
    .select()
    .from(serviceAdjustments)
    .where(eq(serviceAdjustments.id, adjId))
    .limit(1);
  if (!existing[0]) return Response.json({ error: "یافت نشد" }, { status: 404 });
  await db
    .update(serviceAdjustments)
    .set({
      type: body.type ?? existing[0].type,
      effectDirection: body.effectDirection ?? existing[0].effectDirection,
      days: body.days !== undefined ? (Number(toEnDigits(String(body.days))) || 0) : existing[0].days,
      effectiveDate: body.effectiveDate ?? existing[0].effectiveDate,
      title: body.title ?? existing[0].title,
      description: body.description ?? existing[0].description,
      legalDocumentNumber: body.legalDocumentNumber ?? existing[0].legalDocumentNumber,
    })
    .where(eq(serviceAdjustments.id, adjId));
  const end = await recomputeServiceEndDate(existing[0].soldierId);
  await logAudit({ entity: "adjustment", entityId: adjId, action: "update", user });

  try {
    const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
    await evaluateSoldierNotifications(existing[0].soldierId);
  } catch (e) {
    console.error("Realtime notification trigger error on adjustment update:", e);
  }

  return Response.json({ ok: true, serviceEndDate: end });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const adjId = Number(id);
  const existing = await db
    .select()
    .from(serviceAdjustments)
    .where(eq(serviceAdjustments.id, adjId))
    .limit(1);
  if (!existing[0]) return Response.json({ error: "یافت نشد" }, { status: 404 });
  await db.delete(serviceAdjustments).where(eq(serviceAdjustments.id, adjId));
  const end = await recomputeServiceEndDate(existing[0].soldierId);
  await logAudit({ entity: "adjustment", entityId: adjId, action: "delete", user });

  try {
    const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
    await evaluateSoldierNotifications(existing[0].soldierId);
  } catch (e) {
    console.error("Realtime notification trigger error on adjustment delete:", e);
  }

  return Response.json({ ok: true, serviceEndDate: end });
}
