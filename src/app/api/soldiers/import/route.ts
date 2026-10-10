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
const VALID_FIELD_KEYS = new Set(SOLDIER_FIELDS.map((f) => f.key));

const FIELD_ALIASES: Record<string, string[]> = {
  nationalCode: ["کد ملی", "شماره ملی", "کدملی", "شماره شناسنامه/کدملی", "national_code", "nationalcode", "کد_ملی", "کدملی سرباز"],
  personnelCode: ["کد پرسنلی", "کدپرسنلی", "شماره پرسنلی", "کد سازمانی", "personnel_code", "personnelcode", "کد_پرسنلی"],
  firstName: ["نام", "نام کوچک", "first_name", "firstname", "name"],
  lastName: ["نام خانوادگی", "فامیلی", "شهرت", "نام_خانوادگی", "last_name", "lastname", "family", "نام خانوادگي"],
  fatherName: ["نام پدر", "پدر", "father_name", "father"],
  birthDate: ["تاریخ تولد", "متولد", "تولد", "birth_date", "birthdate", "تاریخ_تولد"],
  birthPlace: ["محل تولد", "صادره", "محل صدور", "محل_تولد", "birth_place", "محل_صدور"],
  identityBookletNumber: ["شماره شناسنامه", "ش شناسنامه", "ش.ش", "شماره_شناسنامه", "شناسنامه"],
  maritalStatus: ["وضعیت تاهل", "تاهل", "وضعیت تأهل", "تاهل/تجرد", "marital_status", "وضعیت_تاهل"],
  marriageDate: ["تاریخ ازدواج", "تاریخ عقد", "ازدواج", "marriage_date", "تاریخ_ازدواج"],
  childrenCount: ["تعداد فرزند", "تعداد اولاد", "فرزند", "فرزندان", "children_count", "تعداد_فرزند"],
  phoneNumber: ["شماره تماس", "تلفن", "شماره تلفن", "شماره همراه", "موبایل", "phone_number", "mobile", "phone", "تماس"],
  homePhone: ["تلفن منزل", "تلفن ثابت", "شماره منزل", "home_phone", "تلفن_ثابت"],
  mobilePhone: ["تلفن همراه", "همراه", "موبایل", "شماره موبایل", "mobile_phone", "موبایل سرباز"],
  city: ["شهر محل سکونت", "شهر", "شهر سکونت", "محل سکونت", "city", "شهر_سکونت"],
  fullAddress: ["آدرس کامل", "آدرس", "نشانی", "نشانی کامل", "address", "ادرس"],
  postalCode: ["کد پستی", "کدپستی", "postal_code", "کد_پستی"],
  serviceUnit: ["رده خدمتی", "یگان", "یگان خدمتی", "واحد خدمتی", "قسمت", "service_unit", "unit", "محل خدمت", "رده"],
  rank: ["درجه", "درجه نظامی", "رتبه", "rank", "درجه_نظامی"],
  membershipType: ["نوع عضویت", "عضویت", "membership_type"],
  dutyType: ["وظیفه", "نوع وظیفه", "duty_type"],
  recruitmentType: ["نوع جذب", "جذب", "recruitment_type"],
  dispatchDate: ["تاریخ اعزام", "اعزام", "تاریخ شروع به خدمت", "dispatch_date", "dispatchdate", "تاریخ_اعزام"],
  serviceStartDate: ["تاریخ شروع خدمت", "شروع خدمت", "تاریخ ورود", "service_start_date", "تاریخ_شروع"],
  serviceEndDate: ["تاریخ پایان خدمت", "پایان خدمت", "تاریخ ترخیص", "ترخیص", "service_end_date", "serviceenddate", "تاریخ_ترخیص", "پایان_خدمت"],
  fileNumber: ["شماره پرونده", "پرونده", "file_number", "پرونده_پرسنلی"],
  archiveNumber: ["شماره بایگانی", "بایگانی", "archive_number"],
  educationLevel: ["مدرک تحصیلی", "تحصیلات", "مدرک", "سطح تحصیلات", "education_level", "education", "میزان تحصیلات"],
  educationMajor: ["رشته تحصیلی", "رشته", "education_major", "رشته_تحصیلی"],
  bloodType: ["گروه خونی", "خون", "blood_type", "گروه_خونی"],
  physicalStatus: ["وضعیت جسمانی", "سلامت جسمانی", "سلامت", "وضعیت جسمی", "physical_status", "وضعیت_سلامت"],
  diseaseType: ["نوع بیماری", "بیماری", "disease_type"],
  injuryStatus: ["وضعیت جانبازی", "جانبازی", "injury_status"],
  disabilityPercentage: ["درصد جانبازی", "درصد ازکارافتادگی", "disability_percentage"],
  eyeColor: ["رنگ چشم", "چشم", "eye_color"],
  hairColor: ["رنگ مو", "مو", "hair_color"],
  skinColor: ["رنگ پوست", "پوست", "skin_color"],
  weight: ["وزن", "weight"],
  height: ["قد", "height"],
  wearsGlasses: ["عینکی", "عینک", "استفاده از عینک", "wears_glasses"],
  specialMark: ["علائم خاص", "علامت خاص", "special_mark"],
  frontPresence: ["سابقه جبهه", "حضور در جبهه", "front_presence"],
  legalServiceDuration: ["مدت قانونی خدمت", "مدت خدمت", "legal_service_duration"],
  completedServiceDuration: ["مدت خدمت انجام شده", "خدمت انجام شده", "completed_service_duration"],
  dispatchOffice: ["حوزه اعزام کننده", "حوزه اعزام", "مرکز اعزام", "dispatch_office"],
  absenceDuration: ["مدت غیبت", "غیبت", "absence_duration"],
  extraServiceOnDispatch: ["اضافه خدمت هنگام اعزام", "اضافه خدمت اولیه", "extra_service_on_dispatch"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—\(\)\[\]]+/g, "")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ة]/g, "ه")
    .replace(/[\u200c\u200b]/g, "");
}

