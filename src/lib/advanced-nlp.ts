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
import { and, eq, or, ilike, isNull, sql, gte, lte, inArray, desc, asc } from "drizzle-orm";
import * as jalaali from "jalaali-js";
import { isoToJalali, toFaDigits, toEnDigits, todayIso } from "./jalali";
import { computeServiceEndDate } from "./service-date";
import { KNOWN_FIELD_VALUES } from "./offline-nlp";

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export type AdvancedKind = "fact" | "profile" | "relation" | "numeric" | "temporal" | "presence" | "leaves_summary";

export interface AdvancedQuery {
  kind: AdvancedKind;
  /** Attribute asked about (fact queries). */
  attribute?: AttributeKey;
  /** Person name tokens extracted from the sentence. */
  personName?: string;
  /** National code extracted from query (if present) */
  nationalCode?: string;
  /** Target date extracted from query for presence lookup */
  targetDate?: string;
  /** Date range start extracted from query */
  startDate?: string;
  /** Date range end extracted from query */
  endDate?: string;
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

/** Extract all Jalali dates from text in formats: yyyy/mm/dd, yyyy-mm-dd, yyyy.mm.dd, dd/mm/yyyy, or dd [month] yyyy */
function extractJalaliAllDates(text: string): string[] {
  const norm = toEnDigits(text);
  const found: string[] = [];

  // Match YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
  const r1 = /\b(1[34]\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])\b/g;
  let m: RegExpExecArray | null;
  while ((m = r1.exec(norm)) !== null) {
    const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (!found.includes(d)) found.push(d);
  }

  // Match reverse DD/MM/YYYY (e.g. 01/05/1403)
  const r2 = /\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](1[34]\d{2})\b/g;
  while ((m = r2.exec(norm)) !== null) {
    const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!found.includes(d)) found.push(d);
  }

  // Month names (e.g. 15 تیر 1403 or 1 فروردین 1403)
  const MONTHS: Record<string, string> = {
    فروردین: "01", اردیبهشت: "02", خرداد: "03", تیر: "04", مرداد: "05", شهریور: "06",
    مهر: "07", آبان: "08", آذر: "09", دی: "10", بهمن: "11", اسفند: "12",
  };
  for (const [mName, mNum] of Object.entries(MONTHS)) {
    const reg = new RegExp(`(\\d{1,2})\\s*(?:ام)?\\s*${mName}\\s*(?:ماه)?\\s*(1[34]\\d{2})`, "g");
    while ((m = reg.exec(norm)) !== null) {
      const d = `${m[2]}-${mNum}-${m[1].padStart(2, "0")}`;
      if (!found.includes(d)) found.push(d);
    }
  }

  if (found.length === 0 && (norm.includes("امروز") || text.includes("امروز"))) {
    found.push(todayIso());
  }

  return found;
}

/** Extract primary Jalali date from text */
function extractJalaliDate(text: string): string | null {
  const dates = extractJalaliAllDates(text);
  return dates[0] || null;
}

