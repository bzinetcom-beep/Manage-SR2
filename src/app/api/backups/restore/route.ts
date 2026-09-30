import { getCurrentUser, canWrite } from "@/lib/auth";
import { restoreBackup, BACKUP_FORMAT, readBackupFile, getBackupById } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * بازیابی سامانه از نسخه پشتیبان.
 * سه حالت پشتیبانی می‌شود:
 *   { id }                 → بازیابی از نسخه‌های ثبت‌شده در سامانه
 *   { filePath }           → بازیابی از مسیر دلخواه روی سرور
 *   multipart (file=…)     → آپلود فایل پشتیبان و بازیابی از آن
 * پارامتر confirm=true الزامی است (محافظت از اجرای تصادفی).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });

  const contentType = req.headers.get("content-type") || "";
  let source: { id?: number; filePath?: string; rawJson?: string } = {};
  let confirm = false;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      confirm = form.get("confirm") === "true";
      const id = form.get("id");
      const filePath = form.get("filePath");
      const file = form.get("file");
      if (file instanceof File) {
        const raw = await file.text();
        let parsed: { format?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          return Response.json({ error: "فایل انتخاب‌شده یک نسخه پشتیبان SRMS نیست" }, { status: 400 });
        }
        if (parsed.format !== BACKUP_FORMAT) {
          return Response.json({ error: "این فایل یک نسخه پشتیبان SRMS نیست" }, { status: 400 });
        }
        source = { rawJson: raw };
      } else if (id) {
        source = { id: Number(id) };
      } else if (filePath) {
        source = { filePath: String(filePath) };
      }
    } else {
      const body = (await req.json()) as { id?: number; filePath?: string; confirm?: boolean };
      confirm = Boolean(body.confirm);
      if (body.id) source = { id: Number(body.id) };
      else if (body.filePath) source = { filePath: body.filePath };
    }
  } catch (e) {
    return Response.json({ error: `خواندن درخواست ناموفق بود: ${(e as Error).message}` }, { status: 400 });
  }

  if (!confirm) {
    // بررسی پیش‌از اجرا: فقط اطلاعات فایل برگردانده می‌شود
    try {
      type PayloadInfo = { appVersion?: string; createdAt?: string; tableCounts?: Record<string, number> };
      let payload: PayloadInfo | null = null;
      if (source.rawJson) {
        payload = JSON.parse(source.rawJson) as PayloadInfo;
      } else if (source.id) {
        const row = await getBackupById(Number(source.id));
        if (row) payload = readBackupFile(row.filePath) as PayloadInfo;
      } else if (source.filePath) {
        payload = readBackupFile(source.filePath) as PayloadInfo;
      } else {
        return Response.json({ error: "منبع بازیابی مشخص نشده است" }, { status: 400 });
      }
      return Response.json({
        data: {
          dryRun: true,
          appVersion: payload?.appVersion,
          createdAt: payload?.createdAt,
          tableCounts: payload?.tableCounts || {},
        },
      });
    } catch {
      return Response.json({ error: "بررسی فایل پشتیبان ناموفق بود" }, { status: 400 });
    }
  }

  if (!source.id && !source.filePath && !source.rawJson) {
    return Response.json({ error: "منبع بازیابی مشخص نشده است" }, { status: 400 });
  }

  try {
    const res = await restoreBackup(source, user);
    return Response.json({ data: res });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
