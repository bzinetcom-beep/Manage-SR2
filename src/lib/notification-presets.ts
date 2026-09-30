/**
 * قوانین اعلان پیشنهادی (Preset)
 * ------------------------------
 * این قوانین هنگام اولین راه‌اندازی/بروزرسانی به‌صورت خودکار ساخته می‌شوند و از صفحه‌ی
 * «قوانین اعلان» نیز می‌توان با دکمه‌ی «افزودن قوانین پیشنهادی» دوباره آن‌ها را اضافه کرد
 * (قوانینی که هم‌نام قانون موجود باشند تکرار نمی‌شوند).
 *
 * نام‌های فیلد تاریخ (dateField) به‌صورت snake_case هستند؛ موتور اعلان آن‌ها را به
 * فیلدهای سرباز نگاشت می‌کند. سه فیلد «محاسبه‌ای» نیز پشتیبانی می‌شود:
 *   service_mid_date   → نیمه‌ی دوره‌ی خدمت (میانه‌ی اعزام تا پایان خدمت)
 *   mission_start_date → تاریخ معرفی در آخرین ماموریت (انتقال نوع «مامور»)
 *   mission_end_date   → تاریخ پایان آخرین ماموریت
 */
export interface RulePreset {
  name: string;
  description: string;
  dateField: string;
  daysBefore: number;
  priority: "low" | "normal" | "high" | "urgent";
  recurrence: "yearly" | "once";
  filters: Record<string, unknown>;
  messageTemplate: string;
}

const IN_SERVICE = { serviceStatus: "در حال خدمت" };

export const NOTIFICATION_RULE_PRESETS: RulePreset[] = [
  {
    name: "سالگرد ازدواج",
    description: "یادآوری سالگرد ازدواج سربازان متاهل (هر سال)",
    dateField: "marriage_date",
    daysBefore: 7,
    priority: "normal",
    recurrence: "yearly",
    filters: { maritalStatus: "متاهل" },
    messageTemplate:
      "سالگرد ازدواج سرباز {{firstName}} {{lastName}} ({{rank}}) در تاریخ {{eventDate}} است؛ {{daysLeft}} روز دیگر (سال {{years}}).",
  },
  {
    name: "تاریخ ازدواج در پیش‌رو",
    description: "هشدار برای سربازانی که تاریخ ازدواج آن‌ها در آینده ثبت شده است (یک‌بار)",
    dateField: "marriage_date",
    daysBefore: 14,
    priority: "normal",
    recurrence: "once",
    filters: {},
    messageTemplate:
      "تاریخ ازدواج سرباز {{firstName}} {{lastName}} در {{eventDate}} است؛ {{daysLeft}} روز دیگر. مرخصی/هماهنگی لازم بررسی شود.",
  },
  {
    name: "پایان خدمت — ۹۰ روز مانده",
    description: "اطلاع اولیه از نزدیک شدن پایان خدمت",
    dateField: "service_end_date",
    daysBefore: 90,
    priority: "low",
    recurrence: "once",
    filters: IN_SERVICE,
    messageTemplate:
      "خدمت سرباز {{firstName}} {{lastName}} (رده {{serviceUnit}}) در تاریخ {{eventDate}} پایان می‌یابد؛ {{daysLeft}} روز باقی مانده.",
  },
  {
    name: "پایان خدمت — ۳۰ روز مانده",
    description: "شروع آماده‌سازی مدارک تسویه‌حساب",
    dateField: "service_end_date",
    daysBefore: 30,
    priority: "normal",
    recurrence: "once",
    filters: IN_SERVICE,
    messageTemplate:
      "پایان خدمت سرباز {{firstName}} {{lastName}} ({{rank}}) در {{eventDate}} است؛ {{daysLeft}} روز مانده. مدارک تسویه‌حساب آماده شود.",
  },
  {
    name: "پایان خدمت — ۷ روز مانده",
    description: "هشدار مهم: صدور فرم‌های تسویه‌حساب و کارت پایان خدمت",
    dateField: "service_end_date",
    daysBefore: 7,
    priority: "high",
    recurrence: "once",
    filters: IN_SERVICE,
    messageTemplate:
      "فقط {{daysLeft}} روز تا پایان خدمت سرباز {{firstName}} {{lastName}} ({{eventDate}}) باقی مانده است. فرم ۱۱۱ و تسویه‌حساب صادر شود.",
  },
  {
    name: "پایان خدمت — امروز یا فردا",
    description: "هشدار فوری روز پایان خدمت",
    dateField: "service_end_date",
    daysBefore: 1,
    priority: "urgent",
    recurrence: "once",
    filters: IN_SERVICE,
    messageTemplate:
      "خدمت سرباز {{firstName}} {{lastName}} ({{serviceUnit}}) در تاریخ {{eventDate}} پایان می‌یابد ({{daysLeft}} روز مانده). تسویه‌حساب فوری انجام شود.",
  },
  {
    name: "نیمه‌ی دوره‌ی خدمت",
    description: "رسیدن سرباز به نیمه‌ی خدمت (میانه‌ی اعزام تا پایان خدمت)",
    dateField: "service_mid_date",
    daysBefore: 3,
    priority: "low",
    recurrence: "once",
    filters: IN_SERVICE,
    messageTemplate: "سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} به نیمه‌ی دوره‌ی خدمت می‌رسد.",
  },
  {
    name: "سالگرد اعزام (یک‌سالگی خدمت)",
    description: "سالگرد تاریخ اعزام سرباز به خدمت",
    dateField: "dispatch_date",
    daysBefore: 5,
    priority: "low",
    recurrence: "yearly",
    filters: IN_SERVICE,
    messageTemplate: "{{years}} سال از اعزام سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} می‌گذرد.",
  },
  {
    name: "تولد سرباز",
    description: "تبریک تولد سربازان در حال خدمت",
    dateField: "birth_date",
    daysBefore: 3,
    priority: "low",
    recurrence: "yearly",
    filters: IN_SERVICE,
    messageTemplate: "تولد {{years}} سالگی سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} است ({{daysLeft}} روز دیگر).",
  },
  {
    name: "شروع ماموریت (تاریخ معرفی)",
    description: "معرفی سرباز مامور به رده‌ی مقصد",
    dateField: "mission_start_date",
    daysBefore: 3,
    priority: "normal",
    recurrence: "once",
    filters: {},
    messageTemplate: "سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} برای ماموریت به رده‌ی مقصد معرفی می‌شود ({{daysLeft}} روز دیگر).",
  },
  {
    name: "پایان ماموریت — ۷ روز مانده",
    description: "نزدیک شدن پایان ماموریت؛ انتقال به رده‌ی جدید باید پیش‌بینی شود",
    dateField: "mission_end_date",
    daysBefore: 7,
    priority: "high",
    recurrence: "once",
    filters: {},
    messageTemplate:
      "ماموریت سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} پایان می‌یابد ({{daysLeft}} روز مانده). رده‌ی جدید برای انتقال تعیین شود.",
  },
  {
    name: "پایان ماموریت — امروز یا فردا",
    description: "هشدار فوری پایان ماموریت",
    dateField: "mission_end_date",
    daysBefore: 1,
    priority: "urgent",
    recurrence: "once",
    filters: {},
    messageTemplate:
      "ماموریت سرباز {{firstName}} {{lastName}} در {{eventDate}} به پایان می‌رسد. حکم انتقال به رده‌ی جدید صادر شود.",
  },
];
