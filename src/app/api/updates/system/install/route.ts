import { getCurrentUser, isAdmin } from "@/lib/auth";
import { startSystemInstall, SystemPackageError } from "@/lib/system-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** مرحله‌ی ۲: شروع نصب (در پس‌زمینه). پیشرفت از /api/updates/system/status خوانده می‌شود. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بروزرسانی انجام دهد" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { token?: string; restart?: boolean; force?: boolean };
  try {
    await startSystemInstall({
      token: String(body.token || ""),
      restart: body.restart !== false,
      force: body.force === true,
      user: { id: user.id, fullName: user.fullName },
    });
    return Response.json({ ok: true, message: "نصب بروزرسانی آغاز شد" });
  } catch (e) {
    if (e instanceof SystemPackageError) return Response.json({ error: e.message }, { status: 400 });
    console.error("system install error:", e);
    return Response.json({ error: "خطا در شروع نصب بروزرسانی" }, { status: 500 });
  }
}