/** Suggest a system field key for a given excel header. Only maps to current existing system fields. */
function suggestMapping(header: string): string | null {
  const raw = header.trim();
  if (!raw) return null;

  // 1. Direct label or key match
  for (const f of SOLDIER_FIELDS) {
    if (f.label === raw || f.key === raw) return f.key;
  }

  // 2. Normalized label or key match
  const norm = normalizeHeader(raw);
  for (const f of SOLDIER_FIELDS) {
    if (normalizeHeader(f.label) === norm || normalizeHeader(f.key) === norm) return f.key;
  }

  // 3. Known aliases
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (VALID_FIELD_KEYS.has(key)) {
      if (aliases.some((a) => normalizeHeader(a) === norm)) return key;
    }
  }

  // 4. Substring contains for standard labels (at least 3 characters)
  for (const f of SOLDIER_FIELDS) {
    const fNorm = normalizeHeader(f.label);
    if (fNorm.length >= 3 && (norm.includes(fNorm) || fNorm.includes(norm))) {
      return f.key;
    }
  }

  // Every other arbitrary column in the Excel file is strictly ignored
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!canWrite(user?.role)) return Response.json({ error: "دسترسی غیرمجاز" }, { status: 403 });

    const form = await req.formData();
    const fileItem = form.get("file");
    const mode = (form.get("mode") as string) || "preview";
    if (!fileItem || typeof fileItem === "string" || !(fileItem instanceof Blob)) {
      return Response.json({ error: "فایل ارسال نشده است یا فرمت معتبر ندارد" }, { status: 400 });
    }

    const file = fileItem as File;
    const fileName = (file as any).name || "soldiers.xlsx";

    let buf: Buffer;
    try {
      buf = Buffer.from(await file.arrayBuffer());
    } catch {
      return Response.json({ error: "خطا در خواندن محتوای فایل ارسال‌شده" }, { status: 400 });
    }
    if (buf.length === 0) {
      return Response.json({ error: "فایل ارسال‌شده خالی است" }, { status: 400 });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "buffer" });
    } catch {
      return Response.json({ error: "فایل انتخاب‌شده قالب معتبر اکسل ندارد یا آسیب دیده است" }, { status: 400 });
    }

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return Response.json({ error: "فایل اکسل فاقد برگه (Sheet) می‌باشد" }, { status: 400 });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return Response.json({ error: "برگه اول فایل اکسل خالی است" }, { status: 400 });
    }

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const headers = json.length ? Object.keys(json[0] || {}) : [];

    if (mode === "preview") {
      const mapping: Record<string, string | null> = {};
      const recognized: string[] = [];
      const ignored: string[] = [];
      for (const h of headers) {
        const fieldKey = suggestMapping(h);
        mapping[h] = fieldKey;
        if (fieldKey) recognized.push(h);
        else ignored.push(h);
      }
      return Response.json({
        headers,
        suggestedMapping: mapping,
        recognizedHeaders: recognized,
        ignoredHeaders: ignored,
        totalRows: json.length,
        sample: json.slice(0, 10),
        fields: SOLDIER_FIELDS.map((f) => ({ key: f.key, label: f.label })),
      });
    }

    // commit
    let mapping: Record<string, string> = {};
    try {
      mapping = JSON.parse((form.get("mapping") as string) || "{}");
    } catch {
      mapping = {};
    }

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
          // فقط ستون‌های فعلی تعریف‌شده در سامانه مپ و اضافه می‌شوند؛ بقیه ستون‌ها کاملاً نادیده گرفته می‌شوند
          if (!fieldKey || !VALID_FIELD_KEYS.has(fieldKey)) continue;
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
          try {
            const found = await db
              .select()
              .from(soldiers)
              .where(and(eq(col, String(matchVal)), isNull(soldiers.deletedAt)))
              .limit(1);
            existing = found?.[0] ?? null;
          } catch (lookupErr) {
            console.warn("[Soldiers Import] Error matching existing soldier:", lookupErr);
            existing = null;
          }
        }

        const { fixed, metadata } = splitPayload(record);
        applyRankDefault(fixed, existing);

        // حفظ تاریخ اعزام و پایان خدمت موجود و عدم تغییر بی‌دلیل آن‌ها
        if (!fixed.serviceEndDate) {
          if (existing?.serviceEndDate) {
            fixed.serviceEndDate = existing.serviceEndDate;
          } else if (fixed.dispatchDate) {
            const end = computeServiceEndDate(fixed.dispatchDate as string, []);
            if (end) fixed.serviceEndDate = end;
          }
        }
        if (!fixed.dispatchDate && existing?.dispatchDate) {
          fixed.dispatchDate = existing.dispatchDate;
        }

        if (existing && existing.id) {
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

    let sessionId: number | null = null;
    try {
      const session = await db
        .insert(importSessions)
        .values({
          fileName: fileName,
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
      sessionId = (Array.isArray(session) && session[0] && session[0].id != null) ? session[0].id : null;
    } catch (sessionErr) {
      console.warn("[Soldiers Import] Failed to insert importSession:", sessionErr);
    }

    try {
      await logAudit({
        entity: "soldier",
        action: "import",
        user,
        changes: { created, updated, failed, skipped, fileName },
      });
    } catch (auditErr) {
      console.warn("[Soldiers Import] Failed to log audit:", auditErr);
    }

    return Response.json({
      summary: { created, updated, failed, skipped, total: json.length },
      errors,
      sessionId,
    });
  } catch (err: any) {
    console.error("[Soldiers Import] Unexpected server error:", err);
    return Response.json(
      { error: err?.message || "خطای سرور در پردازش فایل اکسل" },
      { status: 500 }
    );
  }
}

// mark FIELD_MAP as used for potential extension
void FIELD_MAP;
