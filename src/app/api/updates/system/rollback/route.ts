import { getCurrentUser, isAdmin } from "@/lib/auth";
import { startSystemRollback, SystemPackageError } from "@/lib/system-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** بازگشت به نسخه‌ی قبل از یک نصب کامل (بازگردانی فایل‌ها از snapshot) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بازگشت دهد" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { snapshotId?: string; restart?: boolean };
  try {
    await startSystemRollback(String(body.snapshotId || ""), body.restart !== false, { id: user.id, fullName: user.fullName });
    return Response.json({ ok: true, message: "بازگشت به نسخه‌ی قبل آغاز شد" });
  } catch (e) {
    if (e instanceof SystemPackageError) return Response.json({ error: e.message }, { status: 400 });
    console.error("system rollback error:", e);
    return Response.json({ error: "خطا در شروع بازگشت" }, { status: 500 });
  }
}
