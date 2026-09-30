import { db } from "@/db";
import { letters, letterBatches } from "@/db/schema";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import { and, desc, eq, ilike, or, sql, inArray, SQL } from "drizzle-orm";
import { getCurrentUser, canWrite, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureBuiltinTemplates();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const batchId = url.searchParams.get("batchId");
  const templateId = url.searchParams.get("templateId");
  const status = url.searchParams.get("status");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Number(url.searchParams.get("pageSize")) || 25);

  const conds: SQL[] = [];
  if (q) {
    const like = `%${q}%`;
    const c = or(
      ilike(letters.soldierName, like),
      ilike(letters.nationalCode, like),
      ilike(letters.letterNumber, like),
      ilike(letters.subject, like),
      ilike(letters.templateName, like),
    );
    if (c) conds.push(c);
  }
  if (batchId) conds.push(eq(letters.batchId, Number(batchId)));
  if (templateId) conds.push(eq(letters.templateId, Number(templateId)));
  if (status) conds.push(eq(letters.status, status));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: letters.id,
      batchId: letters.batchId,
      templateId: letters.templateId,
      templateName: letters.templateName,
      soldierId: letters.soldierId,
      soldierName: letters.soldierName,
      nationalCode: letters.nationalCode,
      serviceUnit: letters.serviceUnit,
      subject: letters.subject,
      letterNumber: letters.letterNumber,
      letterDate: letters.letterDate,
      pageSize: letters.pageSize,
      status: letters.status,
      createdByName: letters.createdByName,
      createdAt: letters.createdAt,
    })
    .from(letters)
    .where(where)
    .orderBy(desc(letters.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRes = await db.select({ c: sql<number>`count(*)::int` }).from(letters).where(where);

  const batches = await db.select().from(letterBatches).orderBy(desc(letterBatches.id)).limit(50);

  return Response.json({ data: rows, total: totalRes[0]?.c ?? 0, page, pageSize, batches });
}

/** حذف گروهی / تغییر وضعیت گروهی */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const body = await req.json();
  const ids: number[] = (body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return Response.json({ error: "موردی انتخاب نشده" }, { status: 400 });

  if (body.action === "delete") {
    if (!isAdmin(user?.role) && body.force) {
      return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
    }
    await db.delete(letters).where(inArray(letters.id, ids));
    await logAudit({
      entity: "letter",
      entityId: ids[0],
      action: "delete",
      user,
      changes: { count: ids.length, ids },
    });
    return Response.json({ ok: true, deleted: ids.length });
  }

  if (body.action === "status" && body.status) {
    await db
      .update(letters)
      .set({ status: String(body.status), updatedAt: new Date() })
      .where(inArray(letters.id, ids));
    return Response.json({ ok: true, updated: ids.length });
  }

  return Response.json({ error: "عملیات نامعتبر" }, { status: 400 });
}
