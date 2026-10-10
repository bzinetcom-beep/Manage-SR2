import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Health check.
 * کنار بررسی اتصال پایگاه‌داده، bootstrap سامانه را هم تضمین می‌کند تا پس از
 * نصب تازه (یا اجرای نصاب ویزاردی) همه‌چیز آماده باشد.
 */
export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;

    // Bootstrap idempotent — خطای آن سلامت سرویس را تحت تأثیر قرار نمی‌دهد
    try {
      const { ensureDatabaseInitialized } = await import("@/db/init-db");
      await ensureDatabaseInitialized();
    } catch (e) {
      console.error("health bootstrap failed:", e);
    }
  } catch {
    dbOk = false;
  }

  return Response.json({ ok: true, status: "healthy", database: dbOk ? "connected" : "mock" });
}
