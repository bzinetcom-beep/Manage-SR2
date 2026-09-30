import { db } from "@/db";
import { letters } from "@/db/schema";
import { getCurrentUser, canWrite, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sanitizeHtml } from "@/lib/letter-engine";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db.select().from(letters).where(eq(letters.id, Number(id))).limit(1);
  if (!rows.length) return Response.json({ error: "نامه یافت نشد" }, { status: 404 });
  return Response.json({ data: rows[0] });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date(), status: "edited" };
  if (body.bodyHtml !== undefined) patch.bodyHtml = sanitizeHtml(String(body.bodyHtml));
  if (body.subject !== undefined) patch.subject = String(body.subject);
  if (body.letterNumber !== undefined) patch.letterNumber = String(body.letterNumber);
  if (body.letterDate !== undefined) patch.letterDate = String(body.letterDate);
  if (body.pageSize !== undefined) patch.pageSize = body.pageSize === "A5" ? "A5" : "A4";
  if (body.status !== undefined) patch.status = String(body.status);

  const updated = await db.update(letters).set(patch).where(eq(letters.id, Number(id))).returning();
  if (!updated.length) return Response.json({ error: "نامه یافت نشد" }, { status: 404 });
  await logAudit({ entity: "letter", entityId: Number(id), action: "update", user });
  return Response.json({ data: updated[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role) && !isAdmin(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const deleted = await db.delete(letters).where(eq(letters.id, Number(id))).returning({ id: letters.id });
  if (!deleted.length) return Response.json({ error: "نامه یافت نشد" }, { status: 404 });
  await logAudit({ entity: "letter", entityId: Number(id), action: "delete", user });
  return Response.json({ ok: true });
}
