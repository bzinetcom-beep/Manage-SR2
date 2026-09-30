// ═══════════════════════════════════════════════════════════
// OFFLINE PERSIAN NLP ENGINE — v2 (Improved Accuracy)
// Rule-based natural language parser for Persian queries
// Added: Confidence scoring, better matching, clear "I don't understand" responses
// ═══════════════════════════════════════════════════════════

import type { AIIntent, VisualizationType } from "./ai-interpreter";

export interface ParsedQuery {
  intent: AIIntent;
  filters: Record<string, string | string[]>;
  groupBy?: string;
  visualization: VisualizationType;
  export: boolean;
  limit: number;
  confidence: number; // 0-1: how confident we are about the parse
  understood: boolean; // true if we found meaningful filters/intent
}

// ═══════════════════════════════════════════════════════════
// KEYWORD DICTIONARIES
// ═══════════════════════════════════════════════════════════

const FIELD_KEYWORDS: Record<string, string> = {
  firstName: "نام",
  lastName: "نام خانوادگی",
  nationalCode: "کد ملی",
  personnelCode: "کد پرسنلی",
  city: "شهر",
  serviceUnit: "رده خدمتی",
  rank: "درجه",
  maritalStatus: "وضعیت تاهل",
  educationLevel: "مدرک تحصیلی",
  bloodType: "گروه خون",
  physicalStatus: "وضعیت جسمانی",
};

// Precise value mappings for fields
const FIELD_VALUES: Record<string, Record<string, string | string[]>> = {
  maritalStatus: {
    متاهل: "متاهل", مجرد: "مجرد", "ازدواج کرده": "متاهل", "همسر دار": "متاهل",
    "ازدواج نکرده": "مجرد", "بدون همسر": "مجرد",
  },
  serviceUnit: {
    "سرمایه انسانی": "سرمایه انسانی", عملیات: "عملیات", فرهنگی: "فرهنگی",
  },
  rank: {
    سرباز: "سرباز", "سرباز یکم": "سرباز یکم", "سرباز دوم": "سرباز دوم",
    "گروهبان": ["گروهبان سوم", "گروهبان دوم", "گروهبان یکم"],
    "گروهبان سوم": "گروهبان سوم", "گروهبان دوم": "گروهبان دوم", "گروهبان یکم": "گروهبان یکم",
    "استوار": ["استوار دوم", "استوار یکم"],
    "استوار دوم": "استوار دوم", "استوار یکم": "استوار یکم",
    "ستوان": ["ستوان سوم", "ستوان دوم", "ستوان یکم"],
    "ستوان سوم": "ستوان سوم", "ستوان دوم": "ستوان دوم", "ستوان یکم": "ستوان یکم",
    سروان: "سروان",
    افسر: ["ستوان سوم", "ستوان دوم", "ستوان یکم", "سروان"],
    "درجه دار": ["گروهبان سوم", "گروهبان دوم", "گروهبان یکم", "استوار دوم", "استوار یکم"],
  },
  membershipType: {
    وظیفه: "وظیفه", پیمانی: "پیمانی", رسمی: "رسمی", قراردادی: "قراردادی",
  },
  educationLevel: {
    "زیر دیپلم": "زیر دیپلم", دیپلم: "دیپلم", "فوق دیپلم": "فوق دیپلم",
    کارشناسی: "کارشناسی", "کارشناسی ارشد": "کارشناسی ارشد",
    دکتری: "دکتری", لیسانس: "کارشناسی", "فوق لیسانس": "کارشناسی ارشد", ارشد: "کارشناسی ارشد", دکترا: "دکتری",
  },
  bloodType: {
    "A+": "A+", "a+": "A+", "A-": "A-", "a-": "A-",
    "B+": "B+", "b+": "B+", "B-": "B-", "b-": "B-",
    "AB+": "AB+", "ab+": "AB+", "AB-": "AB-", "ab-": "AB-",
    "O+": "O+", "o+": "O+", "O-": "O-", "o-": "O-",
  },
  physicalStatus: {
    سالم: "سالم", "ناتوان جزئی": "ناتوان جزئی", "ناتوان کامل": "ناتوان کامل",
    "معاف از رزم": "معاف از رزم", بستری: "بستری",
  },
  city: {
    تهران: "تهران", اصفهان: "اصفهان", شیراز: "شیراز", مشهد: "مشهد",
    تبریز: "تبریز", کرج: "کرج", اهواز: "اهواز", قم: "قم",
    کرمانشاه: "کرمانشاه", رشت: "رشت", یزد: "یزد", اراک: "اراک",
    همدان: "همدان", زنجان: "زنجان", ساری: "ساری", کرمان: "کرمان",
    اردبیل: "اردبیل", گرگان: "گرگان", بوشهر: "بوشهر", بندرعباس: "بندرعباس",
  },
  groupBy: {
    "رده خدمتی": "serviceUnit", یگان: "serviceUnit",
    شهر: "city",
    "وضعیت تاهل": "maritalStatus", تاهل: "maritalStatus", ازدواج: "maritalStatus",
    "مدرک تحصیلی": "educationLevel", مدرک: "educationLevel", تحصیلات: "educationLevel",
    درجه: "rank",
    "گروه خون": "bloodType", خون: "bloodType",
    "وضعیت جسمانی": "physicalStatus",
  },
};

