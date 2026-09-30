import { db } from "@/db";
import { letters } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { htmlToDocx, safeFileName } from "@/lib/docx-builder";
import { inArray } from "drizzle-orm";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseIds(v: string | null): number[] {
  return (v || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);
}

/**
 * خروجی Word:
 *   ?ids=1,2,3&mode=zip      → فایل ZIP شامل یک .docx برای هر نامه
 *   ?ids=1,2,3&mode=merged   → یک فایل .docx واحد (هر نامه در یک صفحه)
 *   ?ids=5                   → دانلود مستقیم همان نامه
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "احراز هویت نشده" }, { status: 401 });

  const url = new URL(req.url);
  const ids = parseIds(url.searchParams.get("ids"));
  const mode = url.searchParams.get("mode") || (ids.length > 1 ? "zip" : "single");
  if (!ids.length) return Response.json({ error: "شناسه‌ای ارسال نشده" }, { status: 400 });

  const rows = await db.select().from(letters).where(inArray(letters.id, ids));
  if (!rows.length) return Response.json({ error: "نامه‌ای یافت نشد" }, { status: 404 });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((i) => byId.get(i)).filter(Boolean) as typeof rows;

  if (mode === "merged" || (mode === "single" && ordered.length === 1)) {
    const buf = await htmlToDocx(
      ordered.map((r) => r.bodyHtml),
      { pageSize: ordered[0].pageSize, title: ordered[0].subject },
    );
    const name =
      ordered.length === 1
        ? `${safeFileName(`${ordered[0].templateName}-${ordered[0].soldierName}`)}.docx`
        : `letters-merged-${ordered.length}.docx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  }

  const zip = new JSZip();
  const seen = new Map<string, number>();
  for (const r of ordered) {
    const buf = await htmlToDocx([r.bodyHtml], { pageSize: r.pageSize, title: r.subject });
    let base = safeFileName(`${r.templateName}-${r.soldierName}-${r.nationalCode || r.id}`);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    if (n > 1) base = `${base}(${n})`;
    zip.file(`${base}.docx`, buf);
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipName = `letters-${ordered.length}.zip`;
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  });
}
