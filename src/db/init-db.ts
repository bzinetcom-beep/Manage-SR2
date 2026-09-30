import { Pool } from "pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;

let isInitialized = false;

export async function ensureDatabaseInitialized() {
  if (isInitialized) return;
  if (!databaseUrl) return;
  isInitialized = true;

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer', is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS soldiers (
        id SERIAL PRIMARY KEY, row_number INTEGER, personnel_code TEXT,
        national_code TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        father_name TEXT, birth_date TEXT, birth_place TEXT,
        identity_booklet_number TEXT, phone_number TEXT, home_phone TEXT,
        mobile_phone TEXT, city TEXT, full_address TEXT, postal_code TEXT,
        service_unit TEXT, rank TEXT, membership_type TEXT, duty_type TEXT,
        recruitment_type TEXT, marital_status TEXT, marriage_date TEXT,
        children_count INTEGER DEFAULT 0, dispatch_date TEXT,
        service_start_date TEXT, service_end_date TEXT,
        file_number TEXT, archive_number TEXT, document_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add missing columns
    const cols = [
      "education_level TEXT","education_major TEXT","education_code TEXT",
      "education_at_dispatch TEXT","major_at_dispatch TEXT",
      "education_at_end_card TEXT","major_at_end_card TEXT",
      "eye_color TEXT","hair_color TEXT","skin_color TEXT","blood_type TEXT",
      "weight TEXT","height TEXT","wears_glasses TEXT","special_mark TEXT",
      "physical_status TEXT","disease_type TEXT","injury_status TEXT",
      "injury_date TEXT","injury_reason TEXT","disability_percentage TEXT",
      "legal_service_duration TEXT","completed_service_duration TEXT",
      "service_from_date TEXT","service_to_date TEXT",
      "service_location TEXT","service_location_code TEXT","service_role TEXT",
      "dispatch_office TEXT","dispatch_issue_date TEXT","absence_duration TEXT",
      "extra_service_on_dispatch TEXT","issuing_office TEXT",
      "general_training_type TEXT","general_training_from TEXT",
      "general_training_to TEXT","general_training_location TEXT",
      "specialized_training_type TEXT","specialized_training_from TEXT",
      "specialized_training_to TEXT","specialized_training_location TEXT",
      "front_presence TEXT","expulsion_status TEXT","separation_type TEXT",
      "leave_types TEXT","rewards_and_punishments TEXT",
      "confirmed_by_signature TEXT","notes TEXT",
      "metadata JSONB DEFAULT '{}'::jsonb","deleted_at TIMESTAMPTZ","created_by INTEGER",
      "attachment TEXT",
    ];
    for (const c of cols) {
      await client.query(`ALTER TABLE soldiers ADD COLUMN IF NOT EXISTS ${c}`).catch(() => {});
    }

    const tables = [
      `CREATE TABLE IF NOT EXISTS service_adjustments (
        id SERIAL PRIMARY KEY, soldier_id INTEGER NOT NULL, type TEXT NOT NULL,
        effect_direction TEXT NOT NULL, days INTEGER NOT NULL DEFAULT 0,
        effective_date TEXT, title TEXT, description TEXT, legal_document_number TEXT,
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY, soldier_id INTEGER NOT NULL,
        from_service_unit TEXT, to_service_unit TEXT, transfer_date TEXT,
        transfer_reason TEXT, transfer_type TEXT DEFAULT 'انتقال',
        status TEXT NOT NULL DEFAULT 'پیش‌نویس', document_number TEXT,
        approved_by TEXT, issuer_name TEXT, issuer_role TEXT, description TEXT,
        attachment TEXT, created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS custom_fields (
        id SERIAL PRIMARY KEY, field_key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text', options JSONB DEFAULT '[]'::jsonb,
        section TEXT DEFAULT 'سایر', is_required BOOLEAN NOT NULL DEFAULT false,
        is_searchable BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY, entity TEXT NOT NULL, entity_id INTEGER,
        action TEXT NOT NULL, user_id INTEGER, user_name TEXT,
        changes JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS import_sessions (
        id SERIAL PRIMARY KEY, file_name TEXT, total_rows INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
        match_rule TEXT DEFAULT 'nationalCode', errors JSONB DEFAULT '[]'::jsonb,
        user_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS widget_settings (
        id SERIAL PRIMARY KEY,
        quote_text TEXT NOT NULL DEFAULT 'خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد',
        quote_author TEXT NOT NULL DEFAULT 'قائد شهید امت', quote_image TEXT NOT NULL DEFAULT '',
        quote_image_fit TEXT NOT NULL DEFAULT 'contain', flag_image TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS notification_rules (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        date_field TEXT NOT NULL, days_before INTEGER NOT NULL DEFAULT 5,
        priority TEXT NOT NULL DEFAULT 'normal', recurrence TEXT NOT NULL DEFAULT 'yearly',
        filters JSONB DEFAULT '{}'::jsonb,
        message_template TEXT NOT NULL DEFAULT '{{firstName}} {{lastName}}',
        is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY, rule_id INTEGER, soldier_id INTEGER,
        dedupe_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'unread',
        event_date TEXT, triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ
      );`,
      `CREATE TABLE IF NOT EXISTS service_units (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT,
        description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE TABLE IF NOT EXISTS system_updates (
        id SERIAL PRIMARY KEY, version TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        changelog JSONB NOT NULL DEFAULT '[]'::jsonb, sql_script TEXT, rollback_sql TEXT,
        settings_patch JSONB DEFAULT '{}'::jsonb, previous_state JSONB DEFAULT '{}'::jsonb,
        files JSONB DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'applied',
        previous_version TEXT, error_message TEXT,
        applied_by INTEGER, applied_by_name TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), rolled_back_at TIMESTAMPTZ
      );`,
      `CREATE TABLE IF NOT EXISTS system_meta (
        key TEXT PRIMARY KEY, value JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
    ];
    for (const ddl of tables) {
      await client.query(ddl);
    }

    // Columns added after the first release (safe on old databases)
    const patches = [
      // «خطای سرور» هنگام آپلود عکس ویجت: ستون تصویر پرچم در دیتابیس‌های قدیمی وجود نداشت
      "ALTER TABLE widget_settings ADD COLUMN IF NOT EXISTS flag_image TEXT NOT NULL DEFAULT ''",
      // انتقال «مامور»: تاریخ معرفی و پایان ماموریت
      "ALTER TABLE transfers ADD COLUMN IF NOT EXISTS mission_start_date TEXT",
      "ALTER TABLE transfers ADD COLUMN IF NOT EXISTS mission_end_date TEXT",
      "ALTER TABLE transfers ALTER COLUMN transfer_type SET DEFAULT 'انتقال دائم'",
    ];
    for (const ddl of patches) {
      await client.query(ddl).catch((e) => console.error("[SRMS] schema patch failed:", ddl, e.message));
    }

    // Data migrations (رُند کردن تاریخ‌ها، درجه‌ی نظامی، نوع انتقال، قوانین اعلان پیشنهادی)
    const { runDataMigrations } = await import("@/lib/data-migrations");
    await runDataMigrations(client);

    // Register the base version once (hot-update history starts from here)
    await client.query(
      `INSERT INTO system_meta (key, value) VALUES ('current_version', '"1.0.0"'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO system_meta (key, value) VALUES ('base_version', '"1.0.0"'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    );

    // Seed users if empty
    const cnt = await client.query("SELECT count(*)::int AS c FROM users");
    if (cnt.rows[0].c === 0) {
      for (const [u, p, f, r] of [["admin","admin123","مدیر سیستم","admin"],["operator","operator123","کاربر ثبت اطلاعات","operator"],["viewer","viewer123","کاربر مشاهده","viewer"]]) {
        const h = await bcrypt.hash(p!, 10);
        await client.query("INSERT INTO users (username,password_hash,full_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [u, h, f, r]);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}
