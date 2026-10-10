import { db } from "@/db";
import { widgetSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { ensureDatabaseInitialized } from "@/db/init-db";
import {
  persistedWidgetImageUrl,
  removeWidgetImage,
  saveWidgetImageFromDataUrl,
  type WidgetImageKind,
} from "@/lib/widget-images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = typeof widgetSettings.$inferSelect;

function toPublic(r?: Row | null) {
  return {
    quoteText: r?.quoteText || "خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد",
    quoteAuthor: r?.quoteAuthor || "قائد شهید امت",
    // اگر دیتابیس خالی بود ولی تصویر روی دیسک باقی مانده باشد، همان نمایش داده می‌شود
    quoteImage: r?.quoteImage || persistedWidgetImageUrl("quote") || "",
    quoteImageFit: r?.quoteImageFit || "contain",
    flagImage: r?.flagImage || persistedWidgetImageUrl("flag") || "",
  };
}

async function loadRow(): Promise<Row | null> {
  try {
    let row = await db.select().from(widgetSettings).where(eq(widgetSettings.id, 1)).limit(1);
    if (!row || row.length === 0) {
      await db.insert(widgetSettings).values({ id: 1 }).catch(() => {});
      row = await db.select().from(widgetSettings).where(eq(widgetSettings.id, 1)).limit(1).catch(() => []);
    }
    return row && row[0] ? row[0] : null;
  } catch {
    return null;
  }
}

// GET: publicly available (used by login page)
export async function GET() {
  try {
    await ensureDatabaseInitialized().catch(() => {});
    const row = await loadRow();
    return Response.json({ data: toPublic(row) });
  } catch (e) {
    console.error("widget-settings GET failed", e);
    return Response.json({ data: toPublic(null) });
  }
}

/** مقدار تصویر ورودی را به آدرس ماندگار تبدیل می‌کند (data-URL → فایل روی دیسک، خالی → حذف). */
function resolveImage(kind: WidgetImageKind, value: string): string {
  if (!value) {
    removeWidgetImage(kind);
    return "";
  }
  if (value.startsWith("data:image/")) {
    return saveWidgetImageFromDataUrl(kind, value).url;
  }
  return value;
}

// PUT: admin-only
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "بدنه نامعتبر" }, { status: 400 });
  }

  try {
    await ensureDatabaseInitialized();
    await loadRow(); // مطمئن می‌شویم ردیف تنظیمات وجود دارد

    const update: Partial<typeof widgetSettings.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.quoteText === "string") update.quoteText = body.quoteText.trim().slice(0, 1000);
    if (typeof body.quoteAuthor === "string") update.quoteAuthor = body.quoteAuthor.trim().slice(0, 200);
    if (typeof body.quoteImage === "string") update.quoteImage = resolveImage("quote", body.quoteImage);
    if (body.quoteImageFit === "cover" || body.quoteImageFit === "contain") update.quoteImageFit = body.quoteImageFit;
    if (typeof body.flagImage === "string") update.flagImage = resolveImage("flag", body.flagImage);

    await db.update(widgetSettings).set(update).where(eq(widgetSettings.id, 1));
    return Response.json({ data: toPublic(await loadRow()) });
  } catch (e) {
    console.error("widget-settings PUT failed", e);
    return Response.json({ error: (e as Error).message || "خطا در ذخیره تنظیمات ویجت" }, { status: 400 });
  }
}
