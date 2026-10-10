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

  const existingNames = new Set(units.map((u) => u.name));
  const result = units.map((u) => {
    const soldierCount = countMap.get(u.name) || 0;
    const capacity = Number(u.capacity) > 0 ? Number(u.capacity) : 10;
    const mandatedPercentage = u.mandatedPercentage !== null && u.mandatedPercentage !== undefined
      ? Number(u.mandatedPercentage)
      : 80;
    const fillPercentage = capacity > 0 ? Math.round((soldierCount / capacity) * 100) : 0;
    const isShortage = fillPercentage < mandatedPercentage;
    const minRequiredSoldiers = Math.ceil((capacity * mandatedPercentage) / 100);
    const shortageCount = Math.max(0, minRequiredSoldiers - soldierCount);

    return {
      ...u,
      capacity,
      mandatedPercentage,
      soldierCount,
      fillPercentage,
      isShortage,
      minRequiredSoldiers,
      shortageCount,
    };
  });

  // Append any soldier units not yet registered in serviceUnits table
  for (const [unitName, count] of countMap.entries()) {
    if (!existingNames.has(unitName)) {
      const capacity = 10;
      const mandatedPercentage = 80;
      const fillPercentage = Math.round((count / capacity) * 100);
      const isShortage = fillPercentage < mandatedPercentage;
      const minRequiredSoldiers = Math.ceil((capacity * mandatedPercentage) / 100);
      const shortageCount = Math.max(0, minRequiredSoldiers - count);

      result.push({
        id: -1,
        name: unitName,
        code: null,
        description: null,
        capacity,
        mandatedPercentage,
        createdAt: new Date(),
        soldierCount: count,
        fillPercentage,
        isShortage,
        minRequiredSoldiers,
        shortageCount,
      });
    }
  }

  // Summary statistics
  const totalUnits = result.length;
  const shortageUnits = result.filter((u) => u.isShortage);
  const totalCapacity = result.reduce((s, u) => s + (u.capacity || 0), 0);
  const totalSoldiers = result.reduce((s, u) => s + (u.soldierCount || 0), 0);

  return Response.json({
    data: result,
    summary: {
      totalUnits,
      shortageUnitsCount: shortageUnits.length,
      totalCapacity,
      totalSoldiers,
      overallFillPercentage: totalCapacity > 0 ? Math.round((totalSoldiers / totalCapacity) * 100) : 0,
    },
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = body.id ? Number(body.id) : undefined;
    const name = String(body.name || "").trim();
    const code = body.code ? String(body.code).trim() : null;
    const description = body.description ? String(body.description).trim() : null;
    const capacity = body.capacity !== undefined ? Math.max(1, parseInt(String(body.capacity), 10) || 1) : 10;
    const mandatedPercentage = body.mandatedPercentage !== undefined
      ? Math.min(100, Math.max(0, parseInt(String(body.mandatedPercentage), 10) || 0))
      : 80;

    if (!name) {
      return Response.json({ error: "نام رده خدمتی الزامی است" }, { status: 400 });
    }

    if (id && id > 0) {
      const updated = await db
        .update(serviceUnits)
        .set({ name, code, description, capacity, mandatedPercentage })
        .where(eq(serviceUnits.id, id))
        .returning();
      return Response.json({ data: updated[0] });
    }

    const inserted = await db
      .insert(serviceUnits)
      .values({ name, code, description, capacity, mandatedPercentage })
      .onConflictDoUpdate({
        target: serviceUnits.name,
        set: { code, description, capacity, mandatedPercentage },
      })
      .returning();

    return Response.json({ data: inserted[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "خطا در ثبت رده خدمتی" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = body.id ? Number(body.id) : undefined;
    const name = String(body.name || "").trim();

    if (!id && !name) {
      return Response.json({ error: "شناسه یا نام رده خدمتی الزامی است" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.name) patch.name = String(body.name).trim();
    if (body.code !== undefined) patch.code = body.code ? String(body.code).trim() : null;
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.capacity !== undefined) patch.capacity = Math.max(1, parseInt(String(body.capacity), 10) || 1);
    if (body.mandatedPercentage !== undefined) {
      patch.mandatedPercentage = Math.min(100, Math.max(0, parseInt(String(body.mandatedPercentage), 10) || 0));
    }

    let updated;
    if (id && id > 0) {
      updated = await db.update(serviceUnits).set(patch).where(eq(serviceUnits.id, id)).returning();
    } else {
      updated = await db
        .insert(serviceUnits)
        .values({ name, ...patch })
        .onConflictDoUpdate({
          target: serviceUnits.name,
          set: patch,
        })
        .returning();
    }

    return Response.json({ data: updated[0] });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "خطا در به‌روزرسانی رده خدمتی" }, { status: 500 });
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
