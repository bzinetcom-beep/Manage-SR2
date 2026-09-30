import { getCurrentUser, isAdmin } from "@/lib/auth";
import { rollbackUpdateById, getSystemVersion, UpdateError } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** Roll back the newest applied update (one click «بازگشت به نسخه قبل»). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بازگشت نسخه انجام دهد" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const update = await rollbackUpdateById(Number(id), user);
    const currentVersion = await getSystemVersion();
    return Response.json({
      ok: true,
      update,
      currentVersion,
      message: `از نسخه‌ی ${update.version} به نسخه‌ی ${currentVersion} بازگشت انجام شد`,
    });
  } catch (e) {
    if (e instanceof UpdateError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    console.error("rollback error:", e);
    return Response.json({ error: "خطای داخلی در بازگشت نسخه" }, { status: 500 });
  }
}
