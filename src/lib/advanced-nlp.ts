// ═══════════════════════════════════════════════════════════
// ADVANCED PERSIAN QUERY ENGINE — v3
// ───────────────────────────────────────────────────────────
// Handles the *fine-grained* questions the generic keyword parser cannot:
//
//   • FACT      «تاریخ پایان خدمت احمد کاظمی کیه؟»
//               «تعداد فرزندان صادق صالحی چندتاست؟»
//               «کد ملی رضا محمدی چیه؟»
//   • PROFILE   «اطلاعات احمد کاظمی را بده»
//   • RELATION  «لیست سربازانی که انتقال در رده خدمتی داشته‌اند»
//               «چند نفر کسری خدمت گرفته‌اند؟»
//   • NUMERIC   «سربازانی که بیش از ۲ فرزند دارند»
//   • TEMPORAL  «سربازانی که تا ۳۰ روز دیگر پایان خدمتشان است»
//
// SECURITY: every field is resolved through a hard-coded whitelist and every
// query is a parameterised Drizzle expression. Nothing here builds raw SQL from
// user text.
// ═══════════════════════════════════════════════════════════

import { db } from "@/db";
import { soldiers, transfers, serviceAdjustments } from "@/db/schema";
import { and, eq, or, ilike, isNull, sql, gte, lte, inArray, desc } from "drizzle-orm";
import { isoToJalali, toFaDigits, todayIso } from "./jalali";
import { computeServiceEndDate } from "./service-date";
import { KNOWN_FIELD_VALUES } from "./offline-nlp";

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export type AdvancedKind = "fact" | "profile" | "relation" | "numeric" | "temporal";

export interface AdvancedQuery {
  kind: AdvancedKind;
  /** Attribute asked about (fact queries). */
  attribute?: AttributeKey;
  /** Person name tokens extracted from the sentence. */
  personName?: string;
  /** Relation being asked about. */
  relation?: RelationKey;
  /** Numeric comparison (numeric queries). */
  numeric?: { field: "childrenCount"; op: ">" | ">=" | "<" | "<=" | "="; value: number };
  /** Days-ahead window (temporal queries). */
  temporal?: { field: "serviceEndDate" | "marriageDate" | "birthDate"; days: number };
  /** true when the user asked "how many" rather than "which ones". */
  wantsCount: boolean;
  confidence: number;
  raw: string;
}

export interface AdvancedResult {
  success: boolean;
  kind: AdvancedKind;
  /** Human-readable Persian sentence answering the question. */
  answer: string;
  data?: Record<string, unknown>[];
  total?: number;
  /** Extra rows shown when several people match the same name. */
  candidates?: { id: number; firstName: string; lastName: string; personnelCode: string | null }[];
}

// ───────────────────────────────────────────────────────────
// Attribute dictionary — longest phrase wins
// ───────────────────────────────────────────────────────────

type ValueKind = "date" | "number" | "text" | "computed-remaining";

interface AttributeDef {
  label: string;
  column: keyof typeof soldiers.$inferSelect;
  kind: ValueKind;
  /** Phrases that identify this attribute, longest first. */
  phrases: string[];
}

