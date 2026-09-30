import { db } from "@/db";
import { soldiers, importSessions } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import { SOLDIER_FIELDS, FIELD_MAP } from "@/lib/fields";
import { jalaliToIso } from "@/lib/jalali";
import { computeServiceEndDate } from "@/lib/service-date";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { splitPayload, applyRankDefault } from "@/lib/soldier-service";

export const dynamic = "force-dynamic";

const DATE_KEYS = new Set(SOLDIER_FIELDS.filter((f) => f.type === "date").map((f) => f.key));

/** Suggest a system field key for a given excel header. */
function suggestMapping(header: string): string | null {
  const h = header.trim();
  for (const f of SOLDIER_FIELDS) {
    if (f.label === h || f.key === h) return f.key;
  }
  for (const f of SOLDIER_FIELDS) {
    if (h.includes(f.label) || f.label.includes(h)) return f.key;
  }
  return null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const mode = (form.get("mode") as string) || "preview";
  if (!file) return Response.json({ error: "فایل ارسال نشده" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const headers = json.length ? Object.keys(json[0]) : [];

  if (mode === "preview") {
    const mapping: Record<string, string | null> = {};
    for (const h of headers) mapping[h] = suggestMapping(h);
    return Response.json({
      headers,
      suggestedMapping: mapping,
      totalRows: json.length,
      sample: json.slice(0, 10),
      fields: SOLDIER_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    });
  }

  // commit
  const mapping = JSON.parse((form.get("mapping") as string) || "{}") as Record<string, string>;
  const matchRule = (form.get("matchRule") as string) || "nationalCode";
  const policy = (form.get("policy") as string) || "upsert"; // upsert | insert | skip

  let created = 0,
    updated = 0,
    failed = 0,
    skipped = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < json.length; i++) {
    const raw = json[i];
    try {
      const record: Record<string, unknown> = {};
      for (const [header, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey) continue;
        let val: unknown = raw[header];
        if (val === "" || val === undefined || val === null) continue;
        val = String(val).trim();
        if (DATE_KEYS.has(fieldKey)) {
          const iso = jalaliToIso(val as string);
          val = iso || val;
        }
        record[fieldKey] = val;
      }

      if (!record.firstName || !record.lastName) {
        failed++;
        errors.push({ row: i + 2, message: "نام یا نام خانوادگی خالی است" });
        continue;
      }

      const matchVal = record[matchRule];
      let existing = null as typeof soldiers.$inferSelect | null;
      if (matchVal) {
        const col =
          matchRule === "personnelCode"
            ? soldiers.personnelCode
            : matchRule === "fileNumber"
              ? soldiers.fileNumber
              : soldiers.nationalCode;
        const found = await db
          .select()
          .from(soldiers)
          .where(and(eq(col, String(matchVal)), isNull(soldiers.deletedAt)))
          .limit(1);
        existing = found[0] ?? null;
      }

      const { fixed, metadata } = splitPayload(record);
      applyRankDefault(fixed, existing);
      const end = computeServiceEndDate((fixed.dispatchDate as string) || null, []);
      if (end) fixed.serviceEndDate = end;

      if (existing) {
        if (policy === "insert") {
          skipped++;
          continue;
        }
        await db
          .update(soldiers)
          .set({
            ...(fixed as Record<string, unknown>),
            metadata: { ...(existing.metadata || {}), ...metadata },
            updatedAt: new Date(),
          } as Partial<typeof soldiers.$inferInsert>)
          .where(eq(soldiers.id, existing.id));
        updated++;
      } else {
        if (policy === "skip") {
          skipped++;
          continue;
        }
        await db.insert(soldiers).values({
          ...(fixed as Record<string, unknown>),
          metadata,
          createdBy: user?.id ?? null,
        } as typeof soldiers.$inferInsert);
        created++;
      }
    } catch (e) {
      failed++;
      errors.push({ row: i + 2, message: (e as Error).message });
    }
  }

  const session = await db
    .insert(importSessions)
    .values({
      fileName: file.name,
      totalRows: json.length,
      created,
      updated,
      failed,
      skipped,
      matchRule,
      errors,
      userId: user?.id ?? null,
    })
    .returning();

  await logAudit({
    entity: "soldier",
    action: "import",
    user,
    changes: { created, updated, failed, skipped, fileName: file.name },
  });

  return Response.json({
    summary: { created, updated, failed, skipped, total: json.length },
    errors,
    sessionId: session[0].id,
  });
}

// mark FIELD_MAP as used for potential extension
void FIELD_MAP;
