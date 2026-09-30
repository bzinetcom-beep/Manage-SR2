import { db } from "@/db";
import { soldiers } from "@/db/schema";
import { and, asc, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { parseSettledMode, settledCondition, type SettledMode } from "@/lib/service-status";

export const dynamic = "force-dynamic";

/**
 * لیست سبک سربازان برای انتخاب گیرندگان نامه (تولید انبوه)
 * -----------------------------------------------------------------------------
 * - به‌صورت پیش‌فرض فقط «سربازان در حال خدمت» برگردانده می‌شوند.
 * - با پارامتر status می‌توان تسویه‌شده‌ها یا همه را گرفت:
 *     status=active   → در حال خدمت (پیش‌فرض)
 *     status=settled  → تسویه‌شده
 *     status=all      → همه
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const unit = url.searchParams.get("unit")?.trim();
  const rank = url.searchParams.get("rank")?.trim();
  const status: SettledMode = parseSettledMode(url.searchParams.get("status"));
  const limit = Math.min(5000, Number(url.searchParams.get("limit")) || 500);

  const conds: SQL[] = [isNull(soldiers.deletedAt) as SQL];
  const statusCond = settledCondition(status);
  if (statusCond) conds.push(statusCond);
  if (q) {
    const like = `%${q}%`;
    const c = or(
      ilike(soldiers.firstName, like),
      ilike(soldiers.lastName, like),
      ilike(soldiers.nationalCode, like),
      ilike(soldiers.personnelCode, like),
      ilike(soldiers.serviceUnit, like),
      ilike(soldiers.rank, like),
    );
    if (c) conds.push(c);
  }
  if (unit) conds.push(ilike(soldiers.serviceUnit, `%${unit}%`) as SQL);
  if (rank) conds.push(ilike(soldiers.rank, `%${rank}%`) as SQL);

  const where = and(...conds);

  const rows = await db
    .select({
      id: soldiers.id,
      firstName: soldiers.firstName,
      lastName: soldiers.lastName,
      nationalCode: soldiers.nationalCode,
      personnelCode: soldiers.personnelCode,
      rank: soldiers.rank,
      serviceUnit: soldiers.serviceUnit,
      serviceEndDate: soldiers.serviceEndDate,
      phoneNumber: soldiers.phoneNumber,
      physicalStatus: soldiers.physicalStatus,
    })
    .from(soldiers)
    .where(where)
    .orderBy(asc(soldiers.lastName))
    .limit(limit);

  const baseConds: SQL[] = [isNull(soldiers.deletedAt) as SQL];

  const units = await db
    .selectDistinct({ v: soldiers.serviceUnit })
    .from(soldiers)
    .where(and(...baseConds));
  const ranks = await db
    .selectDistinct({ v: soldiers.rank })
    .from(soldiers)
    .where(and(...baseConds));
  const totalRes = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(soldiers)
    .where(where);

  // شمارش کلی برای نمایش وضعیت خدمت در رابط کاربری
  const activeCond = settledCondition("exclude");
  const activeRes = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(soldiers)
    .where(activeCond ? and(...baseConds, activeCond) : and(...baseConds));
  const allRes = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(soldiers)
    .where(and(...baseConds));

  return Response.json({
    data: rows,
    total: totalRes[0]?.c ?? rows.length,
    units: units.map((u) => u.v).filter(Boolean),
    ranks: ranks.map((r) => r.v).filter(Boolean),
    counts: {
      matched: totalRes[0]?.c ?? rows.length,
      active: activeRes[0]?.c ?? 0,
      all: allRes[0]?.c ?? 0,
      settled: Math.max(0, (allRes[0]?.c ?? 0) - (activeRes[0]?.c ?? 0)),
    },
    status,
  });
}
