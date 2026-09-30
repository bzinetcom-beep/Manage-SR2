/**
 * موتور تولید نامه — Letter Engine
 * -----------------------------------------------------------------------------
 * وظیفه: تبدیل یک «قالب» (HTML حاوی جای‌نگهدارهای {{key}}) به متن نهایی نامه
 * برای هر سرباز، با استفاده از داده‌های خود سرباز + پارامترهای ورودی کاربر.
 *
 * سینتکس پشتیبانی‌شده:
 *   {{first_name}}            → مقدار فیلد سرباز
 *   {{نام}}                   → معادل فارسی همان فیلد (alias)
 *   {{today}} {{today_long}}  → توکن‌های سیستمی
 *   {{letter_number}}         → شماره نامه تولیدشده
 *   {{هر_چیز_دیگر}}           → پارامتر سفارشی (از کاربر یا ستون اکسل گرفته می‌شود)
 */

import { isoToJalali, toFaDigits, todayJalali } from "@/lib/jalali";

export interface TokenDef {
  key: string;
  label: string;
  group: string;
  aliases?: string[];
}

/** فیلدهای سرباز که مستقیماً قابل درج در نامه هستند */
export const SOLDIER_TOKENS: TokenDef[] = [
  { key: "full_name", label: "نام و نام خانوادگی", group: "هویتی", aliases: ["نام_کامل", "نام_و_نام_خانوادگی"] },
  { key: "first_name", label: "نام", group: "هویتی", aliases: ["نام"] },
  { key: "last_name", label: "نام خانوادگی", group: "هویتی", aliases: ["نام_خانوادگی", "فامیلی"] },
  { key: "father_name", label: "نام پدر", group: "هویتی", aliases: ["نام_پدر"] },
  { key: "national_code", label: "کد ملی", group: "هویتی", aliases: ["کد_ملی"] },
  { key: "personnel_code", label: "شماره پرسنلی", group: "هویتی", aliases: ["شماره_پرسنلی", "کد_پرسنلی"] },
  { key: "identity_booklet_number", label: "شماره شناسنامه", group: "هویتی", aliases: ["شماره_شناسنامه"] },
  { key: "birth_date", label: "تاریخ تولد", group: "هویتی", aliases: ["تاریخ_تولد"] },
  { key: "birth_place", label: "محل تولد", group: "هویتی", aliases: ["محل_تولد"] },
  { key: "city", label: "شهر", group: "هویتی", aliases: ["شهر"] },
  { key: "full_address", label: "نشانی", group: "هویتی", aliases: ["نشانی", "آدرس"] },
  { key: "postal_code", label: "کد پستی", group: "هویتی", aliases: ["کد_پستی"] },
  { key: "mobile_phone", label: "تلفن همراه", group: "هویتی", aliases: ["تلفن_همراه", "موبایل"] },
  { key: "marital_status", label: "وضعیت تأهل", group: "هویتی", aliases: ["وضعیت_تاهل"] },
  { key: "children_count", label: "تعداد فرزند", group: "هویتی", aliases: ["تعداد_فرزند"] },

  { key: "rank", label: "درجه", group: "خدمتی", aliases: ["درجه"] },
  { key: "service_unit", label: "یگان خدمتی", group: "خدمتی", aliases: ["یگان", "یگان_خدمتی", "رده_خدمتی"] },
  { key: "service_role", label: "سمت / شغل", group: "خدمتی", aliases: ["سمت", "شغل"] },
  { key: "duty_type", label: "نوع خدمت", group: "خدمتی", aliases: ["نوع_خدمت"] },
  { key: "membership_type", label: "نوع عضویت", group: "خدمتی", aliases: ["نوع_عضویت"] },
  { key: "recruitment_type", label: "نوع اعزام", group: "خدمتی", aliases: ["نوع_اعزام"] },
  { key: "dispatch_date", label: "تاریخ اعزام", group: "خدمتی", aliases: ["تاریخ_اعزام"] },
  { key: "service_start_date", label: "شروع خدمت", group: "خدمتی", aliases: ["شروع_خدمت"] },
  { key: "service_end_date", label: "پایان خدمت", group: "خدمتی", aliases: ["پایان_خدمت", "تاریخ_پایان_خدمت"] },
  { key: "service_location", label: "محل خدمت", group: "خدمتی", aliases: ["محل_خدمت"] },
  { key: "file_number", label: "شماره پرونده", group: "خدمتی", aliases: ["شماره_پرونده"] },
  { key: "archive_number", label: "شماره بایگانی", group: "خدمتی", aliases: ["شماره_بایگانی"] },

  { key: "education_level", label: "مدرک تحصیلی", group: "تحصیلی", aliases: ["مدرک", "مدرک_تحصیلی"] },
  { key: "education_major", label: "رشته تحصیلی", group: "تحصیلی", aliases: ["رشته", "رشته_تحصیلی"] },
  { key: "blood_type", label: "گروه خون", group: "تحصیلی", aliases: ["گروه_خون"] },
];