const ATTRIBUTES = {
  serviceEndDate: {
    label: "تاریخ پایان خدمت",
    column: "serviceEndDate",
    kind: "date",
    phrases: ["تاریخ پایان خدمت", "تاریخ ترخیص", "پایان خدمتش", "پایان خدمت", "ترخیص", "تاریخ اتمام خدمت", "اتمام خدمت"],
  },
  dispatchDate: {
    label: "تاریخ اعزام",
    column: "dispatchDate",
    kind: "date",
    phrases: ["تاریخ اعزام", "تاریخ شروع خدمت", "شروع خدمت", "اعزامش", "اعزام"],
  },
  birthDate: {
    label: "تاریخ تولد",
    column: "birthDate",
    kind: "date",
    phrases: ["تاریخ تولد", "تاریخ تولدش", "روز تولد", "تولدش", "متولد", "تولد"],
  },
  marriageDate: {
    label: "تاریخ ازدواج",
    column: "marriageDate",
    kind: "date",
    phrases: ["تاریخ ازدواج", "سالگرد ازدواج", "ازدواجش"],
  },
  childrenCount: {
    label: "تعداد فرزندان",
    column: "childrenCount",
    kind: "number",
    phrases: ["تعداد فرزندان", "تعداد فرزند", "تعداد بچه ها", "تعداد بچه", "چند فرزند", "چند تا بچه", "فرزندانش", "فرزندان", "بچه هاش", "فرزند"],
  },
  nationalCode: {
    label: "کد ملی",
    column: "nationalCode",
    kind: "text",
    phrases: ["کد ملی", "شماره ملی", "کدملی"],
  },
  personnelCode: {
    label: "کد پرسنلی",
    column: "personnelCode",
    kind: "text",
    phrases: ["کد پرسنلی", "شماره پرسنلی", "کدپرسنلی"],
  },
  fatherName: {
    label: "نام پدر",
    column: "fatherName",
    kind: "text",
    phrases: ["نام پدر", "اسم پدر", "پدرش"],
  },
  mobilePhone: {
    label: "شماره تماس",
    column: "mobilePhone",
    kind: "text",
    phrases: ["شماره موبایل", "شماره همراه", "شماره تماس", "شماره تلفن", "موبایل", "تلفن همراه", "تلفنش"],
  },
  fullAddress: {
    label: "آدرس",
    column: "fullAddress",
    kind: "text",
    phrases: ["آدرس کامل", "نشانی", "آدرسش", "آدرس"],
  },
  postalCode: {
    label: "کد پستی",
    column: "postalCode",
    kind: "text",
    phrases: ["کد پستی", "کدپستی"],
  },
  serviceUnit: {
    label: "رده خدمتی",
    column: "serviceUnit",
    kind: "text",
    phrases: ["رده خدمتی", "یگان خدمتی", "یگانش", "رده اش", "یگان"],
  },
  rank: {
    label: "درجه",
    column: "rank",
    kind: "text",
    phrases: ["درجه نظامی", "درجه اش", "درجه"],
  },
  bloodType: {
    label: "گروه خون",
    column: "bloodType",
    kind: "text",
    phrases: ["گروه خونی", "گروه خون"],
  },
  educationLevel: {
    label: "مدرک تحصیلی",
    column: "educationLevel",
    kind: "text",
    phrases: ["مدرک تحصیلی", "میزان تحصیلات", "سطح تحصیلات", "تحصیلاتش", "مدرکش", "تحصیلات", "مدرک"],
  },
  educationMajor: {
    label: "رشته تحصیلی",
    column: "educationMajor",
    kind: "text",
    phrases: ["رشته تحصیلی", "رشته اش", "رشته"],
  },
  maritalStatus: {
    label: "وضعیت تاهل",
    column: "maritalStatus",
    kind: "text",
    phrases: ["وضعیت تاهل", "وضعیت تأهل", "متاهل است", "تاهلش", "تاهل"],
  },
  city: {
    label: "شهر",
    column: "city",
    kind: "text",
    phrases: ["شهر محل سکونت", "محل سکونت", "شهرش", "شهر"],
  },
  birthPlace: {
    label: "محل تولد",
    column: "birthPlace",
    kind: "text",
    phrases: ["محل تولد", "زادگاه"],
  },
  physicalStatus: {
    label: "وضعیت جسمانی",
    column: "physicalStatus",
    kind: "text",
    phrases: ["وضعیت جسمانی", "وضعیت سلامتی", "سلامت جسمانی"],
  },
  fileNumber: {
    label: "شماره پرونده",
    column: "fileNumber",
    kind: "text",
    phrases: ["شماره پرونده", "شماره بایگانی"],
  },
  height: { label: "قد", column: "height", kind: "text", phrases: ["قدش", "قد"] },
  weight: { label: "وزن", column: "weight", kind: "text", phrases: ["وزنش", "وزن"] },
  remainingDays: {
    label: "روزهای باقی‌مانده خدمت",
    column: "serviceEndDate",
    kind: "computed-remaining",
    phrases: ["چند روز مانده", "چند روز باقی", "روزهای باقی مانده", "روز باقی مانده", "باقی مانده خدمت", "باقیمانده خدمت", "مانده تا پایان خدمت"],
  },
} as const satisfies Record<string, AttributeDef>;

export type AttributeKey = keyof typeof ATTRIBUTES;

