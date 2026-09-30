import { db } from "@/db";
import { soldiers, transfers, serviceAdjustments } from "@/db/schema";
import { isNull, and, ilike, eq, sql } from "drizzle-orm";
import * as jalaali from "jalaali-js";
import {
  getServiceStatus,
  parseSettledMode,
  settledCondition,
  settledRawSql,
  type SettledMode,
} from "@/lib/service-status";

export const dynamic = "force-dynamic";

function buildWhere(searchParams: URLSearchParams, settledMode: SettledMode = "exclude") {
  const conds = [isNull(soldiers.deletedAt)];
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
  const hasChildren = searchParams.get("hasChildren")?.trim();
  if (city) conds.push(ilike(soldiers.city, `%${city}%`));
  if (unit) conds.push(ilike(soldiers.serviceUnit, `%${unit}%`));
  if (marital) conds.push(eq(soldiers.maritalStatus, marital));
  if (education) conds.push(ilike(soldiers.educationLevel, `%${education}%`));
  if (hasChildren === "yes") conds.push(sql`${soldiers.childrenCount} > 0`);
  if (hasChildren === "no") conds.push(sql`${soldiers.childrenCount} = 0`);
  if (rank) conds.push(ilike(soldiers.rank, `%${rank}%`));
  if (membership) conds.push(ilike(soldiers.membershipType, `%${membership}%`));
  if (blood) conds.push(eq(soldiers.bloodType, blood));
  if (physical) conds.push(ilike(soldiers.physicalStatus, `%${physical}%`));
  if (separation) conds.push(ilike(soldiers.separationType, `%${separation}%`));
  if (front) conds.push(ilike(soldiers.frontPresence, `%${front}%`));
  if (glasses) conds.push(eq(soldiers.wearsGlasses, glasses));
  const sc = settledCondition(settledMode);
  if (sc) conds.push(sc);
  return and(...conds);
}

