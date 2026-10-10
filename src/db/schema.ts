import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Users & RBAC
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("viewer"), // admin | operator | viewer
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Soldiers — core entity
// Fixed columns cover the mandatory fields + high-value form fields.
// `metadata` (JSONB) stores custom/dynamic field values so new fields can be
// added from Settings without a migration.
// ---------------------------------------------------------------------------
export const soldiers = pgTable(
  "soldiers",
  {
    id: serial("id").primaryKey(),
    rowNumber: integer("row_number"),

    // Identity
    personnelCode: text("personnel_code"),
    nationalCode: text("national_code"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fatherName: text("father_name"),
    birthDate: text("birth_date"), // ISO yyyy-mm-dd (Gregorian)
    birthPlace: text("birth_place"),
    identityBookletNumber: text("identity_booklet_number"),
    phoneNumber: text("phone_number"),
    homePhone: text("home_phone"),
    mobilePhone: text("mobile_phone"),
    city: text("city"),
    fullAddress: text("full_address"),
    postalCode: text("postal_code"),

    // Service
    serviceUnit: text("service_unit"),
    rank: text("rank"),
    membershipType: text("membership_type"),
    dutyType: text("duty_type"),
    recruitmentType: text("recruitment_type"),
    maritalStatus: text("marital_status"),
    marriageDate: text("marriage_date"),
    childrenCount: integer("children_count").default(0),
    dispatchDate: text("dispatch_date"), // ISO — base for service end computation
    serviceStartDate: text("service_start_date"),
    serviceEndDate: text("service_end_date"), // ISO — computed
    fileNumber: text("file_number"),
    archiveNumber: text("archive_number"),
    documentDate: text("document_date"),

    // Education
    educationLevel: text("education_level"),
    educationMajor: text("education_major"),
    educationCode: text("education_code"),
    educationAtDispatch: text("education_at_dispatch"),
    majorAtDispatch: text("major_at_dispatch"),
    educationAtEndCard: text("education_at_end_card"),
    majorAtEndCard: text("major_at_end_card"),

    // Physical
    eyeColor: text("eye_color"),
    hairColor: text("hair_color"),
    skinColor: text("skin_color"),
    bloodType: text("blood_type"),
    weight: text("weight"),
    height: text("height"),
    wearsGlasses: text("wears_glasses"),
    specialMark: text("special_mark"),
    physicalStatus: text("physical_status"),
    diseaseType: text("disease_type"),
    injuryStatus: text("injury_status"),
    injuryDate: text("injury_date"),
    injuryReason: text("injury_reason"),
    disabilityPercentage: text("disability_percentage"),

    // Service duration / location
    legalServiceDuration: text("legal_service_duration"),
    completedServiceDuration: text("completed_service_duration"),
    serviceFromDate: text("service_from_date"),
    serviceToDate: text("service_to_date"),
    serviceLocation: text("service_location"),
    serviceLocationCode: text("service_location_code"),
    serviceRole: text("service_role"),
    dispatchOffice: text("dispatch_office"),
    dispatchIssueDate: text("dispatch_issue_date"),
    absenceDuration: text("absence_duration"),
    extraServiceOnDispatch: text("extra_service_on_dispatch"),
    issuingOffice: text("issuing_office"),

    // Training
    generalTrainingType: text("general_training_type"),
    generalTrainingFrom: text("general_training_from"),
    generalTrainingTo: text("general_training_to"),
    generalTrainingLocation: text("general_training_location"),
    specializedTrainingType: text("specialized_training_type"),
    specializedTrainingFrom: text("specialized_training_from"),
    specializedTrainingTo: text("specialized_training_to"),
    specializedTrainingLocation: text("specialized_training_location"),

    // Status
    frontPresence: text("front_presence"),
    expulsionStatus: text("expulsion_status"),
    separationType: text("separation_type"),
    leaveTypes: text("leave_types"),
    rewardsAndPunishments: text("rewards_and_punishments"),
    confirmedBySignature: text("confirmed_by_signature"),
    notes: text("notes"),
    attachment: text("attachment"),

    // Extensible bag
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Bookkeeping
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nationalIdx: index("soldiers_national_idx").on(t.nationalCode),
    personnelIdx: index("soldiers_personnel_idx").on(t.personnelCode),
    fileIdx: index("soldiers_file_idx").on(t.fileNumber),
  }),
);

