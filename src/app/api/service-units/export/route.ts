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
  const rows: any[] = units.map((u, idx) => {
    const active = countMap.get(u.name) || 0;
    const capacity = Number(u.capacity) > 0 ? Number(u.capacity) : 10;
    const mandated = u.mandatedPercentage !== null && u.mandatedPercentage !== undefined ? Number(u.mandatedPercentage) : 80;
    const fillPercent = Math.round((active / capacity) * 100);
    const isShortage = fillPercent < mandated;

    return {
      "ردیف": idx + 1,
      "نام رده خدمتی": u.name,
      "کد رده": u.code || "",
      "ظرفیت کل (نفر)": capacity,
      "ظرفیت ابلاغی (درصد)": `${mandated}%`,
      "تعداد سربازان فعال": active,
      "درصد اشغال": `${fillPercent}%`,
      "وضعیت نیرو": isShortage ? "⚠️ کمبود سرباز" : "✅ مناسب/تکمیل",
      "توضیحات": u.description || "",
    };
  });

  let index = rows.length;
  for (const [unitName, count] of countMap.entries()) {
    if (!existingNames.has(unitName)) {
      index++;
      const capacity = 10;
      const mandated = 80;
      const fillPercent = Math.round((count / capacity) * 100);
      const isShortage = fillPercent < mandated;

      rows.push({
        "ردیف": index,
        "نام رده خدمتی": unitName,
        "کد رده": "",
        "ظرفیت کل (نفر)": capacity,
        "ظرفیت ابلاغی (درصد)": `${mandated}%`,
        "تعداد سربازان فعال": count,
        "درصد اشغال": `${fillPercent}%`,
        "وضعیت نیرو": isShortage ? "⚠️ کمبود سرباز" : "✅ مناسب/تکمیل",
        "توضیحات": "",
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
