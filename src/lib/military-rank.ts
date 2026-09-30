/**
 * درجه‌ی نظامی سربازان وظیفه بر اساس مدرک تحصیلی
 * ------------------------------------------------
 * جدول زیر مطابق آیین‌نامه‌ی درجه‌دهی کارکنان وظیفه (ارتش/سپاه/ناجا) است:
 *
 *  مدرک تحصیلی                  →  درجه
 *  -------------------------------------------------
 *  زیر دیپلم / سیکل / ابتدایی    →  سرباز دوم
 *  دیپلم                        →  سرجوخه
 *  فوق دیپلم (کاردانی)           →  گروهبان سوم
 *  کارشناسی (لیسانس)             →  گروهبان یکم
 *  کارشناسی ارشد (فوق لیسانس)    →  ستوان سوم
 *  دکتری                        →  ستوان دوم
 *  پزشک (عمومی / تخصص)          →  ستوان یکم
 *  فوق تخصص پزشکی               →  سروان
 */

export const RANK_BY_EDUCATION: { education: string; rank: string }[] = [
  { education: "زیر دیپلم", rank: "سرباز دوم" },
  { education: "دیپلم", rank: "سرجوخه" },
  { education: "فوق دیپلم", rank: "گروهبان سوم" },
  { education: "کارشناسی", rank: "گروهبان یکم" },
  { education: "کارشناسی ارشد", rank: "ستوان سوم" },
  { education: "دکتری", rank: "ستوان دوم" },
  { education: "پزشک (عمومی/تخصص)", rank: "ستوان یکم" },
  { education: "فوق تخصص پزشکی", rank: "سروان" },
];

/** نرمال‌سازی نویسه‌های عربی/فارسی و فاصله‌ها برای مقایسه */
function norm(s: string): string {
  return s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const DEFAULT_RANK = "سرباز دوم";

/** بر اساس مدرک تحصیلی، درجه‌ی نظامی متناسب را برمی‌گرداند. */
export function rankForEducation(education: string | null | undefined): string {
  if (!education) return DEFAULT_RANK;
  const e = norm(education);

  if (e.includes("فوق تخصص") || e.includes("فوق دکترای تخصصی")) return "سروان";
  if (e.includes("پزشک") || e.includes("دندانپزشک") || e.includes("داروساز") || e.includes("دکترای حرفه") || e.includes("دکتری حرفه")) {
    return "ستوان یکم";
  }
  if (e.includes("دکتر") || e.includes("phd")) return "ستوان دوم";
  if (e.includes("ارشد") || e.includes("فوق لیسانس") || e.includes("فوق‌لیسانس")) return "ستوان سوم";
  if (e.includes("فوق دیپلم") || e.includes("فوق‌دیپلم") || e.includes("کاردانی")) return "گروهبان سوم";
  if (e.includes("کارشناسی") || e.includes("لیسانس")) return "گروهبان یکم";
  if (e.includes("زیر دیپلم") || e.includes("سیکل") || e.includes("ابتدایی") || e.includes("راهنمایی") || e.includes("بی سواد") || e.includes("بیسواد")) {
    return "سرباز دوم";
  }
  if (e.includes("دیپلم")) return "سرجوخه";
  return DEFAULT_RANK;
}