/** All attribute phrases sorted longest-first so "تاریخ پایان خدمت" beats "خدمت". */
const ATTRIBUTE_PHRASES: { phrase: string; key: AttributeKey }[] = Object.entries(ATTRIBUTES)
  .flatMap(([key, def]) => def.phrases.map((phrase) => ({ phrase, key: key as AttributeKey })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

// ───────────────────────────────────────────────────────────
// Relation dictionary
// ───────────────────────────────────────────────────────────

type RelationKey = "transfer" | "adjustmentDecrease" | "adjustmentIncrease" | "adjustmentAny";

const RELATIONS: { key: RelationKey; label: string; phrases: string[] }[] = [
  {
    key: "transfer",
    label: "انتقال در رده خدمتی",
    phrases: ["انتقال در رده خدمتی", "انتقال رده خدمتی", "تغییر رده خدمتی", "تغییر یگان", "جابجایی یگان", "جابه جایی", "جابجایی", "انتقالی", "منتقل شده", "منتقل", "انتقال"],
  },
  {
    key: "adjustmentDecrease",
    label: "کسری خدمت",
    phrases: ["کسری خدمت", "کسر خدمت", "کسری"],
  },
  {
    key: "adjustmentIncrease",
    label: "اضافه خدمت",
    phrases: ["اضافه خدمت", "اضافه‌خدمت", "غیبت", "فرار"],
  },
  {
    key: "adjustmentAny",
    label: "تعدیل خدمت",
    phrases: ["تعدیل خدمت", "تعدیل"],
  },
];

// ───────────────────────────────────────────────────────────
// Text helpers
// ───────────────────────────────────────────────────────────

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalize(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, " ") // ZWNJ / bidi marks → space
    .replace(/[؟?!.،,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words that are never part of a person's name. */
const NAME_NOISE = new Set([
  "سرباز", "سربازان", "سربازها", "سربازا", "نیروی", "نیرو", "پرسنل", "فرد", "شخص", "آقای", "جناب",
  "کیه", "کی", "چیه", "چیست", "کیست", "چنده", "چقدر", "چقدره", "چندتاست", "چندتا", "چند", "تا",
  "است", "هست", "کجاست", "کجا", "چطور", "چگونه",
  "را", "رو", "از", "به", "در", "با", "برای", "که", "چه", "کدام", "کدوم", "این", "آن", "یک", "بر",
  "بگو", "بده", "بدهید", "نشان", "نمایش", "بیار", "پیدا", "کن", "کنید", "لطفا", "لطفاً", "میخوام",
  "می‌خوام", "میخواهم", "می‌خواهم", "اطلاعات", "مشخصات", "پروفایل", "جزئیات", "سوابق",
  "لیست", "همه", "تمام", "مال", "برام", "بهم", "شده", "شود", "دارد", "داره", "دارند",
  "می‌باشد", "میباشد", "اش", "های", "ها", "و", "یا",
  // aggregate / statistics vocabulary — never part of a name
  "توزیع", "اساس", "براساس", "نمودار", "آمار", "تعداد", "مجموع", "میانگین", "مقایسه",
  "دسته", "گروه", "بندی", "دایره", "میله", "خطی", "جدول", "خروجی", "اکسل",
  // service vocabulary left over after an attribute phrase is stripped
  "خدمت", "خدمتی", "مانده", "باقی", "روز", "روزهای", "سال", "ماه",
]);

/**
 * Sentences that are clearly *aggregate / list* questions must never be treated
 * as a question about one person, otherwise "توزیع بر اساس رده خدمتی" would be
 * misread as «رده خدمتی» of a person named "توزیع بر اساس".
 */
const AGGREGATE_GUARD = /توزیع|بر\s*اساس|براساس|نمودار|گروه\s*بندی|دسته\s*بندی|مقایسه|میانگین|درصد/;

/** "تعداد سربازان ..." / "چند نفر ..." are counting questions, not person facts. */
const COUNTING_GUARD = /تعداد\s*(سربازان|سربازها|سربازا|نفرات|افراد|کل|کارکنان)|چند\s*(نفر|سرباز)/;

/** Remove the attribute phrase + noise, whatever remains is the candidate name. */
function extractPersonName(text: string, usedPhrase?: string): string {
  let s = normalize(text);
  if (usedPhrase) s = s.split(usedPhrase).join(" ");

  const tokens = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !NAME_NOISE.has(t) && !/^\d+$/.test(t));

  // A Persian full name is realistically 1–3 tokens.
  return tokens.slice(0, 3).join(" ").trim();
}

function detectCount(text: string): boolean {
  const n = normalize(text);
  return /چند\s*(نفر|تا|سرباز)|تعدادش|تعداد\s+سرباز|شمارش/.test(n);
}

/**
 * Guard against false positives: a leftover fragment such as "توزیع بر اساس"
 * must not be treated as somebody's name. A real name is 1–3 short tokens made
 * of Persian letters, none of which belongs to our query vocabulary.
 */
function looksLikePersonName(name: string): boolean {
  if (!name || name.length < 2) return false;
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;

  // «سربازان شهر تهران» must stay a *filter* query: "تهران" is a known city,
  // not somebody's name.
  if (KNOWN_FIELD_VALUES.has(name)) return false;
  if (tokens.some((t) => KNOWN_FIELD_VALUES.has(t))) return false;

  return tokens.every(
    (t) => t.length >= 2 && t.length <= 20 && /^[\u0600-\u06FF]+$/.test(t) && !NAME_NOISE.has(t),
  );
}

function parsePersianNumber(token: string): number | null {
  const map: Record<string, number> = {
    یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  };
  if (map[token] !== undefined) return map[token];
  const n = parseInt(token, 10);
  return Number.isNaN(n) ? null : n;
}

// ───────────────────────────────────────────────────────────
// Parser
// ───────────────────────────────────────────────────────────

/**
 * Try to understand a fine-grained question.
 * Returns `null` when the sentence is better handled by the generic parser.
 */
export function parseAdvancedQuery(text: string): AdvancedQuery | null {
  const n = normalize(text);
  if (!n) return null;

  const wantsCount = detectCount(n);

  // ── 1. RELATION: transfers / service adjustments ────────────────────────
  // Must be checked before attributes, because "انتقال در رده خدمتی" contains
  // the attribute phrase "رده خدمتی".
  for (const rel of RELATIONS) {
    for (const phrase of rel.phrases) {
      if (!n.includes(phrase)) continue;
      // Only treat it as a relation when the sentence is about *having* it.
      if (/داشته|دارند|داره|گرفته|شده اند|شدند|شده‌اند|دارای|با سابقه|سابقه|لیست|کدام|چند|همه|کسانی|افرادی|سربازانی/.test(n)) {
        return { kind: "relation", relation: rel.key, wantsCount, confidence: 0.9, raw: text };
      }
    }
  }

  // ── 2. TEMPORAL: "تا N روز دیگر پایان خدمت" ─────────────────────────────
  const temporalMatch = n.match(/(?:تا\s*)?(\d+)\s*روز\s*(?:دیگر|آینده|بعد)/);
  if (temporalMatch) {
    const days = Math.min(3650, Math.max(1, parseInt(temporalMatch[1], 10)));
    let field: "serviceEndDate" | "marriageDate" | "birthDate" = "serviceEndDate";
    if (/ازدواج/.test(n)) field = "marriageDate";
    else if (/تولد/.test(n)) field = "birthDate";
    return { kind: "temporal", temporal: { field, days }, wantsCount, confidence: 0.85, raw: text };
  }

  // ── 3. NUMERIC: "بیش از ۲ فرزند" ────────────────────────────────────────
  const numericMatch = n.match(
    /(بیشتر از|بیش از|بالای|کمتر از|زیر|حداقل|حداکثر|دقیقا|دقیقاً)?\s*([۰-۹\d]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا\s*)?(فرزند|بچه)/,
  );
  if (numericMatch) {
    const value = parsePersianNumber(numericMatch[2]);
    if (value !== null) {
      const word = numericMatch[1] || "";
      const op: ">" | ">=" | "<" | "<=" | "=" =
        /بیشتر از|بیش از|بالای/.test(word) ? ">"
        : /کمتر از|زیر/.test(word) ? "<"
        : /حداقل/.test(word) ? ">="
        : /حداکثر/.test(word) ? "<="
        : "=";
      return {
        kind: "numeric",
        numeric: { field: "childrenCount", op, value },
        wantsCount,
        confidence: 0.85,
        raw: text,
      };
    }
  }

  // Anything that is an aggregate or a head-count question belongs to the
  // generic engine — bail out before we start looking for a person's name.
  if (AGGREGATE_GUARD.test(n) || COUNTING_GUARD.test(n)) return null;

  // ── 4a. FACT (special): "چند روز از خدمت X مانده؟" ──────────────────────
  // Phrased too freely for a fixed phrase list, so it gets its own pattern.
  if (/چند\s*روز/.test(n) && /(مانده|باقی|مونده)/.test(n)) {
    const cleaned = n
      .replace(/چند\s*روز/g, " ")
      .replace(/(مانده|باقی\s*مانده|باقیمانده|مونده)/g, " ")
      .replace(/(تا\s*)?پایان\s*خدمت/g, " ");
    const personName = extractPersonName(cleaned);
    if (personName.length >= 2) {
      return { kind: "fact", attribute: "remainingDays", personName, wantsCount: false, confidence: 0.9, raw: text };
    }
  }

  // ── 4b. FACT: attribute + person name ───────────────────────────────────
  for (const { phrase, key } of ATTRIBUTE_PHRASES) {
    if (!n.includes(phrase)) continue;

    const personName = extractPersonName(n, phrase);
    // A fact question needs a subject. Without a name it is a list/filter query
    // that the generic engine handles better.
    if (!looksLikePersonName(personName)) continue;

    return { kind: "fact", attribute: key, personName, wantsCount: false, confidence: 0.92, raw: text };
  }

  // ── 5. PROFILE: "اطلاعات احمد کاظمی" ────────────────────────────────────
  if (/اطلاعات|مشخصات|پروفایل|جزئیات|سوابق/.test(n)) {
    const personName = extractPersonName(n);
    if (looksLikePersonName(personName)) {
      return { kind: "profile", personName, wantsCount: false, confidence: 0.8, raw: text };
    }
  }

  return null;
}

// ───────────────────────────────────────────────────────────
// Person lookup
// ───────────────────────────────────────────────────────────

type SoldierRow = typeof soldiers.$inferSelect;

/**
 * Find soldiers matching a free-form Persian name.
 * Tries, in order: exact "first last", all-tokens-match, any-token-match.
 */
async function findSoldiersByName(name: string): Promise<SoldierRow[]> {
  const tokens = name.split(/\s+/).filter((t) => t.length > 1).slice(0, 3);
  if (tokens.length === 0) return [];

  const alive = isNull(soldiers.deletedAt);
  const fullName = sql`coalesce(${soldiers.firstName}, '') || ' ' || coalesce(${soldiers.lastName}, '')`;

  // Strategy A — the whole phrase appears in "first last".
  const exact = await db
    .select()
    .from(soldiers)
    .where(and(alive, sql`${fullName} ILIKE ${"%" + tokens.join(" ") + "%"}`))
    .limit(10);
  if (exact.length > 0) return exact;

  // Strategy B — every token appears somewhere in the name.
  const allTokens = await db
    .select()
    .from(soldiers)
    .where(
      and(
        alive,
        ...tokens.map((t) =>
          or(ilike(soldiers.firstName, `%${t}%`), ilike(soldiers.lastName, `%${t}%`))!,
        ),
      ),
    )
    .limit(10);
  if (allTokens.length > 0) return allTokens;

  // Strategy C — any token matches (last resort, may return several people).
  return db
    .select()
    .from(soldiers)
    .where(
      and(
        alive,
        or(...tokens.flatMap((t) => [ilike(soldiers.firstName, `%${t}%`), ilike(soldiers.lastName, `%${t}%`)]))!,
      ),
    )
    .limit(10);
}

const fullNameOf = (s: SoldierRow) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();

function candidateList(rows: SoldierRow[]) {
  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    personnelCode: r.personnelCode ?? null,
  }));
}

