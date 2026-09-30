import { getCurrentUser, isAdmin } from "@/lib/auth";
import { rollbackToVersion, getSystemVersion, UpdateError } from "@/lib/updates";

export const dynamic = "force-dynamic";

/**
 * One-click navigation to an older version: rolls back every applied update
 * newer than the requested version (newest first), then reports the journey.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بازگشت نسخه انجام دهد" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const version = String(body.version || "").trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return Response.json({ error: "نسخه‌ی مقصد معتبر نیست" }, { status: 400 });
    }
    const rolledBack = await rollbackToVersion(version, user);
    const currentVersion = await getSystemVersion();
    return Response.json({
      ok: true,
      rolledBack: rolledBack.map((u) => ({ id: u.id, version: u.version, title: u.title })),
      currentVersion,
      message: `سامانه به نسخه‌ی ${currentVersion} بازگشت (${rolledBack.length} بروزرسانی لغو شد)`,
    });
  } catch (e) {
    if (e instanceof UpdateError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    console.error("rollback-to error:", e);
    return Response.json({ error: "خطای داخلی در بازگشت نسخه" }, { status: 500 });
  }
}
