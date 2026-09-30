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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.soldierId, Number(id)))
    .orderBy(transfers.id);
  return Response.json({ data: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const soldierId = Number(id);
  const body = await req.json();
  const kind = validateTransferInput(body);
  if (!kind.ok) return Response.json({ error: kind.error }, { status: 400 });
  const inserted = await db
    .insert(transfers)
    .values({
      soldierId,
      transferType: kind.transferType,
      missionStartDate: kind.missionStartDate,
      missionEndDate: kind.missionEndDate,
      transferDate: body.transferDate || null,
      fromServiceUnit: body.fromServiceUnit || null,
      toServiceUnit: body.toServiceUnit || null,
      transferReason: body.transferReason || null,
      approvedBy: body.approvedBy || null,
      issuerName: body.issuerName || null,
      issuerRole: body.issuerRole || null,
      description: body.description || null,
      documentNumber: body.documentNumber || null,
      status: body.status || "پیش‌نویس",
      createdBy: user?.id ?? null,
    })
    .returning();

  // If confirmed, update soldier's current service unit
  if (body.status === "تایید شده" && body.toServiceUnit) {
    await db
      .update(soldiers)
      .set({ serviceUnit: body.toServiceUnit, updatedAt: new Date() })
      .where(eq(soldiers.id, soldierId));
  }
  await logAudit({ entity: "transfer", entityId: inserted[0].id, action: "create", user });
  await refreshNotifications(soldierId);
  return Response.json({ data: inserted[0] }, { status: 201 });
}
