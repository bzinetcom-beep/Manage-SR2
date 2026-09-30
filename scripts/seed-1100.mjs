import "dotenv/config";
import pg from "pg";
import * as jalaali from "jalaali-js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIRST = [
  "علی", "محمد", "رضا", "حسین", "مهدی", "امیر", "سعید", "حسن", "مجتبی", "احمد",
  "جواد", "یاسر", "میلاد", "پویا", "کاوه", "بهزاد", "نیما", "سجاد", "وحید", "کامران",
  "فرهاد", "بابک", "آرش", "مسعود", "هادی", "اکبر", "صادق", "ابوالفضل", "محسن", "ایمان",
  "عباس", "مجید", "حمید", "کریم", "منوچهر", "فریدون", "سیامک", "بهرام", "نادر", "شهروز",
  "سامان", "پیام", "امید", "دانیال", "شایان", "سینا", "پارسا", "آرمین", "آرمان", "کیان",
];
const LAST = [
  "محمدی", "کریمی", "رضایی", "احمدی", "موسوی", "حسینی", "نوری", "صادقی", "اکبری", "جعفری",
  "قاسمی", "کاظمی", "رحیمی", "یوسفی", "نجفی", "شریفی", "عباسی", "بهرامی", "سلطانی", "فتحی",
  "مرادی", "کریمی‌نژاد", "زارعی", "حیدری", "غلامی", "رستمی", "اسدی", "صالحی", "طاهری", "فلاحی",
  "مطلبی", "خداکرمی", "باقری", "حسینی‌زاده", "امینی", "فرهادی", "محمودی", "زاهدی", "گلزاری", "صمدی",
];
const FATHER = [
  "حسن", "علی", "محمد", "رضا", "اکبر", "حسین", "قاسم", "محمود", "عباس", "کریم",
  "اصغر", "جعفر", "مصطفی", "ناصر", "یدالله", "حسینعلی", "محمدحسین", "حسینرضا", "محمدمهدی",
];
const CITIES = [
  "تهران", "اصفهان", "شیراز", "مشهد", "تبریز", "کرج", "اهواز", "قم", "کرمانشاه", "رشت",
  "یزد", "اراک", "همدان", "زنجان", "ساری", "کرمان", "اردبیل", "گرگان", "بوشهر", "بندرعباس",
  "سنندج", "خرم‌آباد", "ایلام", "شهرکرد", "بجنورد", "بیرجند", "زاهدان", "یاسوج", "سمنان", "قزوین",
];
const UNITS = ["سرمایه انسانی", "عملیات", "فرهنگی"];
const EDU = ["زیر دیپلم", "دیپلم", "فوق دیپلم", "کارشناسی", "کارشناسی ارشد", "دکتری"];
const MAJORS = ["مکانیک", "برق", "کامپیوتر", "حسابداری", "مدیریت", "عمران", "صنایع", "علوم انسانی", "تربیت بدنی", "الهیات", "ریاضی", "فیزیک", "شیمی", "ادبیات", "حقوق"];
const MARITAL = ["مجرد", "متاهل"];
const RANKS = ["سرباز", "سرباز یکم", "سرباز دوم", "گروهبان سوم", "گروهبان دوم", "گروهبان یکم", "استوار دوم", "استوار یکم", "ستوان سوم", "ستوان دوم"];
const MEMBERSHIP = ["وظیفه", "پیمانی", "رسمی"];
const DUTY_TYPES = ["سرباز وظیفه", "کارمند وظیفه", "پیمانی", "رسمی"];
const RECRUITMENT = ["عادی", "قطع خدمت", "سرباز جایگزین", "بهداشت و درمان", "امنیتی"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const PHYSICAL = ["سالم", "ناتوان جزئی", "ناتوان کامل", "معاف از رزم", "بستری"];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randNationalCode() {
  let s = "";
  for (let i = 0; i < 10; i++) s += rndInt(0, 9);
  return s;
}

function addMonths(iso, months) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}
function jToIso(jy, jm, jd) {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

async function main() {
  const c = await pool.connect();
  try {
    const { rows: cnt } = await c.query(`SELECT coalesce(max(row_number),0)::int AS n FROM soldiers`);
    let row = cnt[0].n;

    const BATCH = 50;
    const TOTAL = 1100;
    const batches = Math.ceil(TOTAL / BATCH);

    for (let b = 0; b < batches; b++) {
      const count = Math.min(BATCH, TOTAL - b * BATCH);
      const values = [];
      let paramIdx = 1;
      const insertParts = [];

      for (let i = 0; i < count; i++) {
        row++;
        const dispatchIso = jToIso(rndInt(1400, 1404), rndInt(1, 12), rndInt(1, 28));
        const birthIso = jToIso(rndInt(1375, 1387), rndInt(1, 12), rndInt(1, 28));
        const baseEnd = addMonths(dispatchIso, rndInt(18, 24));
        const weight = rndInt(55, 105);
        const height = rndInt(155, 195);
        const phonePrefix = "09" + rndInt(10, 39);
        const phone = phonePrefix + String(rndInt(1000000, 9999999));

        // 32 columns matching values exactly
        insertParts.push(
          `($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},` +
          `$${paramIdx+6},$${paramIdx+7},$${paramIdx+8},$${paramIdx+9},$${paramIdx+10},$${paramIdx+11},` +
          `$${paramIdx+12},$${paramIdx+13},$${paramIdx+14},$${paramIdx+15},$${paramIdx+16},$${paramIdx+17},` +
          `$${paramIdx+18},$${paramIdx+19},$${paramIdx+20},$${paramIdx+21},$${paramIdx+22},$${paramIdx+23},` +
          `$${paramIdx+24},$${paramIdx+25},$${paramIdx+26},$${paramIdx+27},$${paramIdx+28},$${paramIdx+29},` +
          `$${paramIdx+30},$${paramIdx+31})`
        );

        values.push(
          row,                                                    // 1  row_number
          String(20000 + row),                                    // 2  personnel_code
          randNationalCode(),                                     // 3  national_code
          rnd(FIRST),                                             // 4  first_name
          rnd(LAST),                                              // 5  last_name
          rnd(FATHER),                                            // 6  father_name
          birthIso,                                               // 7  birth_date
          rnd(CITIES),                                            // 8  city
          rnd(MARITAL),                                           // 9  marital_status
          dispatchIso,                                            // 10 dispatch_date
          dispatchIso,                                            // 11 service_start_date
          rnd(UNITS),                                             // 12 service_unit
          rnd(EDU),                                               // 13 education_level
          rnd(MAJORS),                                            // 14 education_major
          rnd(RANKS),                                             // 15 rank
          rnd(MEMBERSHIP),                                        // 16 membership_type
          rnd(DUTY_TYPES),                                        // 17 duty_type
          rnd(BLOOD),                                             // 18 blood_type
          baseEnd,                                                // 19 service_end_date
          rnd(CITIES),                                            // 20 service_location
          rnd(RECRUITMENT),                                       // 21 recruitment_type
          phone,                                                  // 22 phone_number
          String(rndInt(10000, 99999)),                           // 23 postal_code
          String(weight),                                         // 24 weight
          String(height),                                         // 25 height
          rnd(PHYSICAL),                                          // 26 physical_status
          rnd(CITIES),                                            // 27 birth_place
          String(rndInt(10000, 99999)),                           // 28 file_number
          String(rndInt(10000, 99999)),                           // 29 archive_number
          dispatchIso,                                            // 30 document_date
          dispatchIso,                                            // 31 dispatch_issue_date
          "یگان اعزام‌کننده",                                      // 32 dispatch_office
        );
        paramIdx += 32;
      }

      const insertSQL = `
        INSERT INTO soldiers
          (row_number, personnel_code, national_code, first_name, last_name, father_name,
           birth_date, city, marital_status, dispatch_date, service_start_date, service_unit,
           education_level, education_major, rank, membership_type, duty_type, blood_type,
           service_end_date, service_location, recruitment_type, phone_number, postal_code,
           weight, height, physical_status, birth_place, file_number,
           archive_number, document_date, dispatch_issue_date, dispatch_office)
        VALUES ${insertParts.join(",\n")}
      `;

      await c.query(insertSQL, values);
      console.log(`  ✓ Batch ${b + 1}/${batches}: ${count} soldiers created (total: ${row})`);
    }

    console.log(`\n🎉 ${TOTAL} random soldiers seeded successfully!`);
    console.log(`   Total soldiers in DB: ${row}`);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
