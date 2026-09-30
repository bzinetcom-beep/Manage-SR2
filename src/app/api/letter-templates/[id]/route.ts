import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { getCurrentUser, canWrite, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import { customPlaceholders, sanitizeHtml } from "@/lib/letter-engine";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type ParamDef = { key: string; label: string; type?: string; defaultValue?: string; options?: string[] };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureBuiltinTemplates();
  const { id } = await ctx.params;
  const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, Number(id))).limit(1);
  if (!rows.length) return Response.json({ error: "قالب یافت نشد" }, { status: 404 });
  return Response.json({ data: rows[0] });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json();

  const headerHtml = sanitizeHtml(body.headerHtml ?? "");
  const bodyHtml = sanitizeHtml(body.bodyHtml ?? "");
  const footerHtml = sanitizeHtml(body.footerHtml ?? "");

  const provided: ParamDef[] = Array.isArray(body.params)
    ? (body.params as ParamDef[]).filter((p) => p && p.key).map((p) => ({ ...p, label: p.label || p.key }))
    : [];
  const merged: ParamDef[] = [...provided];
  for (const k of customPlaceholders(headerHtml, bodyHtml, footerHtml)) {
    if (!merged.some((x) => x.key === k)) merged.push({ key: k, label: k.replace(/_/g, " "), type: "text", defaultValue: "" });
  }

  const updated = await db
    .update(letterTemplates)
    .set({
      name: body.name,
      category: body.category || "عمومی",
      description: body.description || "",
      subject: body.subject || body.name,
      headerHtml,
      bodyHtml,
      footerHtml,
      pageSize: body.pageSize === "A5" ? "A5" : "A4",
      params: merged,
      isActive: body.isActive !== false,
      updatedAt: new Date(),
    })
    .where(eq(letterTemplates.id, Number(id)))
    .returning();

  if (!updated.length) return Response.json({ error: "قالب یافت نشد" }, { status: 404 });
  await logAudit({ entity: "letter_template", entityId: Number(id), action: "update", user });
  return Response.json({ data: updated[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const { id } = await ctx.params;
  const deleted = await db.delete(letterTemplates).where(eq(letterTemplates.id, Number(id))).returning();
  if (!deleted.length) return Response.json({ error: "قالب یافت نشد" }, { status: 404 });
  await logAudit({ entity: "letter_template", entityId: Number(id), action: "delete", user });
  return Response.json({ ok: true });
}
