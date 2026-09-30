import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Health check.
 * کنار بررسی اتصال پایگاه‌داده، bootstrap سامانه را هم تضمین می‌کند تا پس از
 * نصب تازه (یا اجرای نصاب ویزاردی) همه‌چیز آماده باشد.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);

    // Bootstrap idempotent — خطای آن سلامت سرویس را تحت تأثیر قرار نمی‌دهد
    try {
      const { ensureDatabaseInitialized } = await import("@/db/init-db");
      await ensureDatabaseInitialized();
    } catch (e) {
      console.error("health bootstrap failed:", e);
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
