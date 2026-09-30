export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  section: string;
  options?: string[];
  required?: boolean;
  /** ستون پیش‌فرض در جدول لیست سربازان */
  listVisible?: boolean;
  /** ستون «ضروری»: همیشه در همه‌ی لیست‌های سربازان نمایش داده می‌شود و قابل مخفی‌کردن نیست */
  listRequired?: boolean;
  /** ستون «اختیاری»: به‌صورت پیش‌فرض نمایش داده نمی‌شود ولی از منوی ستون‌ها قابل افزودن است */
  listOptional?: boolean;
}

export const MARITAL_OPTIONS = ["مجرد", "متاهل"];
export const BLOOD_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const YESNO_OPTIONS = ["دارد", "ندارد"];
export const RANK_OPTIONS = [
  "سرباز", "سرباز دوم", "سرباز یکم", "سرجوخه",
  "گروهبان سوم", "گروهبان دوم", "گروهبان یکم",
  "استوار دوم", "استوار یکم",
  "ستوان سوم", "ستوان دوم", "ستوان یکم", "سروان",
];
export const MEMBERSHIP_OPTIONS = ["وظیفه", "پیمانی", "رسمی", "قراردادی"];
export const DUTY_OPTIONS = ["سرباز وظیفه", "کارمند وظیفه", "پیمانی", "رسمی"];
export const RECRUITMENT_OPTIONS = ["عادی", "قطع خدمت", "سرباز جایگزین", "بهداشت و درمان", "امنیتی"];
export const EDUCATION_OPTIONS = ["زیر دیپلم", "دیپلم", "فوق دیپلم", "کارشناسی", "کارشناسی ارشد", "دکتری"];
export const PHYSICAL_OPTIONS = ["سالم", "ناتوان جزئی", "ناتوان کامل", "معاف از رزم", "بستری"];
export const SEPARATION_OPTIONS = ["پایان خدمت", "معافیت پزشکی", "فرار", "اخراج", "انتقال", "شهادت", "کسری خدمت"];
export const EXPULSION_OPTIONS = ["ندارد", "اخراج از خدمت", "اخراج از یگان"];
export const FRONT_OPTIONS = ["ندارد", "حضور در منطقه عملیاتی", "حضور در پشت جبهه", "رزمنده"];
export const CITY_OPTIONS = [
  "تهران", "اصفهان", "شیراز", "مشهد", "تبریز", "کرج", "اهواز", "قم",
  "کرمانشاه", "رشت", "یزد", "اراک", "همدان", "زنجان", "ساری",
  "کرمان", "اردبیل", "گرگان", "بوشهر", "بندرعباس", "سنندج", "خرم‌آباد",
];
export const UNIT_OPTIONS = [
  "یگان یکم پشتیبانی",
  "تیپ ۳۷ تکاور",
  "گروه ۴۴ توپخانه",
  "گردان ۵۰۵ پیاده",
  "دژبان مرکز",
  "فاوا و فناوری اطلاعات",
  "مرکز آموزش شهدای وظیفه",
  "بهداری یگان",
  "یگان قرارگاه",
  "پدافند هوایی",
  "گروه مهندسی رزمی",
  "سرمایه انسانی",
  "عملیات",
  "فرهنگی",
];

