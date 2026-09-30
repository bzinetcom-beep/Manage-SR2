import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signSession, COOKIE_NAME } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { cookies } from "next/headers";
import { ensureDatabaseInitialized } from "@/db/init-db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureDatabaseInitialized();
    const { username, password } = await req.json();
    if (!username || !password) {
      return Response.json({ error: "نام کاربری و رمز عبور الزامی است" }, { status: 400 });
    }
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, String(username).trim()))
      .limit(1);
    const user = rows[0];
    if (!user || !user.isActive) {
      return Response.json({ error: "نام کاربری یا رمز عبور نادرست است" }, { status: 401 });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return Response.json({ error: "نام کاربری یا رمز عبور نادرست است" }, { status: 401 });
    }
    const sessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as "admin" | "operator" | "viewer",
    };
    const token = await signSession(sessionUser);
    const store = await cookies();
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    await logAudit({ entity: "user", entityId: user.id, action: "login", user: sessionUser });
    return Response.json({ user: sessionUser });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "خطای سرور" }, { status: 500 });
  }
}
