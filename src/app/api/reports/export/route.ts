import { db } from "@/db";
import { soldiers, transfers } from "@/db/schema";
import { isNull, and, ilike, eq, sql } from "drizzle-orm";
import * as jalaali from "jalaali-js";
import * as XLSX from "xlsx";
import { getServiceStatus, parseSettledMode, settledCondition } from "@/lib/service-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim();
  const unit = searchParams.get("serviceUnit")?.trim();
  const marital = searchParams.get("maritalStatus")?.trim();
  const education = searchParams.get("educationLevel")?.trim();
  const rank = searchParams.get("rank")?.trim();
  const membership = searchParams.get("membershipType")?.trim();
  const blood = searchParams.get("bloodType")?.trim();
  const physical = searchParams.get("physicalStatus")?.trim();
  const separation = searchParams.get("separationType")?.trim();
  const front = searchParams.get("frontPresence")?.trim();
  const glasses = searchParams.get("wearsGlasses")?.trim();
  const transferType = searchParams.get("transferType")?.trim();
  const hasChildren = searchParams.get("hasChildren")?.trim();
  const marriageMonth = searchParams.get("marriageMonth")?.trim();
  const marriageDay = searchParams.get("marriageDay")?.trim();
  const serviceStatus = searchParams.get("serviceStatus")?.trim();

  const conds = [isNull(soldiers.deletedAt)];
  if (city) conds.push(ilike(soldiers.city, `%${city}%`));
  if (unit) conds.push(ilike(soldiers.serviceUnit, `%${unit}%`));
  if (marital) conds.push(eq(soldiers.maritalStatus, marital));
  if (education) conds.push(ilike(soldiers.educationLevel, `%${education}%`));
  if (rank) conds.push(ilike(soldiers.rank, `%${rank}%`));
  if (membership) conds.push(ilike(soldiers.membershipType, `%${membership}%`));
  if (blood) conds.push(eq(soldiers.bloodType, blood));
  if (physical) conds.push(ilike(soldiers.physicalStatus, `%${physical}%`));
  if (separation) conds.push(ilike(soldiers.separationType, `%${separation}%`));
  if (front) conds.push(ilike(soldiers.frontPresence, `%${front}%`));
  if (glasses) conds.push(eq(soldiers.wearsGlasses, glasses));
  if (hasChildren === "yes") conds.push(sql`${soldiers.childrenCount} > 0`);
  if (hasChildren === "no") conds.push(sql`${soldiers.childrenCount} = 0`);
  const settledCond = settledCondition(parseSettledMode(searchParams.get("settled")));
  if (settledCond) conds.push(settledCond);

  if (transferType) {
    const r = await db.select({ soldierId: transfers.soldierId }).from(transfers).where(eq(transfers.transferType, transferType));
    const ids = r.map((x) => x.soldierId);
    if (ids.length > 0) conds.push(sql`${soldiers.id} IN (${sql.join(ids, sql`, `)})`);
    else conds.push(sql`1 = 0`);
  }

  if (marriageMonth || marriageDay) {
    const allMarried = await db.select({ id: soldiers.id, marriageDate: soldiers.marriageDate }).from(soldiers).where(eq(soldiers.maritalStatus, "متاهل"));
    const matchedIds = allMarried.filter((s) => {
      if (!s.marriageDate) return false;
      const parts = s.marriageDate.split("T")[0].split("-");
      if (parts.length < 3) return false;
      const { jm, jd } = jalaali.toJalaali(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
      let mMatch = true, dMatch = true;
      if (marriageMonth) mMatch = jm === parseInt(marriageMonth);
      if (marriageDay) dMatch = jd === parseInt(marriageDay);
      return mMatch && dMatch;
    }).map((s) => s.id);
    if (matchedIds.length > 0) conds.push(sql`${soldiers.id} IN (${sql.join(matchedIds, sql`, `)})`);
    else conds.push(sql`1 = 0`);
  }

  let rows = await db.select().from(soldiers).where(and(...conds));
  if (serviceStatus === "تسویه شده" || serviceStatus === "در حال خدمت") {
    rows = rows.filter((r) => getServiceStatus(r.serviceEndDate) === serviceStatus);
  }

  const toJalali = (iso: string | null | undefined) => {
    if (!iso) return "";
    const p = iso.split("T")[0].split("-");
    if (p.length < 3) return "";
    const [y, m, d] = p.map((x) => parseInt(x, 10));
    if (y < 1900) return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
    const j = jalaali.toJalaali(y, m, d);
    return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
  };

  // ستون‌های اختیاری (شهر، تاریخ ازدواج، تعداد فرزند) فقط در صورت درخواست کاربر اضافه می‌شوند
  const optional = new Set((searchParams.get("optional") || "").split(",").map((x) => x.trim()).filter(Boolean));

  const data = rows.map((r) => {
    const row: Record<string, string | number> = {
      "کد پرسنلی": r.personnelCode || "",
      "کد ملی": r.nationalCode || "",
      "نام": r.firstName,
      "نام خانوادگی": r.lastName,
      "نام پدر": r.fatherName || "",
      "شماره تماس": r.phoneNumber || "",
      "وضعیت جسمانی": r.physicalStatus || "",
      "رده خدمتی": r.serviceUnit || "",
      "درجه": r.rank || "",
      "وضعیت تاهل": r.maritalStatus || "",
      "مدرک تحصیلی": r.educationLevel || "",
      "تاریخ اعزام": toJalali(r.dispatchDate),
      "تاریخ پایان خدمت": toJalali(r.serviceEndDate),
      "وضعیت خدمت": getServiceStatus(r.serviceEndDate),
    };
    if (optional.has("city")) row["شهر محل سکونت"] = r.city || "";
    if (optional.has("marriageDate")) row["تاریخ ازدواج"] = toJalali(r.marriageDate);
    if (optional.has("childrenCount")) row["تعداد فرزند"] = r.childrenCount ?? 0;
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = Object.keys(data[0] || {}).map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نتایج فیلتر");
  const arr: number[] = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const buf = Buffer.from(arr);

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="filtered-soldiers.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
