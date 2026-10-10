import { db } from "@/db";
import { soldiers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { toEnDigits } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export interface SoldierLeaveItem {
  id: string;
  type: "مرخصی استحقاقی" | "مرخصی استعلاجی" | "مرخصی تشویقی" | "مرخصی بین‌راهی" | "مرخصی بدون حقوق";
  status: "استفاده شده" | "استفاده نشده"; // استفاده شده یا سهمیه/طلب مرخصی
  days: number;
  startDate: string | null;
  endDate: string | null;
  docNumber: string | null;
  approver: string | null;
  description: string | null;
  createdAt: string;
}

export interface LeaveQuotas {
  eligibleQuota?: number;
  medicalQuota?: number;
}

async function getSoldierRecord(id: number) {
  const rows = await db
    .select()
    .from(soldiers)
    .where(and(eq(soldiers.id, id), isNull(soldiers.deletedAt)))
    .limit(1);
  return rows[0] || null;
}

function computeLeaveSummary(
  leaves: SoldierLeaveItem[],
  soldierMaritalStatus: string | null | undefined,
  quotas?: LeaveQuotas | null
) {
  const isMarried = soldierMaritalStatus === "متاهل";
  const defaultEligibleQuota = isMarried ? 36 : 30;
  const eligibleQuota = quotas?.eligibleQuota && quotas.eligibleQuota > 0 ? quotas.eligibleQuota : defaultEligibleQuota;
  const medicalQuota = quotas?.medicalQuota && quotas.medicalQuota > 0 ? quotas.medicalQuota : 30;

  let eligibleUsed = 0;
  let eligibleUnusedRegistered = 0;

  let medicalUsed = 0;
  let medicalUnusedRegistered = 0;

  let incentiveUsed = 0;
  let incentiveUnusedRegistered = 0;

  let otherUsed = 0;
  let otherUnusedRegistered = 0;

  for (const l of leaves) {
    const d = Number(l.days) || 0;
    const isUsed = l.status === "استفاده شده";

    if (l.type.includes("استحقاق")) {
      if (isUsed) eligibleUsed += d;
      else eligibleUnusedRegistered += d;
    } else if (l.type.includes("استعلاج") || l.type.includes("پزشکی")) {
      if (isUsed) medicalUsed += d;
      else medicalUnusedRegistered += d;
    } else if (l.type.includes("تشویق")) {
      if (isUsed) incentiveUsed += d;
      else incentiveUnusedRegistered += d;
    } else {
      if (isUsed) otherUsed += d;
      else otherUnusedRegistered += d;
    }
  }

  // اگر مرخصی استفاده نشده مشخصاً ثبت شده باشد یا از سهمیه محاسبه شود
  const eligibleRemaining = Math.max(0, eligibleQuota - eligibleUsed);
  const medicalRemaining = Math.max(0, medicalQuota - medicalUsed);

  return {
    eligibleQuota,
    eligibleUsed,
    eligibleUnusedRegistered,
    eligibleRemaining,
    medicalQuota,
    medicalUsed,
    medicalUnusedRegistered,
    medicalRemaining,
    incentiveUsed,
    incentiveUnusedRegistered,
    otherUsed,
    otherUnusedRegistered,
    totalUsedDays: eligibleUsed + medicalUsed + incentiveUsed + otherUsed,
    totalLeavesCount: leaves.length,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const soldierId = Number(id);
  const soldier = await getSoldierRecord(soldierId);
  if (!soldier) {
    return Response.json({ error: "سرباز یافت نشد" }, { status: 404 });
  }

  const meta = (soldier.metadata as Record<string, unknown>) || {};
  const leaves: SoldierLeaveItem[] = Array.isArray(meta.leaves) ? (meta.leaves as SoldierLeaveItem[]) : [];
  const quotas: LeaveQuotas = (meta.leaveQuota as LeaveQuotas) || {};

  const summary = computeLeaveSummary(leaves, soldier.maritalStatus, quotas);

  return Response.json({
    data: leaves,
    quotas,
    summary,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const soldierId = Number(id);
  const soldier = await getSoldierRecord(soldierId);
  if (!soldier) {
    return Response.json({ error: "سرباز یافت نشد" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const type = body.type as SoldierLeaveItem["type"];
    const status = (body.status || "استفاده شده") as SoldierLeaveItem["status"];
    const days = Math.max(1, Number(toEnDigits(String(body.days || 1))) || 1);
    const startDate = body.startDate ? String(body.startDate).trim() : null;
    const endDate = body.endDate ? String(body.endDate).trim() : null;
    const docNumber = body.docNumber ? String(body.docNumber).trim() : null;
    const approver = body.approver ? String(body.approver).trim() : null;
    const description = body.description ? String(body.description).trim() : null;

    if (!type) {
      return Response.json({ error: "نوع مرخصی الزامی است" }, { status: 400 });
    }

    const newLeave: SoldierLeaveItem = {
      id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      status,
      days,
      startDate,
      endDate,
      docNumber,
      approver,
      description,
      createdAt: new Date().toISOString(),
    };

    const meta = (soldier.metadata as Record<string, unknown>) || {};
    const existingLeaves: SoldierLeaveItem[] = Array.isArray(meta.leaves) ? (meta.leaves as SoldierLeaveItem[]) : [];
    const updatedLeaves = [newLeave, ...existingLeaves];

    await db
      .update(soldiers)
      .set({
        metadata: { ...meta, leaves: updatedLeaves },
        updatedAt: new Date(),
      })
      .where(eq(soldiers.id, soldierId));

    await logAudit({
      entity: "soldier",
      entityId: soldierId,
      action: "update",
      user,
      changes: { newLeave },
    });

    const summary = computeLeaveSummary(updatedLeaves, soldier.maritalStatus, (meta.leaveQuota as LeaveQuotas) || null);

    return Response.json({
      data: newLeave,
      leaves: updatedLeaves,
      summary,
    }, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "خطا در ثبت مرخصی: " + err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const soldierId = Number(id);
  const soldier = await getSoldierRecord(soldierId);
  if (!soldier) {
    return Response.json({ error: "سرباز یافت نشد" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const meta = (soldier.metadata as Record<string, unknown>) || {};
    let leaves: SoldierLeaveItem[] = Array.isArray(meta.leaves) ? (meta.leaves as SoldierLeaveItem[]) : [];
    let quotas: LeaveQuotas = (meta.leaveQuota as LeaveQuotas) || {};

    // اگر تنظیم سهمیه‌ها ارسال شده باشد
    if (body.updateQuotas) {
      if (body.eligibleQuota !== undefined) {
        quotas.eligibleQuota = Math.max(0, Number(toEnDigits(String(body.eligibleQuota))) || 0);
      }
      if (body.medicalQuota !== undefined) {
        quotas.medicalQuota = Math.max(0, Number(toEnDigits(String(body.medicalQuota))) || 0);
      }
    }

    // اگر ویرایش یک رکورد مرخصی مد نظر باشد
    if (body.leaveId) {
      const idx = leaves.findIndex((l) => l.id === body.leaveId);
      if (idx !== -1) {
        const item = leaves[idx];
        leaves[idx] = {
          ...item,
          type: body.type ?? item.type,
          status: body.status ?? item.status,
          days: body.days !== undefined ? Math.max(1, Number(toEnDigits(String(body.days))) || 1) : item.days,
          startDate: body.startDate !== undefined ? (body.startDate ? String(body.startDate).trim() : null) : item.startDate,
          endDate: body.endDate !== undefined ? (body.endDate ? String(body.endDate).trim() : null) : item.endDate,
          docNumber: body.docNumber !== undefined ? (body.docNumber ? String(body.docNumber).trim() : null) : item.docNumber,
          approver: body.approver !== undefined ? (body.approver ? String(body.approver).trim() : null) : item.approver,
          description: body.description !== undefined ? (body.description ? String(body.description).trim() : null) : item.description,
        };
      }
    }

    await db
      .update(soldiers)
      .set({
        metadata: { ...meta, leaves, leaveQuota: quotas },
        updatedAt: new Date(),
      })
      .where(eq(soldiers.id, soldierId));

    const summary = computeLeaveSummary(leaves, soldier.maritalStatus, quotas);

    return Response.json({
      data: leaves,
      quotas,
      summary,
    });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "خطا در ویرایش مرخصی: " + err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) {
    return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const soldierId = Number(id);
  const soldier = await getSoldierRecord(soldierId);
  if (!soldier) {
    return Response.json({ error: "سرباز یافت نشد" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const leaveId = searchParams.get("leaveId");
    if (!leaveId) {
      return Response.json({ error: "شناسه مرخصی الزامی است" }, { status: 400 });
    }

    const meta = (soldier.metadata as Record<string, unknown>) || {};
    const leaves: SoldierLeaveItem[] = Array.isArray(meta.leaves) ? (meta.leaves as SoldierLeaveItem[]) : [];
    const updatedLeaves = leaves.filter((l) => l.id !== leaveId);

    await db
      .update(soldiers)
      .set({
        metadata: { ...meta, leaves: updatedLeaves },
        updatedAt: new Date(),
      })
      .where(eq(soldiers.id, soldierId));

    const summary = computeLeaveSummary(updatedLeaves, soldier.maritalStatus, (meta.leaveQuota as LeaveQuotas) || null);

    return Response.json({
      ok: true,
      leaves: updatedLeaves,
      summary,
    });
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "خطا در حذف مرخصی: " + err.message }, { status: 500 });
  }
}