/** Extract 10-digit national code (or with label کدملی / کد ملی) */
function extractNationalCode(text: string): string | null {
  const norm = toEnDigits(text);
  const m = norm.match(/(?:کد\s*ملی|کدملی)\s*[:=]?\s*(\d{8,10})/i);
  if (m) return m[1].padStart(10, "0");
  const m2 = norm.match(/\b(\d{10})\b/);
  if (m2) return m2[1];
  return null;
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

  // ── 0a. PRESENCE: «سرباز با کدملی ... در تاریخ ... در کدام رده خدمتی مشغول به خدمت بوده است ؟»
  // یا جستجوی حضور سربازان در یک بازه زمانی مشخص: «حضور سربازان در بازه زمانی ... تا ...» ──
  const allDates = extractJalaliAllDates(text);
  const nationalCode = extractNationalCode(text);

  const hasPresenceKeyword =
    /(حضور|حاضر|مشغول\s*به\s*خدمت|کدام\s*رده|کدام\s*یگان|در\s*رده|یگان\s*خدمتی|رده\s*خدمتی|کجا\s*(خدمت|بود|مشغول)|وضعیت\s*خدمت|استعلام\s*رده)/.test(n);
  const hasRangeKeyword =
    /(بازه|بازه\s*زمانی|فاصله|از\s*تاریخ|تا\s*تاریخ|الی|بین)/.test(n);
  const mentionsSoldier =
    /(سرباز|پرسنل|نیرو|کدملی|کد\s*ملی)/.test(n);

  // پرسش قالب‌گونه بدون پارامتر: «سرباز با کدملی ... در تاریخ ... در کدام رده خدمتی مشغول به خدمت بوده است ؟»
  if (
    hasPresenceKeyword &&
    allDates.length === 0 &&
    !nationalCode &&
    (/(کدملی|کد\s*ملی)/.test(n) || n.includes("...") || n.includes("…"))
  ) {
    return {
      kind: "presence",
      wantsCount: false,
      confidence: 0.99,
      raw: text,
    };
  }

  // ۱) جستجوی حضور در بازه زمانی (برای همه سربازان یا یک سرباز خاص)
  if (allDates.length >= 2 && (hasPresenceKeyword || hasRangeKeyword || mentionsSoldier)) {
    const sorted = [...allDates].sort();
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];
    const personName = extractPersonName(n, startDate.replace(/-/g, "/"));

    return {
      kind: "presence",
      startDate,
      endDate,
      nationalCode: nationalCode || undefined,
      personName: (looksLikePersonName(personName) && !/تاریخ|رده|خدمتی|کدملی|حضور|بازه/.test(personName)) ? personName : undefined,
      wantsCount: detectCount(n),
      confidence: 0.99,
      raw: text,
    };
  }

  // ۲) استعلام حضور در یک تاریخ معین: «سرباز با کدملی ... در تاریخ ... در کدام رده خدمتی مشغول به خدمت بوده است ؟»
  if (allDates.length === 1 && (nationalCode || hasPresenceKeyword || (mentionsSoldier && /(در\s*تاریخ|کدام\s*رده)/.test(n)))) {
    const targetDate = allDates[0];
    const personName = extractPersonName(n, targetDate.replace(/-/g, "/"));

    return {
      kind: "presence",
      targetDate,
      nationalCode: nationalCode || undefined,
      personName: (looksLikePersonName(personName) && !/تاریخ|رده|خدمتی|کدملی|حضور/.test(personName)) ? personName : undefined,
      wantsCount: false,
      confidence: 0.99,
      raw: text,
    };
  }

  // ── 0b. LEAVES & ABSENCE SUMMARY: «تعداد مرخصی ها / تشویقی ها / غیبت ها و خلا را بده» ──
  const hasLeavesVocab =
    n.includes("مرخصی") || n.includes("تشویقی") || n.includes("غیبت") || n.includes("خلا") || n.includes("خلاء");
  const hasLeavesSummaryIntent =
    hasLeavesVocab &&
    (/(تعداد|آمار|چند|چقدر|گزارش|بده|بگید|لیست|میزان|شمارش)/.test(n) ||
     (n.includes("مرخصی") && (n.includes("تشویقی") || n.includes("غیبت") || n.includes("خلا") || n.includes("خلاء"))) ||
     (n.includes("غیبت") && (n.includes("خلا") || n.includes("خلاء"))));

  if (hasLeavesSummaryIntent) {
    const personName = extractPersonName(n);
    return {
      kind: "leaves_summary",
      nationalCode: nationalCode || undefined,
      personName: (looksLikePersonName(personName) && !/مرخصی|تشویقی|غیبت|خلا|آمار|تعداد/.test(personName)) ? personName : undefined,
      wantsCount: true,
      confidence: 0.99,
      raw: text,
    };
  }

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
    case "presence":
      return executePresenceQuery(q);
    case "leaves_summary":
      return executeLeavesSummaryQuery(q);
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
  const alive = and(
    isNull(soldiers.deletedAt),
    sql`NOT (${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${todayIso()})`
  );

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
    .where(
      and(
        isNull(soldiers.deletedAt),
        sql`NOT (${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${todayIso()})`,
        cmp
      )
    )
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
    .where(
      and(
        isNull(soldiers.deletedAt),
        sql`NOT (${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${todayIso()})`,
        gte(col, from),
        lte(col, to)
      )
    )
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

// ───────────────────────────────────────────────────────────
// Presence Query Executor
// «سرباز با کدملی ... در تاریخ ... در کدام رده خدمتی مشغول به خدمت بوده است ؟»
// ───────────────────────────────────────────────────────────

