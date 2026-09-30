import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool, Client } = pg;

// Common default passwords attempted if connection fails with .env password
const COMMON_PASSWORDS = ["postgres", "123456", "admin", "Postgres123!", "root", "1234", "12345678", "password"];

/**
 * Extracts connection parameters from a PostgreSQL URL
 */
function parsePgUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      user: parsed.username || "postgres",
      password: parsed.password || "postgres",
      host: parsed.hostname || "localhost",
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, "") : "app_db",
    };
  } catch {
    return { user: "postgres", password: "postgres", host: "localhost", port: 5432, database: "app_db" };
  }
}

async function ensureDatabaseExists(cfg) {
  // Passwords to attempt
  const passwordsToTry = Array.from(new Set([cfg.password, ...COMMON_PASSWORDS]));

  let rootClient = null;
  let successfulPassword = null;

  for (const pass of passwordsToTry) {
    const testClient = new Client({
      user: cfg.user,
      password: pass,
      host: cfg.host,
      port: cfg.port,
      database: "postgres", // Connect to default postgres DB first
      connectionTimeoutMillis: 3000,
    });

    try {
      await testClient.connect();
      rootClient = testClient;
      successfulPassword = pass;
      break;
    } catch (e) {
      await testClient.end().catch(() => {});
    }
  }

  if (!rootClient) {
    throw new Error(`امکان اتصال به PostgreSQL وجود ندارد. لطفاً رمز عبور کاربر postgres را در فایل .env بررسی نمایید.`);
  }

  try {
    // Check if target database exists
    const res = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [cfg.database]);
    if (res.rowCount === 0) {
      console.log(`⚡ پایگاه‌داده «${cfg.database}» وجود ندارد. در حال ساخت اتوماتیک دیتابیس...`);
      await rootClient.query(`CREATE DATABASE "${cfg.database}"`);
      console.log(`✓ پایگاه‌داده «${cfg.database}» با موفقیت ساخته شد.`);
    }
  } finally {
    await rootClient.end().catch(() => {});
  }

  return { ...cfg, password: successfulPassword };
}