function clean(arr: { label: string | null; value: number }[]) {
  return arr.filter((r) => r.label != null && r.label !== "").map((r) => ({ label: r.label as string, value: Number(r.value) }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const quick = searchParams.get("quick") === "true";
  const settledMode = parseSettledMode(searchParams.get("settled"));
  const whereClause = buildWhere(searchParams, settledMode);
  // Unfiltered-by-settled condition — used to count hidden settled soldiers
  const whereAll = settledMode === "all" ? whereClause : buildWhere(searchParams, "all");

  if (quick) {
    // ── FAST PATH: dashboard only needs KPIs + 3 charts ──
    const [totalRes, byUnit, byCity, byMarital, byEducation, transfersRes, adjRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(soldiers).where(whereClause),
      db.select({ label: soldiers.serviceUnit, value: sql<number>`count(*)` }).from(soldiers).where(whereClause).groupBy(soldiers.serviceUnit).orderBy(sql`count(*) DESC`),
      db.select({ label: soldiers.city, value: sql<number>`count(*)` }).from(soldiers).where(whereClause).groupBy(soldiers.city).orderBy(sql`count(*) DESC`),
      db.select({ label: soldiers.maritalStatus, value: sql<number>`count(*)` }).from(soldiers).where(whereClause).groupBy(soldiers.maritalStatus).orderBy(sql`count(*) DESC`),
      db.select({ label: soldiers.educationLevel, value: sql<number>`count(*)` }).from(soldiers).where(whereClause).groupBy(soldiers.educationLevel).orderBy(sql`count(*) DESC`),
      db.select({ count: sql<number>`count(*)` }).from(transfers),
      db.select({ count: sql<number>`count(*)` }).from(serviceAdjustments),
    ]);

    // Dispatch trend via SQL extraction (no JS loop)
    const trendRows = await db.execute(sql`
      SELECT SUBSTRING(dispatch_date, 1, 4) AS yr, count(*) AS cnt
      FROM soldiers WHERE deleted_at IS NULL AND dispatch_date IS NOT NULL${sql.raw(settledRawSql(settledMode))}
      GROUP BY yr ORDER BY yr
    `);

    const dispatchTrend = (trendRows.rows as Array<{ yr: string; cnt: string | number }>)
      .filter((r) => r.yr && parseInt(r.yr) > 1300)
      .map((r) => ({ label: r.yr, value: Number(r.cnt) }));

    const total = Number(totalRes[0]?.count) || 0;

    // How many settled soldiers are currently hidden from the stats?
    let settledHidden = 0;
    if (settledMode !== "all") {
      const onlyCond = settledCondition("only");
      const [h] = await db
        .select({ count: sql<number>`count(*)` })
        .from(soldiers)
        .where(and(whereAll, onlyCond));
      settledHidden = Number(h?.count) || 0;
    }

    return Response.json({
      kpis: {
        total,
        married: byMarital.find((d) => d.label === "متاهل")?.value || 0,
        single: byMarital.find((d) => d.label === "مجرد")?.value || 0,
        transfers: Number(transfersRes[0]?.count) || 0,
        adjustments: Number(adjRes[0]?.count) || 0,
      },
      settledHidden,
      byUnit: clean(byUnit),
      byCity: clean(byCity),
      byEducation: clean(byEducation),
      byMarital: clean(byMarital),
      dispatchTrend,
    });
  }

  // ── FULL PATH: reports page with filters ──
  const transferType = searchParams.get("transferType")?.trim();
  const marriageMonth = searchParams.get("marriageMonth")?.trim();
  const marriageDay = searchParams.get("marriageDay")?.trim();
  const serviceStatus = searchParams.get("serviceStatus")?.trim();

  let finalConds = [whereClause];

  if (transferType) {
    const ids = await db.select({ soldierId: transfers.soldierId }).from(transfers).where(eq(transfers.transferType, transferType));
    const soldierIds = ids.map((r) => r.soldierId);
    if (soldierIds.length > 0) finalConds.push(sql`${soldiers.id} IN (${sql.join(soldierIds, sql`, `)})`);
    else finalConds.push(sql`1 = 0`);
  }
  if (marriageMonth || marriageDay) {
    const allMarried = await db.select({ id: soldiers.id, marriageDate: soldiers.marriageDate }).from(soldiers).where(eq(soldiers.maritalStatus, "متاهل"));
    const matchedIds = allMarried.filter((s) => {
      if (!s.marriageDate) return false;
      const parts = s.marriageDate.split("T")[0].split("-");
      if (parts.length < 3) return false;
      const { jy, jm, jd } = jalaali.toJalaali(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
      void jy;
      let m = true, d = true;
      if (marriageMonth) m = jm === parseInt(marriageMonth);
      if (marriageDay) d = jd === parseInt(marriageDay);
      return m && d;
    }).map((s) => s.id);
    if (matchedIds.length > 0) finalConds.push(sql`${soldiers.id} IN (${sql.join(matchedIds, sql`, `)})`);
    else finalConds.push(sql`1 = 0`);
  }

  const finalWhere = and(...finalConds);

  const [totalRes, byUnit, byCity, byEducation, byMarital, byRank, byBlood, byRecruitment, transfersRes, adjRes, mamoorRes, byTransferType] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(soldiers).where(finalWhere),
    db.select({ label: soldiers.serviceUnit, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.serviceUnit).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.city, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.city).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.educationLevel, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.educationLevel).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.maritalStatus, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.maritalStatus).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.rank, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.rank).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.bloodType, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.bloodType).orderBy(sql`count(*) DESC`),
    db.select({ label: soldiers.recruitmentType, value: sql<number>`count(*)` }).from(soldiers).where(finalWhere).groupBy(soldiers.recruitmentType).orderBy(sql`count(*) DESC`),
    db.select({ count: sql<number>`count(*)` }).from(transfers),
    db.select({ count: sql<number>`count(*)` }).from(serviceAdjustments),
    db.select({ count: sql<number>`count(*)` }).from(transfers).where(eq(transfers.transferType, "مامور")),
    db.select({ type: transfers.transferType, count: sql<number>`count(*)` }).from(transfers).groupBy(transfers.transferType).orderBy(sql`count(*) DESC`),
  ]);

  const total = Number(totalRes[0]?.count) || 0;

  const trendRows = await db.execute(sql`
    SELECT SUBSTRING(dispatch_date, 1, 4) AS yr, count(*) AS cnt
    FROM soldiers WHERE deleted_at IS NULL AND dispatch_date IS NOT NULL${sql.raw(settledRawSql(settledMode))}
    GROUP BY yr ORDER BY yr
  `);
  const dispatchTrend = (trendRows.rows as Array<{ yr: string; cnt: string | number }>)
    .filter((r) => r.yr && parseInt(r.yr) > 1300)
    .map((r) => ({ label: r.yr, value: Number(r.cnt) }));

  // Soldier list for table display
  const rows = await db.select({
    id: soldiers.id, personnelCode: soldiers.personnelCode, nationalCode: soldiers.nationalCode,
    firstName: soldiers.firstName, lastName: soldiers.lastName, fatherName: soldiers.fatherName,
    city: soldiers.city, serviceUnit: soldiers.serviceUnit, rank: soldiers.rank,
    maritalStatus: soldiers.maritalStatus, marriageDate: soldiers.marriageDate,
    childrenCount: soldiers.childrenCount, dispatchDate: soldiers.dispatchDate,
    serviceEndDate: soldiers.serviceEndDate, educationLevel: soldiers.educationLevel,
    phoneNumber: soldiers.phoneNumber, physicalStatus: soldiers.physicalStatus,
  }).from(soldiers).where(finalWhere).orderBy(soldiers.id);

  let soldierList: Array<Record<string, unknown>>;
  if (serviceStatus === "تسویه شده" || serviceStatus === "در حال خدمت") {
    soldierList = rows.filter((r) => getServiceStatus(r.serviceEndDate) === serviceStatus)
      .map((r) => ({ ...r, serviceStatus: getServiceStatus(r.serviceEndDate) }));
  } else {
    soldierList = rows.map((r) => ({ ...r, serviceStatus: getServiceStatus(r.serviceEndDate) }));
  }

  return Response.json({
    kpis: {
      total,
      married: byMarital.find((d) => d.label === "متاهل")?.value || 0,
      single: byMarital.find((d) => d.label === "مجرد")?.value || 0,
      transfers: Number(transfersRes[0]?.count) || 0,
      adjustments: Number(adjRes[0]?.count) || 0,
      mamoor: Number(mamoorRes[0]?.count) || 0,
    },
    byUnit: clean(byUnit), byCity: clean(byCity), byEducation: clean(byEducation),
    byMarital: clean(byMarital), byRank: clean(byRank), byBlood: clean(byBlood),
    byRecruitment: clean(byRecruitment),
    byTransferType: byTransferType.filter((r) => r.type).map((r) => ({ label: r.type as string, value: Number(r.count) })),
    dispatchTrend, totalFiltered: total, soldiers: soldierList,
  });
}
