import { db } from "@/db";
import { soldiers } from "@/db/schema";
import { and, isNull, ilike, or, eq, sql } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { splitPayload, applyRankDefault } from "@/lib/soldier-service";
import { computeServiceEndDate } from "@/lib/service-date";
import { parseSettledMode, settledCondition } from "@/lib/service-status";
export const dynamic = "force-dynamic";

/** Convert Persian/Arabic digits to English digits */
function toEnDigits(input: string): string {
  if (!input) return "";
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim();
  // Convert Persian/Arabic digits to English for search
  const q = rawQ ? toEnDigits(rawQ) : undefined;
  const city = searchParams.get("city")?.trim();
  const unit = searchParams.get("serviceUnit")?.trim();
  const marital = searchParams.get("maritalStatus")?.trim();
  const education = searchParams.get("educationLevel")?.trim();
  const showAll = searchParams.get("showAll")?.trim();
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Settled filter: exclude (default) | only | all — settled soldiers are
  // hidden from the main list unless explicitly requested.
  const settledCond = settledCondition(parseSettledMode(searchParams.get("settled")));

  // Build conditions array
  const conds: ReturnType<typeof isNull>[] = [];
  conds.push(isNull(soldiers.deletedAt));
  if (settledCond) conds.push(settledCond);

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
  if (unit) conds.push(ilike(soldiers.serviceUnit, `%${unit}%`));
  if (marital) conds.push(eq(soldiers.maritalStatus, marital));
  if (education) conds.push(ilike(soldiers.educationLevel, `%${education}%`));

  // Show all mode: server-side pagination
  if (showAll === "true") {
    const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(soldiers)
      .where(and(...conds));

    const rows = await db
      .select()
      .from(soldiers)
      .where(and(...conds))
      .orderBy(soldiers.id)
      .limit(PAGE_SIZE)
      .offset(offset);

    return Response.json({
      data: rows,
      total: Number(count),
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(Number(count) / PAGE_SIZE),
      showAll: true,
    });
  }

  // Default mode: return matching rows with limit (for search)
  const rows = await db
    .select()
    .from(soldiers)
    .where(and(...conds))
    .orderBy(soldiers.id)
    .limit(100);

  return Response.json({ data: rows, total: rows.length });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!body.firstName || !body.lastName) {
      return Response.json({ error: "نام و نام خانوادگی الزامی است" }, { status: 400 });
    }
    const { fixed, metadata } = splitPayload(body);

    applyRankDefault(fixed, null);
    const dispatch = (fixed.dispatchDate as string) || null;
    const end = computeServiceEndDate(dispatch, []);
    if (end) fixed.serviceEndDate = end;

    const maxRow = await db
      .select({ m: sql<number>`coalesce(max(${soldiers.rowNumber}),0)` })
      .from(soldiers);
    if (!fixed.rowNumber) fixed.rowNumber = (maxRow[0]?.m ?? 0) + 1;

    const inserted = await db
      .insert(soldiers)
      .values({
        ...(fixed as Record<string, unknown>),
        metadata,
        createdBy: user?.id ?? null,
      } as typeof soldiers.$inferInsert)
      .returning();

    await logAudit({
      entity: "soldier",
      entityId: inserted[0].id,
      action: "create",
      user,
      changes: { after: inserted[0] },
    });

    // Real-Time Notification Evaluation Hook
    try {
      const { evaluateSoldierNotifications } = await import("@/lib/notification-engine");
      await evaluateSoldierNotifications(inserted[0].id);
    } catch (e) {
      console.error("Realtime notification trigger error:", e);
    }

    return Response.json({ data: inserted[0] }, { status: 201 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "خطا در ثبت سرباز" }, { status: 500 });
  }
}