/**
 * Every enumerated value the system knows about (cities, ranks, education
 * levels, …). The advanced parser uses this to make sure it never mistakes a
 * filter value such as «تهران» for a person's name.
 */
export const KNOWN_FIELD_VALUES: ReadonlySet<string> = new Set(
  Object.entries(FIELD_VALUES)
    .filter(([field]) => field !== "groupBy")
    .flatMap(([, valueMap]) => [
      ...Object.keys(valueMap),
      ...Object.values(valueMap).flatMap((v) => (Array.isArray(v) ? v : [v])),
    ])
    .map((v) => String(v).trim())
    .filter(Boolean),
);

// Words that indicate an INTENT (not values)
const INTENT_WORDS = {
  count: ["چند نفر", "چند تا", "چندتا", "تعداد", "شمارش", "تعدادشون", "تعدادشان"],
  aggregate: ["توزیع", "بر اساس", "براساس", "نسبت", "دسته‌بندی", "دسته بندی", "گروه‌بندی", "گروه بندی", "مقایسه"],
  export: ["خروجی", "اکسل", "excel", "دانلود", "فایل", "خروجی بگیر"],
  visualization: {
    pie: ["نمودار دایره‌ای", "نمودار دایره ای", "دایره‌ای", "دایره ای", "نمودار کیک"],
    bar: ["نمودار میله‌ای", "نمودار میله ای", "میله‌ای", "میله ای", "ستونی"],
    line: ["نمودار خطی", "خطی", "روند"],
  },
};

// Stop words — common Persian words that don't carry filter meaning
const STOP_WORDS = new Set([
  "سربازان", "سربازها", "سرباز", "سربازا", "سربازها",
  "نشان", "بده", "بدهید", "بدهید", "نمایش", "بده", "بدهید",
  "را", "رو", "از", "به", "در", "با", "برای",
  "که", "چه", "کدام", "کدوم",
  "لیست", "لیستشون", "لیستشان",
  "لطفاً", "لطفا",
  "میخوام", "می‌خوام", "میخواهم", "می‌خواهم", "بگو",
  "اطلاعات", "اطلاعاتشون", "اطلاعاتشان",
  "همه", "تمام",
  "را", "را", "رو", "را",
  "کسانی", "افرادی", "اونایی", "آنهایی", "که",
]);

// ═══════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════

function normalizeText(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
    .replace(/\s+/g, " ").trim();
}

/**
 * Extract meaningful keywords from text, removing stop words.
 * Returns array of significant terms.
 */
function extractKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  // Remove common filler patterns
  let cleaned = normalized
    .replace(/سربازان?\s*/g, "")
    .replace(/سربازها\s*/g, "")
    .replace(/افرادی\s*که\s*/g, "")
    .replace(/کسانی\s*که\s*/g, "")
    .replace(/اونایی?\s*که\s*/g, "")
    .replace(/آنهایی?\s*که\s*/g, "")
    .replace(/\s*(را|رو)\s*(نشان|بده|بیار|نمایش|بگو|پیدا|بدهید)/g, "")
    .replace(/\s*(را|رو)\s*$/g, "")
    .replace(/\s*لطفاً?\s*/g, "")
    .replace(/\s*لطفا\s*/g, "")
    .replace(/\s*میخوام\s*/g, "")
    .replace(/\s*می‌خوام\s*/g, "")
    .replace(/\s*میخواهم\s*/g, "")
    .replace(/\s*می‌خواهم\s*/g, "")
    .replace(/\s*بگو\s*/g, "")
    .replace(/\s*یک\s*/g, "")
    .replace(/\s*را\s*/g, "")
    .replace(/\s*به\s*/g, "")
    .replace(/\s*از\s*/g, "")
    .replace(/\s*در\s*/g, "")
    .replace(/\s*با\s*/g, "")
    .trim();

  // If the cleaned text is empty, use the original (minus stop words)
  if (cleaned.length < 2) {
    cleaned = normalized
      .replace(/سربازان?\s*/g, "")
      .replace(/سربازها\s*/g, "")
      .replace(/\s*(لطفاً?|لطفا|میخوام|می‌خوام|میخواهم|می‌خواهم|بگو|نشان|بده|بیار|نمایش|پیدا)\s*/g, "")
      .trim();
  }

  // Split into words
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);

  // Also extract multi-word phrases
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(words[i] + " " + words[i + 1]);
  }
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words[i] + " " + words[i + 1] + " " + words[i + 2]);
  }

  return [...phrases, ...words];
}

/**
 * Detect what the user is asking for.
 */
function detectIntent(text: string): AIIntent {
  const normalized = normalizeText(text);
  for (const kw of INTENT_WORDS.count) {
    if (normalized.includes(kw)) return "count";
  }
  for (const kw of INTENT_WORDS.aggregate) {
    if (normalized.includes(kw)) return "aggregate";
  }
  return "query"; // Default
}

/**
 * Detect visualization preference.
 */
function detectVisualization(text: string): VisualizationType {
  const normalized = normalizeText(text);
  for (const kw of INTENT_WORDS.visualization.pie) {
    if (normalized.includes(kw)) return "pie";
  }
  for (const kw of INTENT_WORDS.visualization.bar) {
    if (normalized.includes(kw)) return "bar";
  }
  for (const kw of INTENT_WORDS.visualization.line) {
    if (normalized.includes(kw)) return "line";
  }
  return "table";
}

/**
 * Detect export preference.
 */
function detectExport(text: string): boolean {
  const normalized = normalizeText(text);
  for (const kw of INTENT_WORDS.export) {
    if (normalized.includes(kw)) return true;
  }
  return false;
}

/**
 * Extract filters with confidence scoring.
 * Only matches when there is a clear, unambiguous keyword match.
 */
/**
 * Whole-word containment for Persian text.
 *
 * `\b` in JavaScript is defined over [A-Za-z0-9_], so it never fires between
 * Persian letters — `\bسرباز\b` fails on «سرباز» yet «سرباز» would also match
 * inside «سربازان». We therefore delimit with an explicit "not a Persian
 * letter" guard on both sides.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\u0600-\\u06FF])${escaped}($|[^\\u0600-\\u06FF])`);
  return re.test(haystack);
}

/** All (field, keyword, value) triples sorted so longer keywords win first. */
const VALUE_INDEX: { field: string; keyword: string; value: string | string[] }[] = Object.entries(FIELD_VALUES)
  .filter(([field]) => field !== "groupBy")
  .flatMap(([field, valueMap]) =>
    Object.entries(valueMap).map(([keyword, value]) => ({ field, keyword, value })),
  )
  .sort((a, b) => b.keyword.length - a.keyword.length);

