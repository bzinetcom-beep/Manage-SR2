import { db } from "@/db";
import { letterTemplates, letters, letterBatches, soldiers } from "@/db/schema";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureBuiltinTemplates } from "@/lib/letter-templates-service";
import { buildContext, makeLetterNumber, renderTemplate, sanitizeHtml } from "@/lib/letter-engine";
import { todayJalali } from "@/lib/jalali";
import { eq, inArray, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** بخش‌های قالب که از ویرایشگر گرافیکی می‌توانند بازنویسی شوند */
export interface TemplateOverride {
  headerHtml?: string;
  bodyHtml?: string;
  footerHtml?: string;
}

interface GenerateBody {
  templateId: number;
  soldierIds: number[];
  params?: Record<string, string>;
  /** مقادیر اختصاصی هر سرباز: { [soldierId]: { key: value } } — از اکسل می‌آید */
  perSoldierParams?: Record<string, Record<string, string>>;
  numberPrefix?: string;
  numberStart?: number;
  letterDate?: string;
  batchTitle?: string;
  source?: "selection" | "excel";
  /** ویرایش گرافیکی متن قالب پیش از تولید (بدون کد HTML از سمت کاربر) */
  templateOverride?: TemplateOverride;
  /** ویرایش گرافیکی متن نامه‌ی یک سرباز خاص (متن نهایی، بدون جای‌نگهدار) */
  perSoldierHtml?: Record<string, string>;
  /** در صورت true، قالب ویرایش‌شده روی خود قالب ذخیره می‌شود */
  saveTemplate?: boolean;
}

function pickTemplate(tpl: {
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
}, override?: TemplateOverride) {
  return {
    headerHtml: override?.headerHtml !== undefined ? override.headerHtml : tpl.headerHtml,
    bodyHtml: override?.bodyHtml !== undefined ? override.bodyHtml : tpl.bodyHtml,
    footerHtml: override?.footerHtml !== undefined ? override.footerHtml : tpl.footerHtml,
  };
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  await ensureBuiltinTemplates();

  const body = (await req.json()) as GenerateBody;
  const ids = [...new Set((body.soldierIds || []).map(Number).filter(Boolean))];
  if (!body.templateId) return Response.json({ error: "قالب انتخاب نشده است" }, { status: 400 });
  if (!ids.length) return Response.json({ error: "هیچ سربازی انتخاب نشده است" }, { status: 400 });
  if (ids.length > 5000) return Response.json({ error: "حداکثر ۵۰۰۰ نامه در هر دسته" }, { status: 400 });

  const tRows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, Number(body.templateId))).limit(1);
  if (!tRows.length) return Response.json({ error: "قالب یافت نشد" }, { status: 404 });
  const tpl = tRows[0];

  const sRows = await db.select().from(soldiers).where(inArray(soldiers.id, ids));
  if (!sRows.length) return Response.json({ error: "سربازی یافت نشد" }, { status: 404 });
  // ترتیب مطابق انتخاب کاربر
  const byId = new Map(sRows.map((s) => [s.id, s]));
  const ordered = ids.map((i) => byId.get(i)).filter(Boolean) as typeof sRows;

  const letterDate = body.letterDate || todayJalali();
  // مقادیر پیش‌فرض تعریف‌شده در قالب، در صورت خالی‌بودن ورودی کاربر اعمال می‌شوند
  const defaults: Record<string, string> = {};
  for (const p of tpl.params || []) {
    if (p?.key && p.defaultValue) defaults[p.key] = p.defaultValue;
  }
  const userParams = Object.fromEntries(
    Object.entries(body.params || {}).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""),
  ) as Record<string, string>;
  const globalParams: Record<string, string> = {
    ...defaults,
    ...userParams,
    letter_date: letterDate,
    تاریخ_نامه: letterDate,
  };

  const batchIns = await db
    .insert(letterBatches)
    .values({
      title: body.batchTitle || `${tpl.name} — ${letterDate}`,
      templateId: tpl.id,
      templateName: tpl.name,
      source: body.source === "excel" ? "excel" : "selection",
      params: globalParams,
      total: ordered.length,
      createdBy: user?.id,
      createdByName: user?.fullName,
    })
    .returning();
  const batch = batchIns[0];

  const prefix = body.numberPrefix ?? "";
  const start = Number(body.numberStart) || 1;
  const used = pickTemplate(tpl, body.templateOverride);
  const fullTemplate = `${used.headerHtml || ""}\n${used.bodyHtml || ""}\n${used.footerHtml || ""}`;

  const rows = ordered.map((s, i) => {
    const per = body.perSoldierParams?.[String(s.id)] || {};
    const letterNumber = per["شماره_نامه"] || per["letter_number"] || makeLetterNumber(prefix, start, i);
    const ctx = buildContext(s as Record<string, unknown>, {
      ...globalParams,
      ...per,
      letter_number: letterNumber,
      شماره_نامه: letterNumber,
      row_index: String(i + 1),
      ردیف: String(i + 1),
    });

    // ویرایش گرافیکی اختصاصی همین سرباز → متن نهایی، بدون رندر مجدد
    const customHtml = body.perSoldierHtml?.[String(s.id)];
    const html = customHtml && customHtml.trim()
      ? sanitizeHtml(customHtml)
      : sanitizeHtml(renderTemplate(fullTemplate, ctx));

    return {
      batchId: batch.id,
      templateId: tpl.id,
      templateName: tpl.name,
      soldierId: s.id,
      soldierName: `${s.firstName} ${s.lastName}`.trim(),
      nationalCode: s.nationalCode,
      serviceUnit: s.serviceUnit,
      subject: renderTemplate(tpl.subject || tpl.name, ctx, false) || tpl.name,
      letterNumber,
      letterDate,
      bodyHtml: html,
      pageSize: tpl.pageSize,
      status: customHtml ? "edited" : "generated",
      createdBy: user?.id,
      createdByName: user?.fullName,
    };
  });

  const created: { id: number }[] = [];
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = await db.insert(letters).values(rows.slice(i, i + CHUNK)).returning({ id: letters.id });
    created.push(...part);
  }

  // ذخیره‌ی ویرایش گرافیکی روی خودِ قالب (اختیاری)
  if (body.saveTemplate && body.templateOverride) {
    await db
      .update(letterTemplates)
      .set({
        headerHtml: used.headerHtml,
        bodyHtml: used.bodyHtml,
        footerHtml: used.footerHtml,
        updatedAt: new Date(),
      })
      .where(eq(letterTemplates.id, tpl.id));
  }

  await db
    .update(letterTemplates)
    .set({ usageCount: sql`${letterTemplates.usageCount} + ${created.length}` })
    .where(eq(letterTemplates.id, tpl.id));

  await logAudit({ entity: "letter_batch", entityId: batch.id, action: "create", user });

  return Response.json({ data: { batchId: batch.id, count: created.length, ids: created.map((c) => c.id) } }, { status: 201 });
}

