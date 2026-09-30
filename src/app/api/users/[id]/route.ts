import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const { id } = await ctx.params;
  const uid = Number(id);
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.fullName) patch.fullName = body.fullName;
  if (body.role && ["admin", "operator", "viewer"].includes(body.role)) patch.role = body.role;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  if (body.password) patch.passwordHash = await bcrypt.hash(String(body.password), 10);
  await db.update(users).set(patch).where(eq(users.id, uid));
  await logAudit({ entity: "user", entityId: uid, action: "update", user });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const { id } = await ctx.params;
  const uid = Number(id);
  if (uid === user?.id) return Response.json({ error: "حذف کاربر جاری ممکن نیست" }, { status: 400 });
  await db.delete(users).where(eq(users.id, uid));
  await logAudit({ entity: "user", entityId: uid, action: "delete", user });
  return Response.json({ ok: true });
}
