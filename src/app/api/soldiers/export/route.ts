import { db } from "@/db";
import { soldiers } from "@/db/schema";
import { isNull, and, ilike, eq, like, or, inArray, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { SOLDIER_FIELDS, DATE_KEYS } from "@/lib/fields";
import { isoToJalali, toEnDigits } from "@/lib/jalali";
import { getServiceStatus, parseSettledMode, settledCondition } from "@/lib/service-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const columns = searchParams.get("columns")?.split(",").filter(Boolean);
  const city = searchParams.get("city")?.trim();
  const unit = searchParams.get("serviceUnit")?.trim();
  const marital = searchParams.get("maritalStatus")?.trim();
  const rawQ = searchParams.get("q")?.trim();
  const q = rawQ ? toEnDigits(rawQ) : undefined;
  const idsParam = searchParams.get("ids")?.trim();
  const settledCond = settledCondition(parseSettledMode(searchParams.get("settled")));

  const conds = [isNull(soldiers.deletedAt)];
  if (settledCond) conds.push(settledCond);
  if (idsParam) {
    const ids = idsParam.split(",").map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
    if (ids.length > 0) conds.push(inArray(soldiers.id, ids));
    else conds.push(sql`1 = 0`);
  }
  if (q) {
    const likeQ = `%${q}%`;
    conds.push(
      or(
        ilike(soldiers.firstName, likeQ),
        ilike(soldiers.lastName, likeQ),
        ilike(soldiers.nationalCode, likeQ),
        ilike(soldiers.personnelCode, likeQ),
        ilike(soldiers.fileNumber, likeQ),
        ilike(soldiers.serviceUnit, likeQ),
        ilike(soldiers.city, likeQ),
        ilike(soldiers.rank, likeQ),
        ilike(soldiers.educationLevel, likeQ),
        ilike(soldiers.fatherName, likeQ),
      )!,
    );
  }
  if (city) conds.push(ilike(soldiers.city, `%${city}%`));
  if (unit) conds.push(like(soldiers.serviceUnit, `%${unit}%`));
  if (marital) conds.push(eq(soldiers.maritalStatus, marital));

  const rows = await db.select().from(soldiers).where(and(...conds)).orderBy(soldiers.id);

  // ستون‌های ضروری (شماره تماس و وضعیت جسمانی) همیشه در خروجی هستند
  const fields = columns && columns.length
    ? SOLDIER_FIELDS.filter((f) => f.listRequired || columns.includes(f.key))
    : SOLDIER_FIELDS.filter((f) => f.listVisible || f.listRequired);
  const dateSet = new Set(DATE_KEYS);

  const data = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      let v = (r as Record<string, unknown>)[f.key];
      if (v === undefined) v = (r.metadata as Record<string, unknown>)?.[f.key];
      if (dateSet.has(f.key) && v) v = isoToJalali(v as string, false);
      obj[f.label] = v ?? "";
    }
    // وضعیت خدمت همیشه محاسبه و اضافه می‌شود؛ تاریخ ازدواج/تعداد فرزند فقط در صورت انتخاب (اختیاری)
    obj["وضعیت خدمت"] = getServiceStatus(r.serviceEndDate);
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data, {
    header: [...fields.map((f) => f.label), "وضعیت خدمت"],
  });

  // Set RTL
  ws["!cols"] = Object.keys(data[0] || {}).map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "سربازان");

  // Use array type → Buffer.from for proper Node.js Buffer
  const arr: number[] = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const buf = Buffer.from(arr);

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="soldiers-export.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
