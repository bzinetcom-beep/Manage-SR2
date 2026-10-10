import { db } from "@/db";
import { soldiers, serviceAdjustments, transfers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { splitPayload, recomputeServiceEndDate, applyRankDefault } from "@/lib/soldier-service";

export const dynamic = "force-dynamic";

async function getId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Number(id);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await getId(ctx);
  const rows = await db
    .select()
    .from(soldiers)
    .where(and(eq(soldiers.id, id), isNull(soldiers.deletedAt)))
    .limit(1);
  if (!rows[0]) return Response.json({ error: "یافت نشد" }, { status: 404 });
  const rawAdj = await db
    .select()
    .from(serviceAdjustments)
    .where(eq(serviceAdjustments.soldierId, id))
    .orderBy(serviceAdjustments.id);
  // مرخصی‌ها هیچ اثری در پایان خدمت ندارند و منحصراً در بخش مرخصی نمایش داده می‌شوند
  const adj = rawAdj.filter(
    (a) => !a.type || (!a.type.includes("مرخصی") && !a.type.includes("استحقاق") && !a.type.includes("استعلاج") && !a.type.includes("تشویق"))
  );
  const trs = await db
    .select()
    .from(transfers)
    .where(eq(transfers.soldierId, id))
    .orderBy(transfers.id);
  return Response.json({ data: rows[0], adjustments: adj, transfers: trs });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const id = await getId(ctx);
  try {
    const body = await req.json();
    const { fixed, metadata } = splitPayload(body);
    const before = await db.select().from(soldiers).where(eq(soldiers.id, id)).limit(1);
    if (!before[0]) return Response.json({ error: "یافت نشد" }, { status: 404 });
    applyRankDefault(fixed, before[0]);

    await db
      .update(soldiers)
      .set({
        ...(fixed as Record<string, unknown>),
        metadata: { ...(before[0].metadata || {}), ...metadata },
        updatedAt: new Date(),
      } as Partial<typeof soldiers.$inferInsert>)
      .where(eq(soldiers.id, id));

    // recompute end date (dispatch may have changed) then re-apply adjustments
    await recomputeServiceEndDate(id);

    const after = await db.select().from(soldiers).where(eq(soldiers.id, id)).limit(1);
    await logAudit({
      entity: "soldier",
      entityId: id,
      action: "update",
      user,
      changes: { before: before[0], after: after[0] },
    });

    // Real-Time Notification Evaluation Hook
    try {
      const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
      await evaluateSoldierNotifications(id);
    } catch (e) {
      console.error("Realtime notification trigger error on update:", e);
    }

    return Response.json({ data: after[0] });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "خطا در ویرایش" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const id = await getId(ctx);
  await db.update(soldiers).set({ deletedAt: new Date() }).where(eq(soldiers.id, id));
  await logAudit({ entity: "soldier", entityId: id, action: "delete", user });

  // Real-Time Notification Cleanup Trigger
  try {
    const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
    await evaluateSoldierNotifications(id);
  } catch (e) {
    console.error("Realtime notification trigger error on delete:", e);
  }

  return Response.json({ ok: true });
}
