import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.id);
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "فقط مدیر سیستم" }, { status: 403 });
  const body = await req.json();
  if (!body.username || !body.password || !body.fullName) {
    return Response.json({ error: "همه فیلدها الزامی است" }, { status: 400 });
  }
  const existing = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
  if (existing[0]) return Response.json({ error: "نام کاربری تکراری است" }, { status: 400 });
  const hash = await bcrypt.hash(String(body.password), 10);
  const inserted = await db
    .insert(users)
    .values({
      username: body.username,
      passwordHash: hash,
      fullName: body.fullName,
      role: ["admin", "operator", "viewer"].includes(body.role) ? body.role : "viewer",
    })
    .returning({ id: users.id, username: users.username, fullName: users.fullName, role: users.role });
  await logAudit({ entity: "user", entityId: inserted[0].id, action: "create", user });
  return Response.json({ data: inserted[0] }, { status: 201 });
}
