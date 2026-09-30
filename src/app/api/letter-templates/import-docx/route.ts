import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import { customPlaceholders, sanitizeHtml } from "@/lib/letter-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * آپلود قالب Word (.docx) → تبدیل به HTML → ثبت به‌عنوان قالب نامه.
 * جای‌نگهدارها می‌توانند به شکل {{کد_ملی}} یا [[کد_ملی]] یا <<کد_ملی>> در فایل Word باشند.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  await ensureBuiltinTemplates();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "فایل ارسال نشده است" }, { status: 400 });
  if (!/\.docx?$/i.test(file.name)) {
    return Response.json({ error: "فقط فایل Word با پسوند .docx پشتیبانی می‌شود" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let html = "";
  try {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h2:fresh",
          "table => table",
        ],
      },
    );
    html = result.value || "";
  } catch (err) {
    console.error("docx parse error", err);
    return Response.json({ error: "خواندن فایل Word ناموفق بود. فایل معتبر .docx بارگذاری کنید." }, { status: 400 });
  }

  if (!html.trim()) {
    return Response.json({ error: "محتوایی در فایل Word یافت نشد" }, { status: 400 });
  }

  // نرمال‌سازی سینتکس جای‌نگهدارها + استایل پایه جدول
  html = html
    .replace(/\[\[\s*([^\]]+?)\s*\]\]/g, "{{$1}}")
    .replace(/«\s*([^»]{1,40}?)\s*»/g, "{{$1}}")
    .replace(/<<\s*([^>]+?)\s*>>/g, "{{$1}}")
    .replace(/<table>/g, '<table style="width:100%;border-collapse:collapse;font-size:11pt">')
    .replace(/<td>/g, '<td style="border:1px solid #999;padding:6px">')
    .replace(/<th>/g, '<th style="border:1px solid #999;padding:6px;background:#f1f5f9">')
    .replace(/<p>/g, '<p style="line-height:2.1;text-align:justify;font-size:12pt">');

  const bodyHtml = sanitizeHtml(html);
  const params = customPlaceholders(bodyHtml).map((k) => ({
    key: k,
    label: k.replace(/_/g, " "),
    type: "text",
    defaultValue: "",
  }));

  const name = String(form.get("name") || file.name.replace(/\.docx?$/i, "")) || "قالب وارد شده";

  const inserted = await db
    .insert(letterTemplates)
    .values({
      name,
      category: String(form.get("category") || "وارد شده از Word"),
      description: `وارد شده از فایل ${file.name}`,
      subject: name,
      headerHtml: "",
      bodyHtml,
      footerHtml: "",
      pageSize: String(form.get("pageSize") || "A4") === "A5" ? "A5" : "A4",
      source: "docx",
      params,
      createdBy: user?.id,
      createdByName: user?.fullName,
    })
    .returning();

  await logAudit({ entity: "letter_template", entityId: inserted[0].id, action: "create", user });
  return Response.json({ data: inserted[0], detectedPlaceholders: params.map((p) => p.key) }, { status: 201 });
}
