import fs from "node:fs";
import path from "node:path";
import { MIME_BY_EXT, widgetFilePath } from "@/lib/widget-images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// تصاویر ویجت‌ها (عمومی: در صفحه‌ی ورود نیز استفاده می‌شوند)
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const p = widgetFilePath(file);
  if (!p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });
  const ext = path.extname(p).slice(1).toLowerCase();
  const buf = fs.readFileSync(p);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
      "Content-Length": String(buf.length),
      // نام فایل شامل زمان آپلود است؛ پس کش طولانی امن است
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