function extractFilters(text: string): { filters: Record<string, string | string[]>; confidence: number } {
  const keywords = extractKeywords(text);
  const normalized = normalizeText(text);
  const filters: Record<string, string | string[]> = {};
  let totalScore = 0;
  let maxPossibleScore = 0;

  // ── Phase 0: direct whole-word scan of the original sentence ──
  // This is the reliable path: «سربازان شهر تهران» → { city: "تهران" }.
  // Longest keyword first, so "کارشناسی ارشد" wins over "کارشناسی".
  for (const { field, keyword, value } of VALUE_INDEX) {
    if (filters[field]) continue;
    if (containsWord(normalized, keyword)) {
      filters[field] = value;
      totalScore += 2; // a direct hit is stronger evidence than a fuzzy one
    }
  }
  maxPossibleScore += 2;

  // Phase 1: Match field values from keywords
  for (const [field, valueMap] of Object.entries(FIELD_VALUES)) {
    if (field === "groupBy") continue;

    for (const [keyword, value] of Object.entries(valueMap)) {
      const found = keywords.some(kw => {
      const escaped = keyword.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b');
      return kw === keyword || regex.test(kw) || (keyword.length <= 2 && kw === keyword);
    });
      if (found) {
        if (!filters[field]) {
          filters[field] = value;
          totalScore += 1;
        }
      }
      maxPossibleScore += 1;
    }
  }

  // Phase 2: Detect "X های Y" pattern (e.g., "نیروهای عملیاتی")
  const haPattern = /(.+?)های?\s+(.+)/;
  const haMatch = normalized.match(haPattern);
  if (haMatch) {
    const modifier = normalizeText(haMatch[1]);
    // Check if modifier matches any field value
    for (const [field, valueMap] of Object.entries(FIELD_VALUES)) {
      if (field === "groupBy") continue;
      for (const [keyword, value] of Object.entries(valueMap)) {
        if (modifier.includes(keyword) || keyword.includes(modifier)) {
          if (!filters[field]) {
            filters[field] = value;
            totalScore += 1;
          }
        }
        maxPossibleScore += 1;
      }
    }
  }

  // Phase 3: Detect "X با Y" pattern
  const withPattern = /(.+?)\s+(?:با|و|دارای)\s+(.+)/;
  const withMatch = normalized.match(withPattern);
  if (withMatch) {
    for (const part of [normalizeText(withMatch[1]), normalizeText(withMatch[2])]) {
      for (const [field, valueMap] of Object.entries(FIELD_VALUES)) {
        if (field === "groupBy") continue;
        for (const [keyword, value] of Object.entries(valueMap)) {
          if (part.includes(keyword) || keyword.includes(part)) {
            if (!filters[field]) {
              filters[field] = value;
              totalScore += 1;
            }
          }
          maxPossibleScore += 1;
        }
      }
    }
  }

  // Calculate confidence: ratio of matched keywords
  const confidence = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

  return { filters, confidence: Math.min(1, confidence * 2) }; // Scale up slightly
}

/**
 * Detect group-by field.
 */
function detectGroupBy(text: string): string | undefined {
  const normalized = normalizeText(text);
  const keywords = extractKeywords(text);

  // First check: multi-word keywords in ORIGINAL text
  for (const [keyword, field] of Object.entries(FIELD_VALUES.groupBy)) {
    if (keyword.includes(' ') && normalized.includes(keyword)) {
      return String(field);
    }
  }

  // Second check: single-word keywords in ORIGINAL normalized text
  for (const [keyword, field] of Object.entries(FIELD_VALUES.groupBy)) {
    if (!keyword.includes(' ') && normalized.includes(keyword)) {
      return String(field);
    }
  }

  return undefined;
}

/**
 * Detect result limit.
 */
