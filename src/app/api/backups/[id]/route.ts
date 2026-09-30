import fs from "node:fs";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { deleteBackup, getBackupById } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** دانلود فایل نسخه پشتیبان */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const row = await getBackupById(Number(id));
  if (!row) return Response.json({ error: "نسخه پشتیبان یافت نشد" }, { status: 404 });
  if (!fs.existsSync(row.filePath)) return Response.json({ error: "فایل روی دیسک موجود نیست" }, { status: 410 });
  const buf = fs.readFileSync(row.filePath);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.fileName)}"`,
      "Content-Length": String(buf.length),
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  try {
    await deleteBackup(Number(id));
    return Response.json({ data: { ok: true } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
