import { db } from "@/db";
import { serviceUnits, soldiers } from "@/db/schema";
import { sql, isNull, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET() {
  const units = await db.select().from(serviceUnits).orderBy(asc(serviceUnits.name));

  const counts = await db
    .select({
      serviceUnit: soldiers.serviceUnit,
      count: sql<number>`count(*)`,
    })
    .from(soldiers)
    .where(isNull(soldiers.deletedAt))
    .groupBy(soldiers.serviceUnit);

  const countMap = new Map<string, number>();
  counts.forEach((c) => {
    if (c.serviceUnit) countMap.set(c.serviceUnit, Number(c.count));
  });

  const existingNames = new Set(units.map((u) => u.name));
  const rows: any[] = units.map((u, idx) => ({
    "ردیف": idx + 1,
    "نام رده خدمتی": u.name,
    "کد رده": u.code || "",
    "توضیحات": u.description || "",
    "تعداد سربازان فعال": countMap.get(u.name) || 0,
  }));

  let index = rows.length;
  for (const [unitName, count] of countMap.entries()) {
    if (!existingNames.has(unitName)) {
      index++;
      rows.push({
        "ردیف": index,
        "نام رده خدمتی": unitName,
        "کد رده": "",
        "توضیحات": "",
        "تعداد سربازان فعال": count,
      });
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "رده‌های خدمتی");

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="service_units_${Date.now()}.xlsx"`,
    },
  });
}
