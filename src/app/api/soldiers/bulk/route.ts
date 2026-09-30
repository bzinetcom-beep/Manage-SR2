import { db } from "@/db";
import { soldiers, serviceAdjustments, transfers, notifications } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Bulk operations on soldiers.
 * Body: { ids: number[], hard?: boolean }
 *  - hard=false (default): soft delete (deleted_at) — reversible, matches single DELETE.
 *  - hard=true: permanent removal from the database incl. adjustments/transfers/notifications.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)
      : [];
    if (ids.length === 0) {
      return Response.json({ error: "هیچ رکوردی انتخاب نشده است" }, { status: 400 });
    }
    if (ids.length > 500) {
      return Response.json({ error: "حداکثر ۵۰۰ رکورد در هر عملیات مجاز است" }, { status: 400 });
    }
    const hard = Boolean(body.hard);

    let affected: { id: number; name: string }[] = [];
    if (hard) {
      const rows = await db
        .select({ id: soldiers.id, firstName: soldiers.firstName, lastName: soldiers.lastName })
        .from(soldiers)
        .where(inArray(soldiers.id, ids));
      affected = rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` }));
      await db.delete(notifications).where(inArray(notifications.soldierId, ids));
      await db.delete(serviceAdjustments).where(inArray(serviceAdjustments.soldierId, ids));
      await db.delete(transfers).where(inArray(transfers.soldierId, ids));
      await db.delete(soldiers).where(inArray(soldiers.id, ids));
    } else {
      const rows = await db
        .update(soldiers)
        .set({ deletedAt: new Date() })
        .where(inArray(soldiers.id, ids))
        .returning({ id: soldiers.id, firstName: soldiers.firstName, lastName: soldiers.lastName });
      affected = rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` }));
    }

    await logAudit({
      entity: "soldier",
      action: hard ? "hard_delete_bulk" : "delete_bulk",
      user,
      changes: { ids: affected.map((a) => a.id), count: affected.length, hard },
    });

    return Response.json({ ok: true, affected: affected.length, hard });
  } catch (e) {
    console.error("bulk delete failed:", e);
    return Response.json({ error: "خطا در حذف گروهی" }, { status: 500 });
  }
}