// ───────────────────────────────────────────────────────────
// Value formatting
// ───────────────────────────────────────────────────────────

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Signed days left until the end of service. Negative = already finished. */
function remainingDaysOf(soldier: SoldierRow): number | null {
  if (!soldier.serviceEndDate) return null;
  return daysBetween(todayIso(), soldier.serviceEndDate);
}

function formatAttribute(soldier: SoldierRow, key: AttributeKey): string | null {
  const def = ATTRIBUTES[key];
  const raw = soldier[def.column as keyof SoldierRow];

  if (def.kind === "computed-remaining") {
    const remaining = remainingDaysOf(soldier);
    return remaining === null ? null : `${toFaDigits(Math.max(0, remaining))} روز`;
  }

  if (raw === null || raw === undefined || raw === "") return null;

  if (def.kind === "date") return isoToJalali(String(raw));
  if (def.kind === "number") return toFaDigits(Number(raw));
  return toFaDigits(String(raw));
}

// ───────────────────────────────────────────────────────────
// Executor
// ───────────────────────────────────────────────────────────

export async function executeAdvancedQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  switch (q.kind) {
    case "fact":
    case "profile":
      return executePersonQuery(q);
    case "relation":
      return executeRelationQuery(q);
    case "numeric":
      return executeNumericQuery(q);
    case "temporal":
      return executeTemporalQuery(q);
    default:
      return { success: false, kind: q.kind, answer: "پرسش پشتیبانی نمی‌شود." };
  }
}

