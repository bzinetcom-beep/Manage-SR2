import { db } from "@/db";
import { serviceUnits, soldiers } from "@/db/schema";
import { eq, sql, isNull, asc } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  // Fetch defined service units
  const units = await db
    .select()
    .from(serviceUnits)
    .orderBy(asc(serviceUnits.name));

  // Get soldier counts per service unit from soldiers table
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

  // Combine DB serviceUnits with any distinct values from soldiers table not yet explicitly saved
  const existingNames = new Set(units.map((u) => u.name));
  const result = units.map((u) => ({
    ...u,
    soldierCount: countMap.get(u.name) || 0,
  }));

  // Append any soldier units not in table
  for (const [unitName, count] of countMap.entries()) {
    if (!existingNames.has(unitName)) {
      result.push({
        id: -1,
        name: unitName,
        code: null,
        description: null,
        createdAt: new Date(),
        soldierCount: count,
      });
    }
  }

  return Response.json({ data: result });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const code = body.code ? String(body.code).trim() : null;
    const description = body.description ? String(body.description).trim() : null;

    if (!name) {
      return Response.json({ error: "نام رده خدمتی الزامی است" }, { status: 400 });
    }

    const inserted = await db
      .insert(serviceUnits)
      .values({ name, code, description })
      .onConflictDoUpdate({
        target: serviceUnits.name,
        set: { code, description },
      })
      .returning();

    return Response.json({ data: inserted[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "خطا در ثبت رده خدمتی" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const name = searchParams.get("name");

    if (id) {
      await db.delete(serviceUnits).where(eq(serviceUnits.id, Number(id)));
    } else if (name) {
      await db.delete(serviceUnits).where(eq(serviceUnits.name, name));
    } else {
      return Response.json({ error: "شناسه یا نام رده خدمتی الزامی است" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "خطا در حذف رده خدمتی" }, { status: 500 });
  }
}