function detectLimit(text: string): number {
  const normalized = normalizeText(text);
  const persianNum = /([۰-۹٠-٩0-9]+)\s*(?:نفر|سرباز|تا|عدد)?/;
  const match = normalized.match(persianNum);
  if (match) {
    const num = parseInt(match[1].replace(/[۰-۹٠-٩]/g, (d: string) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))), 10);
    if (num > 0 && num <= 500) return num;
  }
  return 50;
}

// ═══════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════

export function parsePersianQuery(text: string): ParsedQuery {
  const normalized = normalizeText(text);

  // Quick check: is this a very short/generic query?
  const meaningfulWords = extractKeywords(normalized);
  const hasContent = meaningfulWords.length >= 1;

  const intent = detectIntent(normalized);
  const { filters, confidence } = extractFilters(normalized);
  const groupBy = detectGroupBy(normalized);

  // Special case: "توزیع بر اساس X" patterns
  if (!groupBy && normalized.includes("توزیع") && normalized.includes("بر اساس")) {
    for (const [keyword, field] of Object.entries(FIELD_VALUES.groupBy)) {
      if (normalized.includes(keyword)) {
        // Don't set groupBy here, let detectGroupBy handle it
        break;
      }
    }
  }
  let visualization = detectVisualization(normalized);
  const exportFlag = detectExport(normalized);
  const limit = detectLimit(normalized);

  // Determine if query is understood
  const understood = Object.keys(filters).length > 0 ||
    (intent === "count" && meaningfulWords.length > 0) ||
    groupBy !== undefined;

  // Boost confidence for aggregate + groupBy combos
  let finalConfidence = confidence;
  if (intent === "aggregate" && groupBy) {
    finalConfidence = Math.max(finalConfidence, 0.8);
  }
  if (intent === "count") {
    // Count queries need at least some meaningful content
    finalConfidence = hasContent ? Math.max(finalConfidence, 0.5) : 0.1;
  }

  // Auto-set visualization for aggregate
  if (intent === "aggregate" && visualization === "table") {
    visualization = "bar";
  }
  if (intent === "count") {
    visualization = "none";
  }

  return {
    intent: understood ? intent : "unknown",
    filters,
    groupBy,
    visualization,
    export: exportFlag,
    limit,
    confidence: finalConfidence,
    understood,
  };
}

/**
 * Generate a response message — or "I don't understand" if query wasn't parsed.
 */
export function generateResponseMessage(query: ParsedQuery, resultCount: number, groupByLabel?: string): string {
  if (!query.understood) {
    return "متأسفانه نتوانستم سوال شما را تحلیل کنم. 😕\n\nلطفاً واضح‌تر بپرسید. مثال:\n• سربازان متاهل را نشان بده\n• تعداد سربازان شهر تهران\n• توزیع بر اساس رده خدمتی در نمودار دایره‌ای\n• سربازان با مدرک کارشناسی";
  }

  const faCount = resultCount.toLocaleString("fa-IR");

  if (query.intent === "count") {
    return `📊 تعداد نتایج: ${faCount} سرباز`;
  }

  if (query.intent === "aggregate" && query.groupBy) {
    const fieldDef = Object.entries(FIELD_VALUES.groupBy).find(([, v]) => v === query.groupBy);
    const label = fieldDef ? fieldDef[0] : query.groupBy;
    return `📊 توزیع ${faCount} سرباز بر اساس ${label}`;
  }

  if (query.intent === "stats") {
    return `📊 آمار کلی: ${faCount} رکورد`;
  }

  // Query intent
  const filterDesc = Object.entries(query.filters)
    .map(([field, value]) => {
      const fieldLabel = FIELD_KEYWORDS[field] || field;
      const valueStr = Array.isArray(value) ? value.join("، ") : value;
      return `${fieldLabel}: ${valueStr}`;
    })
    .join("، ");

  if (filterDesc) {
    return `✅ ${faCount} سرباز یافت شد (${filterDesc})`;
  }

  return `${faCount} سرباز`;
}
