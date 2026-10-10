import { db } from "@/db";
import { serviceAdjustments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recomputeServiceEndDate } from "@/lib/soldier-service";
import { toEnDigits } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(serviceAdjustments)
    .where(eq(serviceAdjustments.soldierId, Number(id)))
    .orderBy(serviceAdjustments.id);
  // مرخصی‌ها در جدول پایان خدمت نمایش داده نمی‌شوند
  const filtered = rows.filter(
    (a) => !a.type || (!a.type.includes("مرخصی") && !a.type.includes("استحقاق") && !a.type.includes("استعلاج") && !a.type.includes("تشویق"))
  );
  return Response.json({ data: filtered });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const { id } = await ctx.params;
  const soldierId = Number(id);
  try {
    const body = await req.json();

    if (body.type && (body.type.includes("مرخصی") || body.type.includes("استحقاق") || body.type.includes("استعلاج") || body.type.includes("تشویق"))) {
      return Response.json(
        { error: "مرخصی‌ها هیچ تاثیری در پایان خدمت ندارند و باید در بخش مستقل «مرخصی» ثبت گردند." },
        { status: 400 }
      );
    }
    const inserted = await db
      .insert(serviceAdjustments)
      .values({
        soldierId,
        type: body.type,
        effectDirection: body.effectDirection === "decrease" ? "decrease" : body.effectDirection === "neutral" ? "neutral" : "increase",
        days: Number(toEnDigits(String(body.days ?? ""))) || 0,
        effectiveDate: body.effectiveDate || null,
        title: body.title || null,
        description: body.description || null,
        legalDocumentNumber: body.legalDocumentNumber || null,
        createdBy: user?.id ?? null,
      })
      .returning();
    const end = await recomputeServiceEndDate(soldierId);
    await logAudit({
      entity: "adjustment",
      entityId: inserted[0].id,
      action: "create",
      user,
      changes: { after: inserted[0], newServiceEndDate: end },
    });
    return Response.json({ data: inserted[0], serviceEndDate: end }, { status: 201 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "خطا در ثبت تغییر خدمت" }, { status: 500 });
  }
}
