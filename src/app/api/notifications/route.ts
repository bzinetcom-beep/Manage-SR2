import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  let whereClause;
  if (status === "unread") whereClause = eq(notifications.status, "unread");
  else if (status === "read") whereClause = eq(notifications.status, "read");
  else if (status === "archived") whereClause = eq(notifications.status, "archived");

  const rows = whereClause
    ? await db.select().from(notifications).where(whereClause).orderBy(desc(notifications.triggeredAt)).limit(200)
    : await db.select().from(notifications).orderBy(desc(notifications.triggeredAt)).limit(200);

  const unreadCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.status, "unread"));

  return Response.json({
    data: rows,
    unreadCount: Number(unreadCount[0]?.count) || 0,
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { ids, action } = body as { ids?: number[]; action?: "read" | "unread" | "archive" | "read_all" };

  if (action === "read_all") {
    await db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(eq(notifications.status, "unread"));
    return Response.json({ ok: true });
  }

  if (!ids || ids.length === 0) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }

  const update: { status?: string; readAt?: Date | null } = {};
  if (action === "read") {
    update.status = "read";
    update.readAt = new Date();
  } else if (action === "unread") {
    update.status = "unread";
    update.readAt = null;
  } else if (action === "archive") {
    update.status = "archived";
  }

  await db.update(notifications).set(update).where(inArray(notifications.id, ids));
  const unread = await db.select({ c: sql<number>`count(*)` }).from(notifications).where(eq(notifications.status, "unread"));
  return Response.json({ ok: true, unreadCount: Number(unread[0]?.c) || 0 });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { ids } = body as { ids?: number[] };
  if (!ids || ids.length === 0) return Response.json({ error: "ids required" }, { status: 400 });

  await db.delete(notifications).where(inArray(notifications.id, ids));
  return Response.json({ ok: true });
}