// Ordered field definitions. `section` groups fields in the multi-section form.
export const SOLDIER_FIELDS: FieldDef[] = [
  { key: "rowNumber", label: "ردیف", type: "number", section: "هویتی" },
  { key: "personnelCode", label: "کد پرسنلی", type: "text", section: "هویتی", listVisible: true },
  { key: "nationalCode", label: "کد ملی", type: "text", section: "هویتی", listVisible: true },
  { key: "firstName", label: "نام", type: "text", section: "هویتی", required: true, listVisible: true },
  { key: "lastName", label: "نام خانوادگی", type: "text", section: "هویتی", required: true, listVisible: true },
  { key: "fatherName", label: "نام پدر", type: "text", section: "هویتی", listVisible: true },
  { key: "birthDate", label: "تاریخ تولد", type: "date", section: "هویتی" },
  { key: "birthPlace", label: "محل تولد", type: "text", section: "هویتی" },
  { key: "identityBookletNumber", label: "شماره شناسنامه", type: "text", section: "هویتی" },
  { key: "maritalStatus", label: "وضعیت تاهل", type: "select", section: "هویتی", options: MARITAL_OPTIONS, listVisible: true },
  { key: "marriageDate", label: "تاریخ ازدواج", type: "date", section: "هویتی", listOptional: true },
  { key: "childrenCount", label: "تعداد فرزند", type: "number", section: "هویتی", listOptional: true },

  { key: "phoneNumber", label: "شماره تماس", type: "text", section: "تماس", listVisible: true, listRequired: true },
  { key: "homePhone", label: "تلفن منزل", type: "text", section: "تماس" },
  { key: "mobilePhone", label: "تلفن همراه", type: "text", section: "تماس" },
  { key: "city", label: "شهر محل سکونت", type: "select", section: "تماس", options: CITY_OPTIONS, listOptional: true },
  { key: "fullAddress", label: "آدرس کامل", type: "textarea", section: "تماس" },
  { key: "postalCode", label: "کد پستی", type: "text", section: "تماس" },

  { key: "serviceUnit", label: "رده خدمتی", type: "select", section: "خدمتی", options: UNIT_OPTIONS, listVisible: true },
  { key: "rank", label: "درجه", type: "select", section: "خدمتی", options: RANK_OPTIONS, listVisible: true },
  { key: "membershipType", label: "نوع عضویت", type: "select", section: "خدمتی", options: MEMBERSHIP_OPTIONS },
  { key: "dutyType", label: "وظیفه", type: "select", section: "خدمتی", options: DUTY_OPTIONS },
  { key: "recruitmentType", label: "نوع جذب", type: "select", section: "خدمتی", options: RECRUITMENT_OPTIONS },
  { key: "dispatchDate", label: "تاریخ اعزام", type: "date", section: "خدمتی", listVisible: true },
  { key: "serviceStartDate", label: "تاریخ شروع خدمت", type: "date", section: "خدمتی" },
  { key: "serviceEndDate", label: "تاریخ پایان خدمت", type: "date", section: "خدمتی", listVisible: true },
  { key: "fileNumber", label: "شماره پرونده", type: "text", section: "خدمتی" },
  { key: "archiveNumber", label: "شماره بایگانی", type: "text", section: "خدمتی" },
  { key: "documentDate", label: "تاریخ تنظیم سند", type: "date", section: "خدمتی" },
  { key: "dispatchOffice", label: "حوزه اعزام‌کننده", type: "text", section: "خدمتی" },
  { key: "dispatchIssueDate", label: "تاریخ صدور برگ اعزام", type: "date", section: "خدمتی" },
  { key: "issuingOffice", label: "حوزه صادرکننده", type: "text", section: "خدمتی" },
  { key: "extraServiceOnDispatch", label: "اضافه خدمت هنگام اعزام", type: "text", section: "خدمتی" },
  { key: "absenceDuration", label: "مدت غیبت", type: "text", section: "خدمتی" },

  { key: "educationLevel", label: "مدرک تحصیلی", type: "select", section: "تحصیلی", options: EDUCATION_OPTIONS, listVisible: true },
  { key: "educationMajor", label: "رشته تحصیلی", type: "text", section: "تحصیلی" },
  { key: "educationCode", label: "کد مدرک تحصیلی", type: "text", section: "تحصیلی" },
  { key: "educationAtDispatch", label: "تحصیلات هنگام اعزام", type: "select", section: "تحصیلی", options: EDUCATION_OPTIONS },
  { key: "majorAtDispatch", label: "رشته هنگام اعزام", type: "text", section: "تحصیلی" },
  { key: "educationAtEndCard", label: "تحصیلات هنگام کارت پایان خدمت", type: "select", section: "تحصیلی", options: EDUCATION_OPTIONS },
  { key: "majorAtEndCard", label: "رشته هنگام کارت پایان خدمت", type: "text", section: "تحصیلی" },

  { key: "eyeColor", label: "رنگ چشم", type: "text", section: "جسمانی" },
  { key: "hairColor", label: "رنگ مو", type: "text", section: "جسمانی" },
  { key: "skinColor", label: "رنگ چهره", type: "text", section: "جسمانی" },
  { key: "bloodType", label: "گروه خون", type: "select", section: "جسمانی", options: BLOOD_OPTIONS },
  { key: "weight", label: "وزن", type: "text", section: "جسمانی" },
  { key: "height", label: "قد", type: "text", section: "جسمانی" },
  { key: "wearsGlasses", label: "عینک", type: "select", section: "جسمانی", options: YESNO_OPTIONS },
  { key: "specialMark", label: "علامت ویژه", type: "text", section: "جسمانی" },
  { key: "physicalStatus", label: "وضعیت جسمانی", type: "select", section: "جسمانی", options: PHYSICAL_OPTIONS, listVisible: true, listRequired: true },
  { key: "diseaseType", label: "نوع بیماری", type: "text", section: "جسمانی" },
  { key: "injuryStatus", label: "مجروحیت", type: "text", section: "جسمانی" },
  { key: "injuryReason", label: "علت مجروحیت", type: "text", section: "جسمانی" },
  { key: "injuredOrgans", label: "اعضا مجروح", type: "text", section: "جسمانی" },
  { key: "injuryDate", label: "تاریخ مجروحیت", type: "date", section: "جسمانی" },
  { key: "workLimitation", label: "محدودیت کاری", type: "text", section: "جسمانی" },
  { key: "disabilityPercentage", label: "درصد جانبازی", type: "text", section: "جسمانی" },

  { key: "legalServiceDuration", label: "مدت قانونی خدمت", type: "text", section: "دوره خدمت" },
  { key: "completedServiceDuration", label: "مدت انجام‌شده", type: "text", section: "دوره خدمت" },
  { key: "serviceFromDate", label: "از تاریخ", type: "date", section: "دوره خدمت" },
  { key: "serviceToDate", label: "تا تاریخ", type: "date", section: "دوره خدمت" },
  { key: "serviceLocation", label: "محل خدمت", type: "text", section: "دوره خدمت" },
  { key: "serviceLocationCode", label: "کد محل خدمت", type: "text", section: "دوره خدمت" },
  { key: "serviceRole", label: "وظیفه و مسئولیت", type: "text", section: "دوره خدمت" },

  { key: "generalTrainingType", label: "دوره عمومی", type: "text", section: "آموزش" },
  { key: "generalTrainingFrom", label: "دوره عمومی از", type: "date", section: "آموزش" },
  { key: "generalTrainingTo", label: "دوره عمومی تا", type: "date", section: "آموزش" },
  { key: "generalTrainingLocation", label: "محل آموزش عمومی", type: "text", section: "آموزش" },
  { key: "specializedTrainingType", label: "دوره تخصصی", type: "text", section: "آموزش" },
  { key: "specializedTrainingFrom", label: "دوره تخصصی از", type: "date", section: "آموزش" },
  { key: "specializedTrainingTo", label: "دوره تخصصی تا", type: "date", section: "آموزش" },
  { key: "specializedTrainingLocation", label: "محل آموزش تخصصی", type: "text", section: "آموزش" },

  { key: "frontPresence", label: "حضور در جبهه", type: "select", section: "وضعیت", options: FRONT_OPTIONS },
  { key: "expulsionStatus", label: "وضعیت اخراج", type: "select", section: "وضعیت", options: EXPULSION_OPTIONS },
  { key: "separationType", label: "نوع انفصال", type: "select", section: "وضعیت", options: SEPARATION_OPTIONS },
  { key: "leaveTypes", label: "نوع مرخصی‌ها", type: "textarea", section: "وضعیت" },
  { key: "leaveEligible", label: "مرخصی استحقاقی", type: "text", section: "وضعیت" },
  { key: "leaveMedical", label: "مرخصی استعلاجی", type: "text", section: "وضعیت" },
  { key: "leaveIncentive", label: "مرخصی تشویقی", type: "text", section: "وضعیت" },
  { key: "rewardsAndPunishments", label: "تشویقات و تنبیهات", type: "textarea", section: "وضعیت" },
  { key: "serviceDeductions", label: "کسورات خدمت", type: "textarea", section: "وضعیت" },
  { key: "confirmedBySignature", label: "امضا تأییدکننده", type: "text", section: "وضعیت" },
  { key: "preparedBySignature", label: "امضا تنظیم‌کننده", type: "text", section: "وضعیت" },
  { key: "notes", label: "ملاحظات / توضیحات", type: "textarea", section: "وضعیت" },

  // ---- کارت‌های صادر شده (metadata) ----
  { key: "endCard1Number", label: "کارت پایان خدمت (اول) - شماره", type: "text", section: "کارت‌های صادره" },
  { key: "endCard1Date", label: "کارت پایان خدمت (اول) - تاریخ", type: "date", section: "کارت‌های صادره" },
  { key: "endCard1Holder", label: "کارت پایان خدمت (اول) - صادر و به", type: "text", section: "کارت‌های صادره" },
  { key: "endCard2Number", label: "کارت پایان خدمت (دوم) - شماره", type: "text", section: "کارت‌های صادره" },
  { key: "endCard2Date", label: "کارت پایان خدمت (دوم) - تاریخ", type: "date", section: "کارت‌های صادره" },
  { key: "endCard2Holder", label: "کارت پایان خدمت (دوم) - صادر و به", type: "text", section: "کارت‌های صادره" },

  // ---- تغییرات خدمتی (metadata) ----
  { key: "changesFromDate", label: "تغییرات خدمتی - از تاریخ", type: "date", section: "تغییرات خدمتی" },
  { key: "changesToDate", label: "تغییرات خدمتی - تا تاریخ", type: "date", section: "تغییرات خدمتی" },
  { key: "changesExtraService", label: "تغییرات - اضافه خدمت", type: "text", section: "تغییرات خدمتی" },

  // ---- فرم ۱۱۱ (metadata) ----
  { key: "dischargeUnit", label: "یگان ترخیص‌کننده", type: "text", section: "فرم ۱۱۱" },

  // ---- فرم تسویه حساب (metadata) ----
  { key: "settlementNumber", label: "شماره نامه تسویه", type: "text", section: "تسویه حساب" },
  { key: "attachmentRef", label: "پیوست", type: "text", section: "تسویه حساب" },
  { key: "priority", label: "ارجحیت", type: "select", section: "تسویه حساب", options: ["عادی", "فوری", "خیلی فوری"] },
  { key: "classification", label: "طبقه‌بندی", type: "select", section: "تسویه حساب", options: ["عادی", "محرمانه", "سری"] },
  { key: "settlementReason", label: "علت تسویه", type: "text", section: "تسویه حساب" },
];

