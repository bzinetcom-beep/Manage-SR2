import { db } from "@/db";
import { soldiers } from "@/db/schema";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { normalizeKey } from "@/lib/letter-engine";
import { toEnDigits } from "@/lib/jalali";
import { isNull, or, eq, inArray, and } from "drizzle-orm";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID_KEYS = ["کد ملی", "کد_ملی", "national_code", "nationalcode", "کدملی"];
const PERSONNEL_KEYS = ["شماره پرسنلی", "کد پرسنلی", "personnel_code", "شماره_پرسنلی"];
const NAME_KEYS = ["نام و نام خانوادگی", "نام کامل", "full_name", "نام_و_نام_خانوادگی"];
const FIRST_KEYS = ["نام", "first_name"];
const LAST_KEYS = ["نام خانوادگی", "last_name", "فامیلی"];

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const nk = normalizeKey(k);
    if (keys.some((c) => normalizeKey(c) === nk)) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

/**
 * آپلود اکسل → تطبیق ردیف‌ها با سربازان موجود.
 * ستون‌های اضافی (غیر از شناسه‌ها) به‌عنوان «پارامتر اختصاصی هر سرباز» برگردانده می‌شوند،
 * بنابراین می‌توان مثلاً ستون «درجه_جدید» را برای هر نفر متفاوت در نامه درج کرد.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return Response.json({ error: "فایل ارسال نشده است یا فرمت معتبر ندارد" }, { status: 400 });
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await (file as File).arrayBuffer());
    } catch {
      return Response.json({ error: "خطا در خواندن فایل ارسال‌شده" }, { status: 400 });
    }

    let rows: Record<string, unknown>[] = [];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        return Response.json({ error: "فایل اکسل فاقد برگه (Sheet) می‌باشد" }, { status: 400 });
      }
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        return Response.json({ error: "برگه اول فایل اکسل خالی است" }, { status: 400 });
      }
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    } catch {
      return Response.json({ error: "خواندن فایل اکسل ناموفق بود یا قالب فایل آسیب دیده است" }, { status: 400 });
    }
    if (!rows || !rows.length) return Response.json({ error: "فایل اکسل خالی است" }, { status: 400 });
    if (rows.length > 5000) return Response.json({ error: "حداکثر ۵۰۰۰ ردیف مجاز است" }, { status: 400 });

    const nationalCodes: string[] = [];
    const personnelCodes: string[] = [];
    const parsed = rows.map((r) => {
      const nc = toEnDigits(pick(r, ID_KEYS)).replace(/\D/g, "");
      const pc = toEnDigits(pick(r, PERSONNEL_KEYS));
      const fullName = pick(r, NAME_KEYS) || `${pick(r, FIRST_KEYS)} ${pick(r, LAST_KEYS)}`.trim();
      if (nc) nationalCodes.push(nc);
      if (pc) personnelCodes.push(pc);
      const extra: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        const nk = normalizeKey(k);
        if ([...ID_KEYS, ...PERSONNEL_KEYS, ...NAME_KEYS, ...FIRST_KEYS, ...LAST_KEYS].some((c) => normalizeKey(c) === nk)) continue;
        if (v === null || v === undefined || String(v).trim() === "") continue;
        extra[nk] = String(v).trim();
      }
      return { nc, pc, fullName, extra };
    });

    const conds = [];
    if (nationalCodes.length) conds.push(inArray(soldiers.nationalCode, [...new Set(nationalCodes)]));
    if (personnelCodes.length) conds.push(inArray(soldiers.personnelCode, [...new Set(personnelCodes)]));
    const filter = conds.length > 1 ? or(...conds) : conds[0];

    const found = filter
      ? await db
          .select()
          .from(soldiers)
          .where(and(isNull(soldiers.deletedAt), filter))
      : [];

    const byNc = new Map(
      (found || []).filter((s) => s && s.nationalCode).map((s) => [s.nationalCode as string, s]),
    );
    const byPc = new Map(
      (found || []).filter((s) => s && s.personnelCode).map((s) => [s.personnelCode as string, s]),
    );

    const matched: { id: number; name: string; nationalCode: string | null; serviceUnit: string | null; params: Record<string, string> }[] = [];
    const unmatched: { row: number; nationalCode: string; personnelCode: string; name: string }[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      let s = (p.nc && byNc.get(p.nc)) || (p.pc && byPc.get(p.pc)) || null;
      if (!s && p.fullName) {
        const parts = p.fullName.split(/\s+/);
        const ln = parts.slice(1).join(" ") || parts[0];
        const fn = parts[0];
        try {
          const byName = await db
            .select()
            .from(soldiers)
            .where(and(isNull(soldiers.deletedAt), eq(soldiers.firstName, fn), eq(soldiers.lastName, ln)))
            .limit(1);
          s = byName?.[0] || null;
        } catch {
          s = null;
        }
      }
      if (s && s.id != null) {
        matched.push({
          id: s.id,
          name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
          nationalCode: s.nationalCode || null,
          serviceUnit: s.serviceUnit || null,
          params: p.extra || {},
        });
      } else {
        unmatched.push({ row: i + 2, nationalCode: p.nc || "", personnelCode: p.pc || "", name: p.fullName || "" });
      }
    }

    const extraColumns = [...new Set(matched.flatMap((m) => (m && m.params ? Object.keys(m.params) : [])))];

    return Response.json({
      data: {
        totalRows: rows.length,
        matched,
        unmatched,
        extraColumns,
      },
    });
  } catch (err: any) {
    console.error("[letters/import-excel] Unexpected error:", err);
    return Response.json({ error: err?.message || "خطای سرور در پردازش فایل اکسل" }, { status: 500 });
  }
}
