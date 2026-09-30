import { getCurrentUser, isAdmin } from "@/lib/auth";
import { stageSystemZip, SystemPackageError } from "@/lib/system-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** مرحله‌ی ۱: آپلود ZIP نسخه‌ی کامل جدید + بررسی و پیش‌نمایش تغییرات (هنوز چیزی نصب نمی‌شود) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return Response.json({ error: "فقط مدیر سیستم می‌تواند بروزرسانی انجام دهد" }, { status: 403 });
  }
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "فایل ZIP ارسال نشده است" }, { status: 400 });
    }
    if (!/\.zip$/i.test(file.name)) {
      return Response.json({ error: "فقط فایل با پسوند .zip پذیرفته می‌شود" }, { status: 400 });
    }
    const info = await stageSystemZip(file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, info });
  } catch (e) {
    if (e instanceof SystemPackageError) return Response.json({ error: e.message }, { status: 400 });
    console.error("system zip upload error:", e);
    return Response.json({ error: "خطا در خواندن فایل ZIP" }, { status: 500 });
  }
}
