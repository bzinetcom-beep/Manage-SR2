import { db } from "@/db";
import { widgetSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { ensureDatabaseInitialized } from "@/db/init-db";
import { saveWidgetImage, type WidgetImageKind, MAX_WIDGET_IMAGE_BYTES } from "@/lib/widget-images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * آپلود تصویر ویجت (multipart/form-data): file + kind (quote | flag)
 * تصویر روی دیسک (پوشه‌ی data/uploads/widgets) ذخیره می‌شود و آدرس آن در دیتابیس ثبت می‌گردد؛
 * بنابراین با بستن و اجرای دوباره‌ی برنامه تصویر باقی می‌ماند.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "درخواست آپلود نامعتبر است" }, { status: 400 });
  }

  const kind = String(form.get("kind") || "");
  if (kind !== "quote" && kind !== "flag") {
    return Response.json({ error: "نوع ویجت نامعتبر است" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "فایلی انتخاب نشده است" }, { status: 400 });
  }
  if (file.size > MAX_WIDGET_IMAGE_BYTES) {
    return Response.json({ error: "حجم تصویر نباید بیش از ۸ مگابایت باشد" }, { status: 413 });
  }

  try {
    await ensureDatabaseInitialized();
    const buf = Buffer.from(await file.arrayBuffer());
    const { url } = saveWidgetImage(kind as WidgetImageKind, buf, file.type);

    const existing = await db.select({ id: widgetSettings.id }).from(widgetSettings).where(eq(widgetSettings.id, 1)).limit(1);
    if (existing.length === 0) await db.insert(widgetSettings).values({ id: 1 });
    await db
      .update(widgetSettings)
      .set(kind === "quote" ? { quoteImage: url, updatedAt: new Date() } : { flagImage: url, updatedAt: new Date() })
      .where(eq(widgetSettings.id, 1));

    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "خطا در ذخیره‌ی تصویر" }, { status: 400 });
  }
}
