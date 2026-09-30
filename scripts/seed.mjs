import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function addMonths(iso, months) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}

async function main() {
  const c = await pool.connect();
  try {
    // Users
    const usersData = [
      ["admin", "admin123", "مدیر سیستم", "admin"],
      ["operator", "operator123", "کاربر ثبت اطلاعات", "operator"],
      ["viewer", "viewer123", "کاربر مشاهده", "viewer"],
    ];
    for (const [username, pass, fullName, role] of usersData) {
      const hash = await bcrypt.hash(pass, 10);
      await c.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, full_name=EXCLUDED.full_name, role=EXCLUDED.role`,
        [username, hash, fullName, role],
      );
    }
    console.log("✓ users seeded (admin/admin123, operator/operator123, viewer/viewer123)");

    // Custom field example
    await c.query(
      `INSERT INTO custom_fields (field_key, label, field_type, section, sort_order)
       VALUES ('unitCode','کد یگان','text','خدمتی',1)
       ON CONFLICT (field_key) DO NOTHING`,
    );

    // Sample soldiers
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM soldiers`);
    if (rows[0].n === 0) {
      const samples = [
        ["1001", "0012345678", "علی", "محمدی", "حسن", "1382-03-12", "تهران", "متاهل", "1403-01-15", "یگان یکم", "دیپلم", "F-2001", "سرباز"],
        ["1002", "0023456789", "رضا", "کریمی", "احمد", "1381-07-20", "اصفهان", "مجرد", "1403-02-01", "یگان دوم", "کارشناسی", "F-2002", "سرباز"],
        ["1003", "0034567890", "مهدی", "رضایی", "قاسم", "1383-11-05", "شیراز", "مجرد", "1402-11-10", "یگان یکم", "فوق دیپلم", "F-2003", "سرباز"],
        ["1004", "0045678901", "حسین", "احمدی", "علی", "1382-01-25", "تهران", "متاهل", "1403-03-20", "یگان سوم", "کارشناسی ارشد", "F-2004", "سرباز"],
        ["1005", "0056789012", "سعید", "موسوی", "محمود", "1381-05-18", "مشهد", "مجرد", "1402-09-01", "یگان دوم", "دیپلم", "F-2005", "سرباز"],
      ];
      let row = 1;
      for (const s of samples) {
        const dispatch = s[8];
        const end = addMonths(dispatch, 21);
        await c.query(
          `INSERT INTO soldiers (row_number, personnel_code, national_code, first_name, last_name, father_name, birth_date, city, marital_status, dispatch_date, service_unit, education_level, file_number, duty_type, service_end_date, service_start_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [row++, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], dispatch, s[9], s[10], s[11], s[12], end, dispatch],
        );
      }
      console.log("✓ sample soldiers seeded");
    } else {
      console.log("• soldiers already present, skipping samples");
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
