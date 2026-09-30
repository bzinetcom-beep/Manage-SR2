import { db } from "@/db";
import { customFields } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const { id } = await ctx.params;
  await db.delete(customFields).where(eq(customFields.id, Number(id)));
  await logAudit({ entity: "custom_field", entityId: Number(id), action: "delete", user });
  return Response.json({ ok: true });
}