async function executePresenceQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  // Case 0: قالب کلی بدون پارامترهای مشخص
  if (!q.targetDate && !q.startDate && !q.nationalCode && !q.personName) {
    return {
      success: true,
      kind: "presence",
      answer: `🔍 راهنمای استعلام وضعیت حضور پرسنل وظیفه:\n\nجهت استعلام دقیق رده خدمتی و حضور، دستور خود را به یکی از روش‌های زیر وارد نمایید:\n\n۱. استعلام رده خدمتی در تاریخ معین:\n«سرباز با کدملی ۱۲۳۴۵۶۷۸۹۰ در تاریخ ۱۴۰۳/۰۵/۱۰ در کدام رده خدمتی مشغول به خدمت بوده است؟»\n\n۲. جستجوی حضور سربازان در یک بازه زمانی:\n«حضور سربازان در بازه زمانی ۱۴۰۳/۰۱/۰۱ تا ۱۴۰۳/۰۶/۳۱»\n\n۳. استعلام حضور یک سرباز در بازه زمانی:\n«وضعیت حضور سرباز با کدملی ۱۲۳۴۵۶۷۸۹۰ در بازه ۱۴۰۳/۰۱/۰۱ تا ۱۴۰۳/۰۶/۳۱»`,
      data: [],
      total: 0,
    };
  }

  // Case 1: جستجوی حضور کلیه سربازان در یک بازه زمانی مشخص
  // «چت بات قابلیت جستجوی < حضور > سربازان را در یک بازه ی زمانی مشخص را داشته باشد»
  if (q.startDate && q.endDate && !q.nationalCode && !q.personName) {
    const startIso = q.startDate;
    const endIso = q.endDate;
    const startFa = toFaDigits(startIso.replace(/-/g, "/"));
    const endFa = toFaDigits(endIso.replace(/-/g, "/"));

    // کلیه پرسنلی که بازه خدمت آن‌ها با [startIso, endIso] همپوشانی دارد
    const matchingSoldiers = await db
      .select()
      .from(soldiers)
      .where(
        and(
          isNull(soldiers.deletedAt),
          sql`(${soldiers.dispatchDate} IS NULL OR ${soldiers.dispatchDate} <= ${endIso})`,
          sql`(${soldiers.serviceEndDate} IS NULL OR ${soldiers.serviceEndDate} >= ${startIso})`
        )
      )
      .orderBy(soldiers.lastName, soldiers.firstName);

    if (matchingSoldiers.length === 0) {
      return {
        success: true,
        kind: "presence",
        answer: `ℹ️ در بازه زمانی ${startFa} تا ${endFa} هیچ سربازی در سامانه مشغول به خدمت نبوده است.`,
        data: [],
        total: 0,
      };
    }

    const soldierIds = matchingSoldiers.map((s) => s.id);
    const trs = await db
      .select()
      .from(transfers)
      .where(
        and(
          inArray(transfers.soldierId, soldierIds),
          sql`${transfers.status} != 'لغو شده'`
        )
      )
      .orderBy(asc(transfers.transferDate), asc(transfers.id));

    const transfersBySoldier = new Map<number, typeof trs>();
    for (const t of trs) {
      const list = transfersBySoldier.get(t.soldierId) || [];
      list.push(t);
      transfersBySoldier.set(t.soldierId, list);
    }

    const unitCounts: Record<string, number> = {};
    const tableData: Record<string, unknown>[] = [];

    for (const s of matchingSoldiers) {
      const sTransfers = transfersBySoldier.get(s.id) || [];
      let unitOnRange = s.serviceUnit || "رده یگانی";

      for (const t of sTransfers) {
        const trDate = t.transferDate ? t.transferDate.split("T")[0] : null;
        const mStart = t.missionStartDate ? t.missionStartDate.split("T")[0] : null;
        const mEnd = t.missionEndDate ? t.missionEndDate.split("T")[0] : null;

        if (t.transferType === "مامور") {
          if (mStart && mStart <= endIso && (!mEnd || mEnd >= startIso)) {
            unitOnRange = `${t.toServiceUnit || unitOnRange} (مامور)`;
          }
        } else {
          if (trDate && trDate <= endIso) {
            unitOnRange = t.toServiceUnit || unitOnRange;
          }
        }
      }

      unitCounts[unitOnRange] = (unitCounts[unitOnRange] || 0) + 1;

      tableData.push({
        id: s.id,
        fullName: fullNameOf(s),
        nationalCode: s.nationalCode || "—",
        rank: s.rank || "—",
        serviceUnit: unitOnRange,
        dispatchDate: s.dispatchDate ? toFaDigits(s.dispatchDate.replace(/-/g, "/")) : "—",
        serviceEndDate: s.serviceEndDate ? toFaDigits(s.serviceEndDate.replace(/-/g, "/")) : "—",
      });
    }

    const unitBreakdown = Object.entries(unitCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([u, c]) => `• ${u}: ${toFaDigits(c)} نفر`)
      .join("\n");

    const answer = `📋 گزارش استعلام حضور پرسنل وظیفه در بازه زمانی ${startFa} تا ${endFa}:\n\n• مجموع پرسنل حاضر و مشغول به خدمت در این بازه: ${toFaDigits(matchingSoldiers.length)} نفر\n\n🏛️ توزیع حضور بر اساس رده خدمتی:\n${unitBreakdown}\n\n(جزئیات اسامی سربازان در جدول زیر ارائه گردیده است.)`;

    return {
      success: true,
      kind: "presence",
      answer,
      data: tableData,
      total: matchingSoldiers.length,
    };
  }

  // Case 2 & 3: جستجوی حضور یک سرباز مشخص
  let soldier: SoldierRow | null = null;

  if (q.nationalCode) {
    const rows = await db
      .select()
      .from(soldiers)
      .where(and(isNull(soldiers.deletedAt), eq(soldiers.nationalCode, q.nationalCode)))
      .limit(1);
    soldier = rows[0] || null;
  }

  if (!soldier && q.personName) {
    const matches = await findSoldiersByName(q.personName);
    if (matches.length === 1) {
      soldier = matches[0];
    } else if (matches.length > 1) {
      const names = matches
        .slice(0, 8)
        .map((m, i) => `${toFaDigits(i + 1)}. ${fullNameOf(m)} (کد ملی: ${toFaDigits(m.nationalCode || "—")})`)
        .join("\n");
      return {
        success: true,
        kind: "presence",
        answer: `🔎 چند سرباز با نام مشابه یافت شد. لطفاً کد ملی سرباز مورد نظر را بفرمایید:\n\n${names}`,
        data: matches,
        total: matches.length,
      };
    }
  }

  if (!soldier) {
    const ident = q.nationalCode
      ? `با کد ملی «${toFaDigits(q.nationalCode)}»`
      : q.personName
      ? `با نام «${q.personName}»`
      : "مورد نظر";
    return {
      success: true,
      kind: "presence",
      answer: `❌ سربازی ${ident} در سامانه یافت نشد. لطفاً کد ملی ۱۰ رقمی را بررسی فرمایید.`,
      data: [],
      total: 0,
    };
  }

  const fullName = fullNameOf(soldier);
  const natCodeFa = toFaDigits(soldier.nationalCode || "—");

  // Dates
  const dispatchIso = soldier.dispatchDate ? soldier.dispatchDate.split("T")[0] : null;
  const dispatchFa = dispatchIso ? toFaDigits(dispatchIso.replace(/-/g, "/")) : "ثبت نشده";
  const endIso = soldier.serviceEndDate ? soldier.serviceEndDate.split("T")[0] : null;
  const endFa = endIso ? toFaDigits(endIso.replace(/-/g, "/")) : "ثبت نشده";

  const trs = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.soldierId, soldier.id), sql`${transfers.status} != 'لغو شده'`))
    .orderBy(asc(transfers.transferDate), asc(transfers.id));

  // زیرحالت ۲: استعلام حضور این سرباز در یک بازه زمانی
  if (q.startDate && q.endDate) {
    const startIso = q.startDate;
    const endIso = q.endDate;
    const startFa = toFaDigits(startIso.replace(/-/g, "/"));
    const endFaRange = toFaDigits(endIso.replace(/-/g, "/"));

    if (dispatchIso && endIso < dispatchIso) {
      return {
        success: true,
        kind: "presence",
        answer: `ℹ️ در بازه زمانی ${startFa} تا ${endFaRange}، سرباز ${fullName} (کد ملی: ${natCodeFa}) هنوز اعزام نشده بود.\n📅 تاریخ اعزام: ${dispatchFa}`,
        data: [soldier],
        total: 1,
      };
    }

    if (endIso && startIso > endIso) {
      return {
        success: true,
        kind: "presence",
        answer: `ℹ️ در بازه زمانی ${startFa} تا ${endFaRange}، خدمت سرباز ${fullName} (کد ملی: ${natCodeFa}) خاتمه یافته و تسویه شده بود.\n📅 تاریخ ترخیص / پایان خدمت: ${endFa}\n🏛️ آخرین رده خدمتی: «${soldier.serviceUnit || "رده یگانی"}»`,
        data: [soldier],
        total: 1,
      };
    }

    let currentUnit = trs[0]?.fromServiceUnit || soldier.serviceUnit || "رده پایه";
    const historyList: string[] = [];

    for (const t of trs) {
      const trDate = t.transferDate ? t.transferDate.split("T")[0] : null;
      const mStart = t.missionStartDate ? t.missionStartDate.split("T")[0] : null;
      const mEnd = t.missionEndDate ? t.missionEndDate.split("T")[0] : null;

      if (t.transferType === "مامور") {
        if (mStart && mStart <= endIso && (!mEnd || mEnd >= startIso)) {
          const fromD = toFaDigits(mStart.replace(/-/g, "/"));
          const toD = mEnd ? toFaDigits(mEnd.replace(/-/g, "/")) : "پایان مأموریت";
          historyList.push(`• مأمور به رده «${t.toServiceUnit || "نامشخص"}» (از ${fromD} تا ${toD})`);
          currentUnit = `${t.toServiceUnit || currentUnit} (مامور)`;
        }
      } else {
        if (trDate && trDate <= endIso) {
          const fromD = toFaDigits(trDate.replace(/-/g, "/"));
          historyList.push(`• انتقال قطعی به رده «${t.toServiceUnit || "نامشخص"}» از تاریخ ${fromD}`);
          currentUnit = t.toServiceUnit || currentUnit;
        }
      }
    }

    if (historyList.length === 0) {
      historyList.push(`• استقرار در رده اصلی «${currentUnit}» در تمام طول این بازه`);
    }

    const meta = (soldier.metadata as Record<string, unknown>) || {};
    const leaves: any[] = Array.isArray(meta.leaves) ? (meta.leaves as any[]) : [];
    let leaveDaysInRange = 0;
    for (const l of leaves) {
      const lStart = l.startDate ? String(l.startDate).split("T")[0] : null;
      const lEnd = l.endDate ? String(l.endDate).split("T")[0] : lStart;
      if (lStart && lStart <= endIso && (!lEnd || lEnd >= startIso) && l.status === "استفاده شده") {
        leaveDaysInRange += Number(l.days) || 0;
      }
    }

    const answer = `🏢 گزارش استعلام حضور سرباز ${fullName} (کد ملی: ${natCodeFa}) در بازه زمانی ${startFa} تا ${endFaRange}:\n\n🏛️ رده خدمتی موثر در این بازه: «${currentUnit}»\n\n📌 سوابق رده‌های خدمتی در این بازه:\n${historyList.join("\n")}${leaveDaysInRange > 0 ? `\n\n🌴 مرخصی‌های استفاده‌شده در این بازه: ${toFaDigits(leaveDaysInRange)} روز` : ""}\n\n• تاریخ اعزام: ${dispatchFa} | پایان خدمت: ${endFa}`;

    return {
      success: true,
      kind: "presence",
      answer,
      data: [{ ...soldier, activeServiceUnitOnDate: currentUnit, startDate: startFa, endDate: endFaRange }],
      total: 1,
    };
  }

  // زیرحالت ۳: استعلام رده خدمتی در یک تاریخ مشخص
  // «سرباز با کدملی ... در تاریخ ... در کدام رده خدمتی مشغول به خدمت بوده است ؟»
  const targetDateIso = q.targetDate || todayIso();
  const targetDateFa = toFaDigits(targetDateIso.replace(/-/g, "/"));

  // Check 1: Target date is before dispatch
  if (dispatchIso && targetDateIso < dispatchIso) {
    return {
      success: true,
      kind: "presence",
      answer: `ℹ️ در تاریخ ${targetDateFa}، سرباز ${fullName} (کد ملی: ${natCodeFa}) هنوز به خدمت مقدس وظیفه عمومی اعزام نشده بود.\n\n📅 تاریخ اعزام سرباز: ${dispatchFa}`,
      data: [soldier],
      total: 1,
    };
  }

  // Check 2: Target date is after service end date
  if (endIso && targetDateIso > endIso) {
    return {
      success: true,
      kind: "presence",
      answer: `ℹ️ در تاریخ ${targetDateFa}، دوره خدمت وظیفه سرباز ${fullName} (کد ملی: ${natCodeFa}) به پایان رسیده و تسویه شده بود.\n\n📅 تاریخ ترخیص / پایان خدمت: ${endFa}\n🏛️ آخرین رده خدمتی: «${soldier.serviceUnit || "رده یگانی"}»`,
      data: [soldier],
      total: 1,
    };
  }

  // Check 3: Walk through transfers
  let currentUnit = trs[0]?.fromServiceUnit || soldier.serviceUnit || "رده اعزام اولیه";
  let attendanceType = "استقرار در یگان پایه";
  let activeTransfer: (typeof trs)[number] | null = null;
  let periodStart = dispatchFa;
  let periodEnd = trs.length > 0 && trs[0].transferDate ? toFaDigits(trs[0].transferDate.replace(/-/g, "/")) : endFa;

  for (const t of trs) {
    const trDate = t.transferDate ? t.transferDate.split("T")[0] : null;
    const mStart = t.missionStartDate ? t.missionStartDate.split("T")[0] : null;
    const mEnd = t.missionEndDate ? t.missionEndDate.split("T")[0] : null;

    if (t.transferType === "مامور") {
      if (mStart && targetDateIso >= mStart && (!mEnd || targetDateIso <= mEnd)) {
        currentUnit = t.toServiceUnit || currentUnit;
        attendanceType = `مأمور به خدمت موقت (از رده ${t.fromServiceUnit || "مبدأ"})`;
        activeTransfer = t;
        periodStart = toFaDigits(mStart.replace(/-/g, "/"));
        periodEnd = mEnd ? toFaDigits(mEnd.replace(/-/g, "/")) : "پایان مأموریت";
        break;
      } else if (mEnd && targetDateIso > mEnd) {
        currentUnit = t.fromServiceUnit || currentUnit;
        attendanceType = "بازگشت از مأموریت به رده اصلی";
      }
    } else {
      if (trDate && targetDateIso >= trDate) {
        currentUnit = t.toServiceUnit || currentUnit;
        attendanceType = `انتقال قطعی (از رده ${t.fromServiceUnit || "مبدأ"})`;
        activeTransfer = t;
        periodStart = toFaDigits(trDate.replace(/-/g, "/"));
        periodEnd = endFa;
      }
    }
  }

  // بررسی وضعیت مرخصی در تاریخ مشخص‌شده
  const meta = (soldier.metadata as Record<string, unknown>) || {};
  const leaves: any[] = Array.isArray(meta.leaves) ? (meta.leaves as any[]) : [];
  let onLeaveNote = "";
  for (const l of leaves) {
    const lStart = l.startDate ? String(l.startDate).split("T")[0] : null;
    const lEnd = l.endDate ? String(l.endDate).split("T")[0] : lStart;
    if (lStart && lStart <= targetDateIso && (!lEnd || lEnd >= targetDateIso) && l.status === "استفاده شده") {
      onLeaveNote = `\n🌴 وضعیت مرخصی در این روز: در حال استفاده از «${l.type}» (به مدت ${toFaDigits(l.days)} روز)`;
      break;
    }
  }

  const answer = `🏢 استعلام رده خدمتی در تاریخ ${targetDateFa}:\n\nسرباز ${fullName} (کد ملی: ${natCodeFa}) در تاریخ ${targetDateFa} در رده خدمتی «${currentUnit}» مشغول به خدمت بوده است.\n\n📌 جزئیات حضور در این تاریخ:\n• رده خدمتی: ${currentUnit}\n• وضعیت حضور: ${attendanceType}${onLeaveNote}\n• دوره حضور: از ${periodStart} تا ${periodEnd}\n• مستند دستور: ${activeTransfer?.documentNumber ? toFaDigits(activeTransfer.documentNumber) : "دستور یگانی"}${activeTransfer?.transferReason ? `\n• علت: ${activeTransfer.transferReason}` : ""}\n• تاریخ اعزام: ${dispatchFa} | پایان خدمت: ${endFa}`;

  return {
    success: true,
    kind: "presence",
    answer,
    data: [
      {
        ...soldier,
        activeServiceUnitOnDate: currentUnit,
        targetDate: targetDateFa,
        attendanceType,
        periodStart,
        periodEnd,
      },
    ],
    total: 1,
  };
}

