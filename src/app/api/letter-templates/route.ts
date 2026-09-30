import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import { customPlaceholders, sanitizeHtml } from "@/lib/letter-engine";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBuiltinTemplates();
  const rows = await db.select().from(letterTemplates).orderBy(desc(letterTemplates.id));
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  await ensureBuiltinTemplates();
  const body = await req.json();
  if (!body.name) return Response.json({ error: "نام قالب الزامی است" }, { status: 400 });

  const headerHtml = sanitizeHtml(body.headerHtml || "");
  const bodyHtml = sanitizeHtml(body.bodyHtml || "");
  const footerHtml = sanitizeHtml(body.footerHtml || "");

  const autoParams = customPlaceholders(headerHtml, bodyHtml, footerHtml).map((k) => ({
    key: k,
    label: k.replace(/_/g, " "),
    type: "text",
    defaultValue: "",
  }));
  type ParamDef = { key: string; label: string; type?: string; defaultValue?: string; options?: string[] };
  const provided: ParamDef[] = Array.isArray(body.params)
    ? (body.params as ParamDef[]).filter((p) => p && p.key).map((p) => ({ ...p, label: p.label || p.key }))
    : [];
  const merged = [...provided];
  for (const p of autoParams) if (!merged.some((x) => x.key === p.key)) merged.push(p);

  const inserted = await db
    .insert(letterTemplates)
    .values({
      name: body.name,
      category: body.category || "عمومی",
      description: body.description || "",
      subject: body.subject || body.name,
      headerHtml,
      bodyHtml,
      footerHtml,
      pageSize: body.pageSize === "A5" ? "A5" : "A4",
      source: body.source === "docx" ? "docx" : "custom",
      params: merged,
      createdBy: user?.id,
      createdByName: user?.fullName,
    })
    .returning();

  await logAudit({ entity: "letter_template", entityId: inserted[0].id, action: "create", user });
  return Response.json({ data: inserted[0] }, { status: 201 });
}
