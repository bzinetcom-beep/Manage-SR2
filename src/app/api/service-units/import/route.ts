import { db } from "@/db";
import { serviceUnits } from "@/db/schema";
import { getCurrentUser, canWrite } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// Template download
export async function GET() {
  const sampleRows = [
    {
      "نام رده خدمتی": "منابع سرباز",
      "کد رده": "SR-01",
      "ظرفیت کل (نفر)": 5,
      "ظرفیت ابلاغی (درصد)": 80,
      "توضیحات": "مدیریت و نیروی انسانی سربازان",
    },
    {
      "نام رده خدمتی": "تیپ ۵۵ هوابرد",
      "کد رده": "U-55",
      "ظرفیت کل (نفر)": 15,
      "ظرفیت ابلاغی (درصد)": 85,
      "توضیحات": "یگان هوابرد و چتربازی",
    },
    {
      "نام رده خدمتی": "مرکز فاوا و ارتباطات",
      "کد رده": "U-ICT",
      "ظرفیت کل (نفر)": 8,
      "ظرفیت ابلاغی (درصد)": 75,
      "توضیحات": "واحد فناوری اطلاعات و مخابرات",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "الگوی رده‌های خدمتی");

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="service_units_template.xlsx"',
    },
  });
}

// File upload handler
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "فایل اکسل انتخاب نشده است" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return Response.json({ error: "شیت اکسل یافت نشد" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (!rawData || rawData.length === 0) {
      return Response.json({ error: "فایل اکسل خالی است" }, { status: 400 });
    }

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      // Match header names
      const name = String(
        row["نام رده خدمتی"] ||
          row["نام رده"] ||
          row["رده خدمتی"] ||
          row["نام یگان"] ||
          row["یگان"] ||
          row["unit"] ||
          row["name"] ||
          ""
      ).trim();

      const code = row["کد رده"] || row["کد یگان"] || row["کد"] || row["code"] ? String(row["کد رده"] || row["کد یگان"] || row["کد"] || row["code"]).trim() : null;
      const description = row["توضیحات"] || row["شرح"] || row["description"] ? String(row["توضیحات"] || row["شرح"] || row["description"]).trim() : null;

      const rawCap = row["ظرفیت کل (نفر)"] ?? row["ظرفیت کل"] ?? row["ظرفیت"] ?? row["capacity"];
      const rawMandated = row["ظرفیت ابلاغی (درصد)"] ?? row["ظرفیت ابلاغی"] ?? row["درصد ابلاغی"] ?? row["mandatedPercentage"] ?? row["mandated_percentage"];

      const capacity = rawCap !== undefined && rawCap !== null && rawCap !== ""
        ? Math.max(1, parseInt(String(rawCap).replace(/[^0-9]/g, ""), 10) || 10)
        : 10;

      const mandatedPercentage = rawMandated !== undefined && rawMandated !== null && rawMandated !== ""
        ? Math.min(100, Math.max(0, parseInt(String(rawMandated).replace(/[^0-9]/g, ""), 10) || 80))
        : 80;

      if (!name) {
        errors.push(`ردیف ${i + 2}: نام رده خدمتی خالی است.`);
        continue;
      }

      try {
        const res = await db
          .insert(serviceUnits)
          .values({ name, code, description, capacity, mandatedPercentage })
          .onConflictDoUpdate({
            target: serviceUnits.name,
            set: { code, description, capacity, mandatedPercentage },
          })
          .returning();

        if (res.length > 0) {
          created++;
        }
      } catch (e: any) {
        errors.push(`ردیف ${i + 2} (${name}): ${e.message || "خطا در ثبت"}`);
      }
    }

    return Response.json({
      success: true,
      totalRows: rawData.length,
      created,
      errors,
    });
  } catch (err: any) {
    console.error("Excel import error:", err);
    return Response.json({ error: "خطا در پردازش فایل اکسل: " + err.message }, { status: 500 });
  }
}