/**
 * پیش‌نمایش بدون ذخیره‌سازی.
 * پارامترهای اختیاری:
 *   soldierId        → پیش‌نمایش برای یک سرباز مشخص
 *   templateOverride → ویرایش گرافیکی قالب (سربرگ/متن/پاورقی)
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  const body = (await req.json()) as GenerateBody;
  const tRows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, Number(body.templateId))).limit(1);
  if (!tRows.length) return Response.json({ error: "قالب یافت نشد" }, { status: 404 });
  const tpl = tRows[0];

  let soldier: Record<string, unknown> | undefined;
  const first = (body.soldierIds || [])[0];
  if (first) {
    const s = await db.select().from(soldiers).where(eq(soldiers.id, Number(first))).limit(1);
    soldier = s[0] as Record<string, unknown> | undefined;
  }
  if (!soldier) {
    const s = await db.select().from(soldiers).where(isNull(soldiers.deletedAt)).limit(1);
    soldier = s[0] as Record<string, unknown> | undefined;
  }
  const letterDate = body.letterDate || todayJalali();
  const previewDefaults: Record<string, string> = {};
  for (const p of tpl.params || []) if (p?.key && p.defaultValue) previewDefaults[p.key] = p.defaultValue;
  const ctx = buildContext(soldier || {}, {
    ...previewDefaults,
    ...Object.fromEntries(
      Object.entries(body.params || {}).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""),
    ),
    letter_date: letterDate,
    تاریخ_نامه: letterDate,
    letter_number: makeLetterNumber(body.numberPrefix ?? "", Number(body.numberStart) || 1, 0),
    شماره_نامه: makeLetterNumber(body.numberPrefix ?? "", Number(body.numberStart) || 1, 0),
    ردیف: "۱",
  });
  const used = pickTemplate(tpl, body.templateOverride);
  const html = sanitizeHtml(
    renderTemplate(`${used.headerHtml || ""}\n${used.bodyHtml || ""}\n${used.footerHtml || ""}`, ctx),
  );
  return Response.json({
    data: {
      html,
      pageSize: tpl.pageSize,
      template: {
        headerHtml: used.headerHtml,
        bodyHtml: used.bodyHtml,
        footerHtml: used.footerHtml,
      },
    },
  });
}
