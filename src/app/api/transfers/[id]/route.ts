import { db } from "@/db";
import { transfers, soldiers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateTransferInput } from "@/lib/transfer-info";

/** اعلان‌های ماموریت (شروع/پایان) پس از هر تغییر انتقال دوباره ارزیابی می‌شوند. */
async function refreshNotifications(soldierId: number) {
  try {
    const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
    await evaluateSoldierNotifications(soldierId);
  } catch (e) {
    console.error("notification refresh after transfer failed", e);
  }
}

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const trId = Number(id);
  const existing = await db.select().from(transfers).where(eq(transfers.id, trId)).limit(1);
  if (!existing[0]) return Response.json({ error: "یافت نشد" }, { status: 404 });
  const body = await req.json();
  const kind = validateTransferInput(body, existing[0]);
  if (!kind.ok) return Response.json({ error: kind.error }, { status: 400 });
  await db
    .update(transfers)
    .set({
      transferType: kind.transferType,
      missionStartDate: kind.missionStartDate,
      missionEndDate: kind.missionEndDate,
      transferDate: body.transferDate ?? existing[0].transferDate,
      fromServiceUnit: body.fromServiceUnit ?? existing[0].fromServiceUnit,
      toServiceUnit: body.toServiceUnit ?? existing[0].toServiceUnit,
      transferReason: body.transferReason ?? existing[0].transferReason,
      approvedBy: body.approvedBy ?? existing[0].approvedBy,
      issuerName: body.issuerName ?? existing[0].issuerName,
      issuerRole: body.issuerRole ?? existing[0].issuerRole,
      description: body.description ?? existing[0].description,
      documentNumber: body.documentNumber ?? existing[0].documentNumber,
      status: body.status ?? existing[0].status,
    })
    .where(eq(transfers.id, trId));
  if (body.status === "تایید شده" && (body.toServiceUnit || existing[0].toServiceUnit)) {
    await db
      .update(soldiers)
      .set({ serviceUnit: body.toServiceUnit || existing[0].toServiceUnit, updatedAt: new Date() })
      .where(eq(soldiers.id, existing[0].soldierId));
  }
  await logAudit({ entity: "transfer", entityId: trId, action: "update", user });
  await refreshNotifications(existing[0].soldierId);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const prev = await db.select().from(transfers).where(eq(transfers.id, Number(id))).limit(1);
  await db.delete(transfers).where(eq(transfers.id, Number(id)));
  if (prev[0]) await refreshNotifications(prev[0].soldierId);
  await logAudit({ entity: "transfer", entityId: Number(id), action: "delete", user });
  return Response.json({ ok: true });
}