async function executePersonQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  const matches = await findSoldiersByName(q.personName || "");

  if (matches.length === 0) {
    return {
      success: true,
      kind: q.kind,
      answer: `❌ سربازی با نام «${q.personName}» پیدا نکردم.\n\nلطفاً املای نام را بررسی کنید یا نام خانوادگی را هم بنویسید.`,
      data: [],
      total: 0,
    };
  }

  if (matches.length > 1) {
    const names = matches
      .slice(0, 8)
      .map((m, i) => `${toFaDigits(i + 1)}. ${fullNameOf(m)}${m.personnelCode ? ` (کد پرسنلی ${toFaDigits(m.personnelCode)})` : ""}`)
      .join("\n");
    return {
      success: true,
      kind: q.kind,
      answer: `🔎 ${toFaDigits(matches.length)} نفر با این نام پیدا شد. لطفاً دقیق‌تر بپرسید:\n\n${names}`,
      data: matches,
      total: matches.length,
      candidates: candidateList(matches),
    };
  }

  const person = matches[0];

  // ── Profile: show a compact summary card ──
  if (q.kind === "profile") {
    return {
      success: true,
      kind: "profile",
      answer: `👤 اطلاعات ${fullNameOf(person)}`,
      data: [person],
      total: 1,
    };
  }

  // ── Fact: answer one precise attribute ──
  const key = q.attribute as AttributeKey;
  const def = ATTRIBUTES[key];

  // Remaining service days needs its own phrasing (past / today / future).
  if (key === "remainingDays") {
    const remaining = remainingDaysOf(person);
    if (remaining === null) {
      return {
        success: true,
        kind: "fact",
        answer: `ℹ️ برای ${fullNameOf(person)} تاریخ پایان خدمت ثبت نشده است.`,
        data: [person],
        total: 1,
      };
    }
    const endJalali = isoToJalali(person.serviceEndDate!);
    const answer =
      remaining < 0
        ? `✅ خدمت ${fullNameOf(person)} ${toFaDigits(Math.abs(remaining))} روز پیش (${endJalali}) به پایان رسیده است.`
        : remaining === 0
          ? `🎯 امروز آخرین روز خدمت ${fullNameOf(person)} است.`
          : `⏳ از خدمت ${fullNameOf(person)} ${toFaDigits(remaining)} روز باقی مانده است (پایان: ${endJalali}).`;
    return { success: true, kind: "fact", answer, data: [person], total: 1 };
  }

  const value = formatAttribute(person, key);

  if (value === null) {
    return {
      success: true,
      kind: "fact",
      answer: `ℹ️ برای ${fullNameOf(person)} مقداری برای «${def.label}» ثبت نشده است.`,
      data: [person],
      total: 1,
    };
  }

  // Natural phrasing per attribute kind.
  let answer: string;
  if (def.kind === "date") {
    answer = `📅 ${def.label} ${fullNameOf(person)}: ${value}`;
  } else if (def.kind === "number") {
    answer = `🔢 ${def.label} ${fullNameOf(person)}: ${value}`;
  } else {
    answer = `✅ ${def.label} ${fullNameOf(person)}: ${value}`;
  }

  return { success: true, kind: "fact", answer, data: [person], total: 1 };
}

