import { db } from "@/db";
import { customFields } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(customFields).orderBy(customFields.sortOrder);
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const body = await req.json();
  if (!body.fieldKey || !body.label) {
    return Response.json({ error: "کلید و برچسب الزامی است" }, { status: 400 });
  }
  const key = String(body.fieldKey).replace(/[^a-zA-Z0-9_]/g, "_");
  const inserted = await db
    .insert(customFields)
    .values({
      fieldKey: key,
      label: body.label,
      fieldType: body.fieldType || "text",
      options: Array.isArray(body.options) ? body.options : [],
      section: body.section || "سایر",
      isRequired: !!body.isRequired,
      isSearchable: body.isSearchable !== false,
      sortOrder: Number(body.sortOrder) || 0,
    })
    .returning();
  await logAudit({ entity: "custom_field", entityId: inserted[0].id, action: "create", user });
  return Response.json({ data: inserted[0] }, { status: 201 });
}