/** توکن‌های سیستمی که هنگام تولید به‌صورت خودکار پر می‌شوند */
export const SYSTEM_TOKENS: TokenDef[] = [
  { key: "today", label: "تاریخ امروز (شمسی)", group: "سیستمی", aliases: ["تاریخ_امروز", "تاریخ"] },
  { key: "letter_number", label: "شماره نامه", group: "سیستمی", aliases: ["شماره_نامه", "شماره"] },
  { key: "letter_date", label: "تاریخ نامه", group: "سیستمی", aliases: ["تاریخ_نامه"] },
  { key: "row_index", label: "ردیف", group: "سیستمی", aliases: ["ردیف"] },
];

export const ALL_TOKENS = [...SOLDIER_TOKENS, ...SYSTEM_TOKENS];

const ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const t of ALL_TOKENS) {
    map[normalizeKey(t.key)] = t.key;
    for (const a of t.aliases || []) map[normalizeKey(a)] = t.key;
  }
  return map;
})();

export function normalizeKey(k: string): string {
  return String(k).trim().replace(/[\s\u200c]+/g, "_").replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
}

export type SoldierLike = Record<string, unknown>;

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function val(soldier: SoldierLike, snake: string): string {
  const v = soldier[camel(snake)] ?? soldier[snake];
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

const DATE_KEYS = new Set([
  "birth_date",
  "dispatch_date",
  "service_start_date",
  "service_end_date",
  "marriage_date",
  "document_date",
]);

/** ساخت جدول مقادیر توکن برای یک سرباز */
export function buildContext(
  soldier: SoldierLike,
  extra: Record<string, string> = {},
): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const t of SOLDIER_TOKENS) {
    let v: string;
    if (t.key === "full_name") {
      v = `${val(soldier, "first_name")} ${val(soldier, "last_name")}`.trim();
    } else if (DATE_KEYS.has(t.key)) {
      const raw = val(soldier, t.key);
      v = raw ? isoToJalali(raw) : "";
    } else {
      v = val(soldier, t.key);
      if (/^[0-9]+$/.test(v)) v = toFaDigits(v);
    }
    ctx[t.key] = v;
  }
  ctx["today"] = todayJalali();
  ctx["letter_date"] = extra["letter_date"] || todayJalali();
  for (const [k, v] of Object.entries(extra)) {
    ctx[normalizeKey(k)] = v ?? "";
  }
  // metadata (فیلدهای پویا)
  const meta = soldier["metadata"];
  if (meta && typeof meta === "object") {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (v !== null && v !== undefined && ctx[normalizeKey(k)] === undefined) {
        ctx[normalizeKey(k)] = String(v);
      }
    }
  }
  return ctx;
}

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** استخراج همه‌ی جای‌نگهدارهای موجود در یک قالب */
export function extractPlaceholders(...htmls: string[]): string[] {
  const found = new Set<string>();
  for (const html of htmls) {
    if (!html) continue;
    let m: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(html))) {
      found.add(m[1].trim());
    }
  }
  return [...found];
}

/** جای‌نگهدارهایی که با فیلدهای سرباز/سیستم پوشش داده نمی‌شوند (پارامتر سفارشی) */
export function customPlaceholders(...htmls: string[]): string[] {
  return extractPlaceholders(...htmls).filter((p) => !ALIAS_MAP[normalizeKey(p)]);
}

export function resolveToken(raw: string, ctx: Record<string, string>): string | undefined {
  const norm = normalizeKey(raw);
  const canonical = ALIAS_MAP[norm];
  if (canonical && ctx[canonical] !== undefined) return ctx[canonical];
  if (ctx[norm] !== undefined) return ctx[norm];
  return undefined;
}

/** رندر نهایی قالب با مقادیر context */
export function renderTemplate(html: string, ctx: Record<string, string>, markMissing = true): string {
  if (!html) return "";
  return html.replace(TOKEN_RE, (full, rawKey: string) => {
    const v = resolveToken(rawKey, ctx);
    if (v === undefined || v === "") {
      return markMissing
        ? `<span class="ltr-missing" style="background:#fff3cd;border-bottom:1px dashed #e0a800;padding:0 2px;">${escapeHtml(
            "…",
          )}</span>`
        : "";
    }
    return escapeHtml(v);
  });
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** پاک‌سازی ساده HTML ورودی (حذف اسکریپت/ایونت‌ها) برای امنیت */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

/** ساخت شماره نامه به‌صورت ترتیبی */
export function makeLetterNumber(prefix: string, start: number, index: number): string {
  const n = start + index;
  const num = toFaDigits(String(n));
  return prefix ? `${prefix}/${num}` : num;
}

/** صفحه‌ی کامل HTML برای نمایش/چاپ یک نامه */
export function letterPageStyles(pageSize: string): string {
  const width = pageSize === "A5" ? "148mm" : "210mm";
  const minHeight = pageSize === "A5" ? "210mm" : "297mm";
  return `width:${width};min-height:${minHeight};`;
}