async function executeRelationQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  const rel = q.relation!;
  const alive = isNull(soldiers.deletedAt);

  let ids: number[] = [];
  let label = "";

  if (rel === "transfer") {
    label = "انتقال در رده خدمتی";
    const rows = await db.selectDistinct({ soldierId: transfers.soldierId }).from(transfers);
    ids = rows.map((r) => r.soldierId);
  } else {
    const direction =
      rel === "adjustmentDecrease" ? "decrease" : rel === "adjustmentIncrease" ? "increase" : null;
    label =
      rel === "adjustmentDecrease" ? "کسری خدمت"
      : rel === "adjustmentIncrease" ? "اضافه خدمت"
      : "تعدیل خدمت";
    const rows = await db
      .selectDistinct({ soldierId: serviceAdjustments.soldierId })
      .from(serviceAdjustments)
      .where(direction ? eq(serviceAdjustments.effectDirection, direction) : undefined);
    ids = rows.map((r) => r.soldierId);
  }

  if (ids.length === 0) {
    return { success: true, kind: "relation", answer: `هیچ سربازی با سابقه «${label}» ثبت نشده است.`, data: [], total: 0 };
  }

  const people = await db
    .select()
    .from(soldiers)
    .where(and(alive, inArray(soldiers.id, ids)))
    .orderBy(soldiers.lastName)
    .limit(200);

  if (q.wantsCount) {
    return {
      success: true,
      kind: "relation",
      answer: `📊 ${toFaDigits(people.length)} سرباز سابقه «${label}» دارند.`,
      data: people,
      total: people.length,
    };
  }

  // Enrich transfer rows with from → to so the answer is genuinely useful.
  if (rel === "transfer") {
    const details = await db
      .select()
      .from(transfers)
      .where(inArray(transfers.soldierId, people.map((p) => p.id)))
      .orderBy(desc(transfers.id));

    const latest = new Map<number, typeof details[number]>();
    for (const t of details) if (!latest.has(t.soldierId)) latest.set(t.soldierId, t);

    const enriched = people.map((p) => {
      const t = latest.get(p.id);
      return {
        ...p,
        transferFrom: t?.fromServiceUnit ?? null,
        transferTo: t?.toServiceUnit ?? null,
        transferDate: t?.transferDate ?? null,
        transferStatus: t?.status ?? null,
      };
    });

    return {
      success: true,
      kind: "relation",
      answer: `🔄 ${toFaDigits(enriched.length)} سرباز سابقه «${label}» دارند.`,
      data: enriched,
      total: enriched.length,
    };
  }

  return {
    success: true,
    kind: "relation",
    answer: `📋 ${toFaDigits(people.length)} سرباز سابقه «${label}» دارند.`,
    data: people,
    total: people.length,
  };
}