// ───────────────────────────────────────────────────────────
// Leaves, Incentives, Absences & Gaps Summary
// «تعداد مرخصی ها / تشویقی ها / غیبت ها و خلا را بده»
// ───────────────────────────────────────────────────────────

async function executeLeavesSummaryQuery(q: AdvancedQuery): Promise<AdvancedResult> {
  // If query is for a specific soldier
  let targetSoldier: SoldierRow | null = null;
  if (q.nationalCode) {
    const rows = await db
      .select()
      .from(soldiers)
      .where(and(isNull(soldiers.deletedAt), eq(soldiers.nationalCode, q.nationalCode)))
      .limit(1);
    targetSoldier = rows[0] || null;
  }

  if (!targetSoldier && q.personName) {
    const matches = await findSoldiersByName(q.personName);
    if (matches.length === 1) targetSoldier = matches[0];
  }

  if (targetSoldier) {
    const s = targetSoldier;
    const fullName = fullNameOf(s);
    const natCodeFa = toFaDigits(s.nationalCode || "—");
    const meta = (s.metadata as Record<string, unknown>) || {};
    const leaves: any[] = Array.isArray(meta.leaves) ? (meta.leaves as any[]) : [];
    const quotas = (meta.leaveQuota as Record<string, number>) || {};

    const isMarried = s.maritalStatus === "متاهل";
    const defaultEligible = isMarried ? 36 : 30;
    const eligibleQuota = quotas.eligibleQuota && quotas.eligibleQuota > 0 ? quotas.eligibleQuota : defaultEligible;
    const medicalQuota = quotas.medicalQuota && quotas.medicalQuota > 0 ? quotas.medicalQuota : 30;

    let eligibleUsed = 0;
    let medicalUsed = 0;
    let incentiveUsed = 0;
    let otherUsed = 0;

    for (const l of leaves) {
      const d = Number(l.days) || 0;
      const isUsed = l.status === "استفاده شده";
      if (l.type.includes("استحقاق")) {
        if (isUsed) eligibleUsed += d;
      } else if (l.type.includes("استعلاج") || l.type.includes("پزشکی")) {
        if (isUsed) medicalUsed += d;
      } else if (l.type.includes("تشویق")) {
        if (isUsed) incentiveUsed += d;
      } else {
        if (isUsed) otherUsed += d;
      }
    }

    const eligibleRemaining = Math.max(0, eligibleQuota - eligibleUsed);
    const medicalRemaining = Math.max(0, medicalQuota - medicalUsed);

    // Fetch adjustments for this soldier
    const adjs = await db
      .select()
      .from(serviceAdjustments)
      .where(eq(serviceAdjustments.soldierId, s.id));

    let absenceDays = 0;
    let absenceCount = 0;
    let gapDays = 0;
    let gapCount = 0;
    let penaltyDays = 0;

    for (const a of adjs) {
      const d = Number(a.days) || 0;
      const t = a.type || "";
      if (t.includes("غیبت")) {
        absenceDays += d;
        absenceCount++;
        if (a.effectDirection === "increase") penaltyDays += d;
      } else if (t.includes("خلا") || t.includes("فرار")) {
        gapDays += d;
        gapCount++;
        if (a.effectDirection === "increase") penaltyDays += d;
      } else if (t.includes("اضافه") || a.effectDirection === "increase") {
        penaltyDays += d;
      }
    }

    // Check dispatch absence
    const dispatchAbsence = Number(toEnDigits(String(s.absenceDuration || "0")).replace(/[^0-9]/g, "")) || 0;
    if (dispatchAbsence > 0) {
      absenceDays += dispatchAbsence;
      absenceCount++;
    }

    const answer = `📊 کارنامه مرخصی‌ها، تشویقی‌ها، غیبت‌ها و خلاء خدمتی:\n👤 سرباز ${fullName} (کد ملی: ${natCodeFa} | رده: ${s.serviceUnit || "—"})\n\n🌴 ۱. مرخصی استحقاقی:\n• سهمیه قانونی مصوب: ${toFaDigits(eligibleQuota)} روز\n• استفاده شده: ${toFaDigits(eligibleUsed)} روز\n• مانده (استفاده نشده / طلب): ${toFaDigits(eligibleRemaining)} روز\n\n🏥 ۲. مرخصی استعلاجی:\n• سقف مجاز: ${toFaDigits(medicalQuota)} روز\n• استفاده شده (با تاییدیه پزشک): ${toFaDigits(medicalUsed)} روز\n• مانده مجاز: ${toFaDigits(medicalRemaining)} روز\n\n🎖️ ۳. مرخصی تشویقی:\n• تشویقی اعطا شده: ${toFaDigits(incentiveUsed)} روز (بدون کسر از استحقاقی)\n\n⚠️ ۴. غیبت‌ها و خلاء خدمتی:\n• غیبت غیرموجه: ${toFaDigits(absenceDays)} روز (${toFaDigits(absenceCount)} مورد)\n• خلاء خدمتی / فرار: ${toFaDigits(gapDays)} روز (${toFaDigits(gapCount)} مورد)\n• اضافه‌خدمت مصوب ناشی از غیبت/خلاء: ${toFaDigits(penaltyDays)} روز\n\nتعداد کل سوابق ثبت‌شده مرخصی در پرونده: ${toFaDigits(leaves.length)} مورد`;

    return {
      success: true,
      kind: "leaves_summary",
      answer,
      data: [s],
      total: 1,
    };
  }

  // General System-wide Summary (EXCLUDING settled soldiers!)
  const today = todayIso();
  const activeSoldiers = await db
    .select({
      id: soldiers.id,
      maritalStatus: soldiers.maritalStatus,
      metadata: soldiers.metadata,
      absenceDuration: soldiers.absenceDuration,
    })
    .from(soldiers)
    .where(
      and(
        isNull(soldiers.deletedAt),
        sql`NOT (${soldiers.serviceEndDate} IS NOT NULL AND ${soldiers.serviceEndDate} < ${today})`
      )
    );

  let totalEligibleUsed = 0;
  let totalEligibleRemaining = 0;
  let totalMedicalUsed = 0;
  let totalIncentiveUsed = 0;
  let totalLeavesRecords = 0;

  for (const s of activeSoldiers) {
    const meta = (s.metadata as Record<string, unknown>) || {};
    const leaves: any[] = Array.isArray(meta.leaves) ? (meta.leaves as any[]) : [];
    const quotas = (meta.leaveQuota as Record<string, number>) || {};
    const isMarried = s.maritalStatus === "متاهل";
    const defaultQuota = isMarried ? 36 : 30;
    const eligibleQuota = quotas.eligibleQuota && quotas.eligibleQuota > 0 ? quotas.eligibleQuota : defaultQuota;

    let sEligibleUsed = 0;
    for (const l of leaves) {
      const d = Number(l.days) || 0;
      const isUsed = l.status === "استفاده شده";
      if (l.type.includes("استحقاق")) {
        if (isUsed) sEligibleUsed += d;
      } else if (l.type.includes("استعلاج") || l.type.includes("پزشکی")) {
        if (isUsed) totalMedicalUsed += d;
      } else if (l.type.includes("تشویق")) {
        if (isUsed) totalIncentiveUsed += d;
      }
    }
    totalEligibleUsed += sEligibleUsed;
    totalEligibleRemaining += Math.max(0, eligibleQuota - sEligibleUsed);
    totalLeavesRecords += leaves.length;
  }

  // Adjustments for active soldiers
  const activeIds = activeSoldiers.map((s) => s.id);
  let totalAbsenceDays = 0;
  let totalAbsenceCount = 0;
  let totalGapDays = 0;
  let totalGapCount = 0;
  let totalPenalties = 0;
  const soldiersWithAbsenceSet = new Set<number>();

  if (activeIds.length > 0) {
    const adjs = await db
      .select()
      .from(serviceAdjustments)
      .where(inArray(serviceAdjustments.soldierId, activeIds));

    for (const a of adjs) {
      const d = Number(a.days) || 0;
      const t = a.type || "";
      if (t.includes("غیبت")) {
        totalAbsenceDays += d;
        totalAbsenceCount++;
        soldiersWithAbsenceSet.add(a.soldierId);
        if (a.effectDirection === "increase") totalPenalties += d;
      } else if (t.includes("خلا") || t.includes("فرار")) {
        totalGapDays += d;
        totalGapCount++;
        soldiersWithAbsenceSet.add(a.soldierId);
        if (a.effectDirection === "increase") totalPenalties += d;
      } else if (t.includes("اضافه") || a.effectDirection === "increase") {
        totalPenalties += d;
      }
    }
  }

  for (const s of activeSoldiers) {
    const dispatchAbsence = Number(toEnDigits(String(s.absenceDuration || "0")).replace(/[^0-9]/g, "")) || 0;
    if (dispatchAbsence > 0) {
      totalAbsenceDays += dispatchAbsence;
      totalAbsenceCount++;
      soldiersWithAbsenceSet.add(s.id);
    }
  }

  const answer = `📊 آمار تجمیعی مرخصی‌ها، تشویقی‌ها، غیبت‌ها و خلاء خدمتی پرسنل وظیفه:\n(مبنای محاسبه: کلیه سربازان در حال خدمت؛ سربازان تسویه‌شده از آمار حذف شده‌اند)\n\n🌴 ۱. مرخصی‌های استحقاقی:\n• مجموع روزهای استحقاقی استفاده‌شده: ${toFaDigits(totalEligibleUsed)} روز\n• مجموع روزهای مانده استحقاقی (طلب پرسنل): ${toFaDigits(totalEligibleRemaining)} روز\n\n🎖️ ۲. مرخصی‌های تشویقی:\n• مجموع روزهای تشویقی اعطاشده فرماندهی: ${toFaDigits(totalIncentiveUsed)} روز\n\n🏥 ۳. مرخصی‌های استعلاجی:\n• مجموع روزهای استعلاجی تاییدشده پزشکی: ${toFaDigits(totalMedicalUsed)} روز\n\n⚠️ ۴. غیبت‌ها و خلاء خدمتی:\n• مجموع روزهای غیبت غیرموجه: ${toFaDigits(totalAbsenceDays)} روز (${toFaDigits(totalAbsenceCount)} مورد)\n• مجموع روزهای خلاء خدمتی و فرار: ${toFaDigits(totalGapDays)} روز (${toFaDigits(totalGapCount)} مورد)\n• مجموع اضافه‌خدمت مصوب انضباطی: ${toFaDigits(totalPenalties)} روز\n• تعداد کل پرسنل دارای سابقه غیبت یا خلاء: ${toFaDigits(soldiersWithAbsenceSet.size)} نفر`;

  return {
    success: true,
    kind: "leaves_summary",
    answer,
    data: [
      {
        totalActiveSoldiers: activeSoldiers.length,
        totalEligibleUsed,
        totalEligibleRemaining,
        totalIncentiveUsed,
        totalMedicalUsed,
        totalAbsenceDays,
        totalGapDays,
        totalPenalties,
        soldiersWithAbsence: soldiersWithAbsenceSet.size,
      },
    ],
    total: activeSoldiers.length,
  };
}

// Re-exported so other modules can reuse the service-end helper consistently.
export { computeServiceEndDate };