async function main() {
  console.log("=========================================================");
  console.log("   SAMANAH MANAGEMENT MANABE SARBAZ (SRMS3) - WINDOWS BOOT");
  console.log("   راه انداز خودکار پایگاه‌داده و سرور - سال ۱۴۰۵");
  console.log("=========================================================");
  console.log("");

  const rawUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/app_db";
  const initialCfg = parsePgUrl(rawUrl);

  console.log("🔍 در حال بررسی و ساخت پایگاه داده در PostgreSQL...");
  let activeCfg;
  try {
    activeCfg = await ensureDatabaseExists(initialCfg);
    console.log("✓ اتصال به PostgreSQL و ساخت پایگاه‌داده: موفقیت‌آمیز!");
  } catch (err) {
    console.error("\n❌ خطا در اتصال به دیتابیس PostgreSQL!");
    console.error("---------------------------------------------------------");
    console.error("۱. آیا سرویس PostgreSQL روی سیستم شما روشن و فعال است؟");
    console.error("۲. تنظیمات فایل .env را بررسی کنید. رمز عبور فعلی:", initialCfg.password);
    console.error("۳. جزییات خطا:", err.message);
    console.error("---------------------------------------------------------\n");
    process.exit(1);
  }

  // Connect to target database
  const targetPool = new Pool({
    user: activeCfg.user,
    password: activeCfg.password,
    host: activeCfg.host,
    port: activeCfg.port,
    database: activeCfg.database,
    connectionTimeoutMillis: 5000,
  });

  const client = await targetPool.connect();
  try {
    console.log("⚡ در حال ساخت خودکار جدول‌ها و ۵۰+ ستون دیتابیس...");

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Soldiers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS soldiers (
        id SERIAL PRIMARY KEY,
        row_number INTEGER,
        personnel_code TEXT,
        national_code TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        father_name TEXT,
        birth_date TEXT,
        birth_place TEXT,
        identity_booklet_number TEXT,
        phone_number TEXT,
        home_phone TEXT,
        mobile_phone TEXT,
        city TEXT,
        full_address TEXT,
        postal_code TEXT,
        service_unit TEXT,
        rank TEXT,
        membership_type TEXT,
        duty_type TEXT,
        recruitment_type TEXT,
        marital_status TEXT,
        marriage_date TEXT,
        children_count INTEGER DEFAULT 0,
        dispatch_date TEXT,
        service_start_date TEXT,
        service_end_date TEXT,
        file_number TEXT,
        archive_number TEXT,
        document_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure all 50+ soldier extended columns exist
    const soldierCols = [
      "education_level TEXT", "education_major TEXT", "education_code TEXT",
      "education_at_dispatch TEXT", "major_at_dispatch TEXT", "education_at_end_card TEXT",
      "major_at_end_card TEXT", "eye_color TEXT", "hair_color TEXT", "skin_color TEXT",
      "blood_type TEXT", "weight TEXT", "height TEXT", "wears_glasses TEXT",
      "special_mark TEXT", "physical_status TEXT", "disease_type TEXT",
      "injury_status TEXT", "injury_date TEXT", "injury_reason TEXT", "disability_percentage TEXT",
      "legal_service_duration TEXT", "completed_service_duration TEXT",
      "service_from_date TEXT", "service_to_date TEXT", "service_location TEXT",
      "service_location_code TEXT", "service_role TEXT", "dispatch_office TEXT",
      "dispatch_issue_date TEXT", "absence_duration TEXT", "extra_service_on_dispatch TEXT",
      "issuing_office TEXT", "general_training_type TEXT", "general_training_from TEXT",
      "general_training_to TEXT", "general_training_location TEXT", "specialized_training_type TEXT",
      "specialized_training_from TEXT", "specialized_training_to TEXT", "specialized_training_location TEXT",
      "front_presence TEXT", "expulsion_status TEXT", "separation_type TEXT", "leave_types TEXT",
      "rewards_and_punishments TEXT", "confirmed_by_signature TEXT", "notes TEXT",
      "metadata JSONB DEFAULT '{}'::jsonb", "deleted_at TIMESTAMPTZ", "created_by INTEGER"
    ];

    for (const colDef of soldierCols) {
      await client.query(`ALTER TABLE soldiers ADD COLUMN IF NOT EXISTS ${colDef};`);
    }

    // 3. Service Adjustments
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_adjustments (
        id SERIAL PRIMARY KEY,
        soldier_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        effect_direction TEXT NOT NULL,
        days INTEGER NOT NULL DEFAULT 0,
        effective_date TEXT,
        title TEXT,
        description TEXT,
        legal_document_number TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Transfers
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        soldier_id INTEGER NOT NULL,
        from_service_unit TEXT,
        to_service_unit TEXT,
        transfer_date TEXT,
        transfer_reason TEXT,
        transfer_type TEXT DEFAULT 'انتقال',
        status TEXT NOT NULL DEFAULT 'پیش‌نویس',
        document_number TEXT,
        approved_by TEXT,
        issuer_name TEXT,
        issuer_role TEXT,
        description TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 5. Custom Fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_fields (
        id SERIAL PRIMARY KEY,
        field_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text',
        options JSONB DEFAULT '[]'::jsonb,
        section TEXT DEFAULT 'سایر',
        is_required BOOLEAN NOT NULL DEFAULT false,
        is_searchable BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 6. Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        action TEXT NOT NULL,
        user_id INTEGER,
        user_name TEXT,
        changes JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. Import Sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS import_sessions (
        id SERIAL PRIMARY KEY,
        file_name TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        match_rule TEXT DEFAULT 'nationalCode',
        errors JSONB DEFAULT '[]'::jsonb,
        user_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 8. Widget Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS widget_settings (
        id SERIAL PRIMARY KEY,
        quote_text TEXT NOT NULL DEFAULT 'خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد',
        quote_author TEXT NOT NULL DEFAULT 'قائد شهید امت',
        quote_image TEXT NOT NULL DEFAULT '',
        quote_image_fit TEXT NOT NULL DEFAULT 'contain',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 9. Notification Rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        date_field TEXT NOT NULL,
        days_before INTEGER NOT NULL DEFAULT 5,
        priority TEXT NOT NULL DEFAULT 'normal',
        recurrence TEXT NOT NULL DEFAULT 'yearly',
        filters JSONB DEFAULT '{}'::jsonb,
        message_template TEXT NOT NULL DEFAULT '{{firstName}} {{lastName}}',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 10. Notifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER,
        soldier_id INTEGER,
        dedupe_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'unread',
        event_date TEXT,
        triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ
      );
    `);

    // 11. Service Units Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_units (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        code TEXT,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed Default Users if empty
    const userCountRes = await client.query("SELECT count(*)::int AS count FROM users");
    if (userCountRes.rows[0].count === 0) {
      const usersData = [
        ["admin", "admin123", "مدیر سیستم", "admin"],
        ["operator", "operator123", "کاربر ثبت اطلاعات", "operator"],
        ["viewer", "viewer123", "کاربر مشاهده", "viewer"],
      ];

      for (const [username, pass, fullName, role] of usersData) {
        const hash = await bcrypt.hash(pass, 10);
        await client.query(
          `INSERT INTO users (username, password_hash, full_name, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (username) DO NOTHING`,
          [username, hash, fullName, role]
        );
      }
      console.log("✓ اکانت‌های پیش‌فرض مدیر (admin/admin123) با موفقیت ساخته شدند.");
    } else {
      console.log("✓ اکانت‌های مدیریتی تأیید گردیدند.");
    }

    // Insert Default Quote
    await client.query(`
      INSERT INTO widget_settings (id, quote_text, quote_author)
      VALUES (1, 'خطرناک تر از ناو، سلاحی است که آن را به قعر دریا می فرستد', 'قائد شهید امت')
      ON CONFLICT DO NOTHING;
    `);

    console.log("\n=========================================================");
    console.log("🚀 آماده‌سازی کامل دیتابیس با موفقیت انجام شد!");
    console.log("=========================================================\n");
  } catch (err) {
    console.error("❌ خطا در مقداردهی اولیه‌ جدول‌ها:", err);
    process.exit(1);
  } finally {
    client.release();
    await targetPool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("خطای غیرمنتظره راه‌اندازی:", err);
  process.exit(1);
});