// ---------------------------------------------------------------------------
// Service adjustments — impacts on serviceEndDate
// ---------------------------------------------------------------------------
export const serviceAdjustments = pgTable("service_adjustments", {
  id: serial("id").primaryKey(),
  soldierId: integer("soldier_id").notNull(),
  type: text("type").notNull(), // کسری | اضافه خدمت | غیبت | فرار | کمیسیون | ...
  effectDirection: text("effect_direction").notNull(), // increase | decrease
  days: integer("days").notNull().default(0),
  effectiveDate: text("effective_date"),
  title: text("title"),
  description: text("description"),
  legalDocumentNumber: text("legal_document_number"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Transfers — service unit transfer forms
// ---------------------------------------------------------------------------
export const transfers = pgTable("transfers", {
  id: serial("id").primaryKey(),
  soldierId: integer("soldier_id").notNull(),
  transferDate: text("transfer_date"),
  fromServiceUnit: text("from_service_unit"),
  toServiceUnit: text("to_service_unit"),
  transferReason: text("transfer_reason"),
  transferType: text("transfer_type").default("انتقال دائم"), // انتقال دائم | مامور
  // فقط برای «مامور»: تاریخ معرفی و پایان ماموریت (Jalali ISO)
  missionStartDate: text("mission_start_date"),
  missionEndDate: text("mission_end_date"),
  approvedBy: text("approved_by"),
  issuerName: text("issuer_name"),
  issuerRole: text("issuer_role"),
  description: text("description"),
  documentNumber: text("document_number"),
  attachment: text("attachment"),
  status: text("status").notNull().default("پیش‌نویس"), // پیش‌نویس | تایید شده | لغو شده
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Custom fields — dynamic field definitions
// ---------------------------------------------------------------------------
export const customFields = pgTable("custom_fields", {
  id: serial("id").primaryKey(),
  fieldKey: text("field_key").notNull().unique(),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().default("text"), // text | number | date | select | boolean
  options: jsonb("options").$type<string[]>().default([]),
  section: text("section").default("سایر"),
  isRequired: boolean("is_required").notNull().default(false),
  isSearchable: boolean("is_searchable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(), // soldier | adjustment | transfer | user | custom_field
  entityId: integer("entity_id"),
  action: text("action").notNull(), // create | update | delete | import | login
  userId: integer("user_id"),
  userName: text("user_name"),
  changes: jsonb("changes").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Import sessions
// ---------------------------------------------------------------------------
export const importSessions = pgTable("import_sessions", {
  id: serial("id").primaryKey(),
  fileName: text("file_name"),
  totalRows: integer("total_rows").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  matchRule: text("match_rule").default("nationalCode"),
  errors: jsonb("errors").$type<unknown[]>().default([]),
  userId: integer("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Widget settings — configurable home/login widgets (e.g. Quote widget)
// ---------------------------------------------------------------------------
export const widgetSettings = pgTable("widget_settings", {
  id: serial("id").primaryKey(),
  // Quote widget (سخن بزرگان)
  quoteText: text("quote_text").notNull().default("خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد"),
  quoteAuthor: text("quote_author").notNull().default("قائد شهید امت"),
  // Image stored as base64 data URL (or empty string for default)
  quoteImage: text("quote_image").notNull().default(""),
  // How the image fits inside the widget frame: "cover" | "contain"
  quoteImageFit: text("quote_image_fit").notNull().default("contain"),
  // Flag image (پرچم) — stored as base64 data URL
  flagImage: text("flag_image").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Soldier = typeof soldiers.$inferSelect;
export type NewSoldier = typeof soldiers.$inferInsert;
export type ServiceAdjustment = typeof serviceAdjustments.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type CustomField = typeof customFields.$inferSelect;
export type User = typeof users.$inferSelect;
export type WidgetSettings = typeof widgetSettings.$inferSelect;

// ---------------------------------------------------------------------------
// Service Units (رده‌های خدمتی)
// ---------------------------------------------------------------------------
export const serviceUnits = pgTable("service_units", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code"),
  description: text("description"),
  capacity: integer("capacity").notNull().default(10), // ظرفیت کل رده (تعداد معین سرباز)
  mandatedPercentage: integer("mandated_percentage").notNull().default(80), // درصد ظرفیت ابلاغی (مثلاً ۸۰ درصد)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceUnit = typeof serviceUnits.$inferSelect;

// ---------------------------------------------------------------------------
// Notification Rules — user-defined alert rules
// ---------------------------------------------------------------------------
export const notificationRules = pgTable("notification_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Which soldier date field to monitor (e.g. marriage_date, service_end_date, birth_date, dispatch_date)
  dateField: text("date_field").notNull(),
  // How many days before the event to trigger
  daysBefore: integer("days_before").notNull().default(5),
  // low | normal | high | urgent
  priority: text("priority").notNull().default("normal"),
  // yearly (for anniversaries) | once (one-shot per soldier)
  recurrence: text("recurrence").notNull().default("yearly"),
  // Optional extra filter (JSON) e.g. { maritalStatus: "متاهل", serviceStatus: "در حال خدمت" }
  filters: jsonb("filters").$type<Record<string, unknown>>().default({}),
  // Message template — supports {{firstName}}, {{lastName}}, {{daysLeft}}, {{eventDate}}
  messageTemplate: text("message_template").notNull().default("{{firstName}} {{lastName}}"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Notifications — generated alerts
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id"),
    soldierId: integer("soldier_id"),
    // Unique key to prevent duplicates: e.g. "rule-1-soldier-5-1403-05-15"
    dedupeKey: text("dedupe_key").notNull().unique(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("unread"), // unread | read | archived
    // Jalali date (yyyy-mm-dd) of the event this notification is about
    eventDate: text("event_date"),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("notifications_status_idx").on(t.status),
    soldierIdx: index("notifications_soldier_idx").on(t.soldierId),
  }),
);

export type NotificationRule = typeof notificationRules.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

// ---------------------------------------------------------------------------
// System Updates — hot-update packages, version history & rollback
// Each applied update package is recorded here so the system can show the
// version timeline and roll back to any previous version with one click.
// ---------------------------------------------------------------------------
export const systemUpdates = pgTable("system_updates", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(), // semver, e.g. 1.1.0
  title: text("title").notNull().default(""),
  changelog: jsonb("changelog").$type<string[]>().notNull().default([]),
  sqlScript: text("sql_script"),
  rollbackSql: text("rollback_sql"),
  settingsPatch: jsonb("settings_patch").$type<Record<string, unknown>>().default({}),
  // Snapshot of the previous state (settings, custom fields, rules, files)
  // captured right before applying — used to restore on rollback.
  previousState: jsonb("previous_state").$type<Record<string, unknown>>().default({}),
  files: jsonb("files").$type<{ path: string }[]>().default([]),
  status: text("status").notNull().default("applied"), // applied | rolled_back | failed
  previousVersion: text("previous_version"),
  errorMessage: text("error_message"),
  appliedBy: integer("applied_by"),
  appliedByName: text("applied_by_name"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
});

export const systemMeta = pgTable("system_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemUpdate = typeof systemUpdates.$inferSelect;

// ---------------------------------------------------------------------------
// Letter engine — templates, batches & generated letters
// (ماژول تولید انبوه نامه)
// ---------------------------------------------------------------------------
export const letterTemplates = pgTable("letter_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("عمومی"),
  description: text("description").notNull().default(""),
  subject: text("subject").notNull().default(""),
  headerHtml: text("header_html").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  footerHtml: text("footer_html").notNull().default(""),
  pageSize: text("page_size").notNull().default("A4"), // A4 | A5
  source: text("source").notNull().default("custom"), // builtin | docx | custom
  builtinKey: text("builtin_key"),
  // Extra (non-soldier) placeholders the operator fills at generation time
  params: jsonb("params")
    .$type<{ key: string; label: string; type?: string; defaultValue?: string; options?: string[] }[]>()
    .notNull()
    .default([]),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letterBatches = pgTable("letter_batches", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default(""),
  templateId: integer("template_id"),
  templateName: text("template_name").notNull().default(""),
  source: text("source").notNull().default("selection"), // selection | excel
  params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
  total: integer("total").notNull().default(0),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const letters = pgTable(
  "letters",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id"),
    templateId: integer("template_id"),
    templateName: text("template_name").notNull().default(""),
    soldierId: integer("soldier_id"),
    soldierName: text("soldier_name").notNull().default(""),
    nationalCode: text("national_code"),
    serviceUnit: text("service_unit"),
    subject: text("subject").notNull().default(""),
    letterNumber: text("letter_number"),
    letterDate: text("letter_date"), // Jalali string
    bodyHtml: text("body_html").notNull().default(""),
    pageSize: text("page_size").notNull().default("A4"),
    status: text("status").notNull().default("generated"), // generated | edited | archived
    createdBy: integer("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    batchIdx: index("letters_batch_idx").on(t.batchId),
    soldierIdx: index("letters_soldier_idx").on(t.soldierId),
  }),
);

export type LetterTemplate = typeof letterTemplates.$inferSelect;
export type LetterBatch = typeof letterBatches.$inferSelect;
export type Letter = typeof letters.$inferSelect;

// ---------------------------------------------------------------------------
// Backup & Restore (سازوکار پشتیبان‌گیری و بازیابی)
// ---------------------------------------------------------------------------
export const backupSettings = pgTable("backup_settings", {
  id: serial("id").primaryKey(),
  // مسیر پوشه‌ای که فایل‌های پشتیبان در آن ذخیره می‌شوند (قابل انتخاب توسط کاربر)
  directory: text("directory").notNull().default("backups"),
  autoEnabled: boolean("auto_enabled").notNull().default(true),
  // hourly | daily | weekly
  frequency: text("frequency").notNull().default("daily"),
  // ساعت اجرا به وقت محلی، مثل "02:00"
  timeOfDay: text("time_of_day").notNull().default("02:00"),
  // روز هفته برای حالت weekly (0=شنبه … 6=جمعه)
  dayOfWeek: integer("day_of_week").notNull().default(6),
  // حداکثر تعداد فایل پشتیبان نگه‌داشته‌شده (۰ = بی‌نهایت)
  retentionCount: integer("retention_count").notNull().default(30),
  includeAudit: boolean("include_audit").notNull().default(true),
  lastAutoBackupAt: timestamp("last_auto_backup_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backupRuns = pgTable("backup_runs", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  // manual | auto | pre_update | pre_restore
  kind: text("kind").notNull().default("manual"),
  status: text("status").notNull().default("success"), // success | failed
  tableCounts: jsonb("table_counts").$type<Record<string, number>>().default({}),
  durationMs: integer("duration_ms").notNull().default(0),
  appVersion: text("app_version"),
  errorMessage: text("error_message"),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BackupSettings = typeof backupSettings.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