async function executeNumericQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  const { op, value } = q.numeric!;
  const col = soldiers.childrenCount;
  const cmp =
    op === ">" ? sql`${col} > ${value}`
    : op === ">=" ? sql`${col} >= ${value}`
    : op === "<" ? sql`${col} < ${value}`
    : op === "<=" ? sql`${col} <= ${value}`
    : sql`${col} = ${value}`;

  const rows = await db
    .select()
    .from(soldiers)
    .where(and(isNull(soldiers.deletedAt), cmp))
    .orderBy(desc(soldiers.childrenCount))
    .limit(200);

  const opLabel =
    op === ">" ? "بیشتر از" : op === ">=" ? "حداقل" : op === "<" ? "کمتر از" : op === "<=" ? "حداکثر" : "دقیقاً";

  return {
    success: true,
    kind: "numeric",
    answer: `👨‍👩‍👧 ${toFaDigits(rows.length)} سرباز ${opLabel} ${toFaDigits(value)} فرزند دارند.`,
    data: rows,
    total: rows.length,
  };
}

async function executeTemporalQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  const { field, days } = q.temporal!;
  const from = todayIso();
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  const col =
    field === "serviceEndDate" ? soldiers.serviceEndDate
    : field === "marriageDate" ? soldiers.marriageDate
    : soldiers.birthDate;

  const rows = await db
    .select()
    .from(soldiers)
    .where(and(isNull(soldiers.deletedAt), gte(col, from), lte(col, to)))
    .orderBy(col)
    .limit(200);

  const labels: Record<string, string> = {
    serviceEndDate: "پایان خدمت",
    marriageDate: "سالگرد ازدواج",
    birthDate: "تولد",
  };

  return {
    success: true,
    kind: "temporal",
    answer: `⏰ ${toFaDigits(rows.length)} سرباز تا ${toFaDigits(days)} روز آینده ${labels[field]} دارند.`,
    data: rows,
    total: rows.length,
  };
}

// Re-exported so other modules can reuse the service-end helper consistently.
export { computeServiceEndDate };