export const SOLDIER_SECTIONS = Array.from(
  new Set(SOLDIER_FIELDS.map((f) => f.section)),
);

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  SOLDIER_FIELDS.map((f) => [f.key, f]),
);

/** ستون‌های پیش‌فرض لیست سربازان (شامل ستون‌های ضروری: شماره تماس و وضعیت جسمانی) */
export const LIST_FIELDS = SOLDIER_FIELDS.filter((f) => f.listVisible || f.listRequired);

/** ستون‌های اختیاری (تاریخ ازدواج، تعداد فرزند، شهر محل سکونت) */
export const LIST_OPTIONAL_FIELDS = SOLDIER_FIELDS.filter((f) => f.listOptional && !f.listRequired);

/** همه‌ی ستون‌های قابل نمایش در لیست (پیش‌فرض + اختیاری) */
export const LIST_ALL_FIELDS = [...LIST_FIELDS, ...LIST_OPTIONAL_FIELDS];

/** کلید ستون‌های ضروری که در هیچ لیستی نباید حذف شوند */
export const LIST_REQUIRED_KEYS = SOLDIER_FIELDS.filter((f) => f.listRequired).map((f) => f.key);

/** اطمینان از حضور ستون‌های ضروری در هر انتخاب ستون */
export function withRequiredColumns(keys: string[]): string[] {
  const set = new Set(keys);
  const missing = LIST_REQUIRED_KEYS.filter((k) => !set.has(k));
  return [...keys, ...missing];
}

export const DATE_KEYS = SOLDIER_FIELDS.filter((f) => f.type === "date").map(
  (f) => f.key,
);

export const SELECT_KEYS = SOLDIER_FIELDS.filter((f) => f.type === "select" && f.options).map(
  (f) => f.key,
);

export const ADJUSTMENT_TYPES = [
  { type: "کسری خدمت", direction: "decrease" },
  { type: "کمیسیون پزشکی", direction: "decrease" },
  { type: "کسری ایثارگری", direction: "decrease" },
  { type: "کسری مناطق عملیاتی", direction: "decrease" },
  { type: "اضافه خدمت", direction: "increase" },
  { type: "غیبت", direction: "increase" },
  { type: "فرار از خدمت", direction: "increase" },
  { type: "سایر (کاهشی)", direction: "decrease" },
  { type: "سایر (افزایشی)", direction: "increase" },
];
