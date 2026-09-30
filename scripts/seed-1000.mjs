import "dotenv/config";
import pg from "pg";
import * as jalaali from "jalaali-js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Extensive Iranian Name Dictionaries
const FIRST_NAMES = [
  "علی", "محمد", "حسین", "رضا", "مهدی", "حسن", "امیر", "سعید", "احمد", "مصطفی",
  "عباس", "مرتضی", "محسن", "مجید", "صادق", "حامد", "سینا", "دانیال", "پارسا", "پیمان",
  "امیرحسین", "محمدرضا", "علیرضا", "ابوالفضل", "محمدمهدی", "امیررضا", "کیوان", "رامین",
  "پوریا", "ساسان", "آرش", "آرمان", "فرزاد", "سامان", "امید", "یاسر", "جواد", "شایان",
  "مسعود", "نوید", "احسان", "شهاب", "مهران", "حمید", "کامران", "شهرام", "بهنام", "نیما"
];

const LAST_NAMES = [
  "محمدی", "حسینی", "احمدی", "رضایی", "موسوی", "کریمی", "قاسمی", "نوری", "هاشمی", "رحیمی",
  "جعفری", "صالحی", "عباسی", "باقری", "رستمی", "اکبری", "زارعی", "امیری", "سلیمانی", "نجفی",
  "ابراهیمی", "میرزایی", "حیدری", "کاظمی", "مردانی", "دهقانی", "فرهادی", "طاهری", "خسروی", "شریفی",
  "یزدانی", "مظفری", "خادمی", "عسگری", "شفیعی", "منصوری", "افشار", "پاشایی", "صادقی", "بیات"
];

const FATHER_NAMES = [
  "حسن", "علی", "محمد", "حسین", "رضا", "محمود", "احمد", "قاسم", "عباس", "جعفر",
  "اسماعیل", "ابراهیم", "اکبر", "اصغر", "مهدی", "جواد", "غلامحسین", "مرتضی", "مصطفی"
];

const PROVINCES_CITIES = [
  { province: "تهران", city: "تهران", phonePrefix: "0912" },
  { province: "اصفهان", city: "اصفهان", phonePrefix: "0913" },
  { province: "فارس", city: "شیراز", phonePrefix: "0917" },
  { province: "خراسان رضوی", city: "مشهد", phonePrefix: "0915" },
  { province: "آذربایجان شرقی", city: "تبریز", phonePrefix: "0914" },
  { province: "خوزستان", city: "اهواز", phonePrefix: "0916" },
  { province: "البرز", city: "کرج", phonePrefix: "0935" },
  { province: "گیلان", city: "رشت", phonePrefix: "0911" },
  { province: "قم", city: "قم", phonePrefix: "0919" },
  { province: "کرمانشاه", city: "کرمانشاه", phonePrefix: "0918" },
  { province: "کرمان", city: "کرمان", phonePrefix: "0902" },
  { province: "همدان", city: "همدان", phonePrefix: "0918" },
  { province: "یزد", city: "یزد", phonePrefix: "0913" },
  { province: "مازندران", city: "ساری", phonePrefix: "0911" },
  { province: "مرکزی", city: "اراک", phonePrefix: "0918" },
  { province: "هرمزگان", city: "بندرعباس", phonePrefix: "0938" }
];

const EDUCATIONS = [
  { level: "زیر دیپلم", rank: "سرباز", isHigher: false },
  { level: "دیپلم", rank: "سرکارور", isHigher: false },
  { level: "فوق دیپلم", rank: "گروهبان دوم", isHigher: false },
  { level: "کارشناسی", rank: "استوار دوم", isHigher: true },
  { level: "کارشناسی ارشد", rank: "ستوان سوم", isHigher: true },
  { level: "دکتری", rank: "ستوان یکم", isHigher: true }
];

const UNITS = [
  "یگان یکم پشتیبانی", "تیپ ۳۷ تکاور", "گروه ۴۴ توپخانه", "گردان ۵۰۵ پیاده",
  "دژبان مرکز", "فاوا و فناوری اطلاعات", "مرکز آموزش شهدای وظیفه",
  "بهداری یگان", "یگان قرارگاه", "پدافند هوایی", "گروه مهندسی رزمی"
];

const DUTY_TYPES = ["سرباز عادی", "پیام‌آور", "امریه", "کسر خدمت دار"];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

/** Generates a valid Iranian National ID based on standard control digit algorithm */
function generateValidNationalCode() {
  while (true) {
    const code = Array.from({ length: 9 }, () => randomInt(0, 9));
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += code[i] * (10 - i);
    }
    const rem = sum % 11;
    const check = rem < 2 ? rem : 11 - rem;
    code.push(check);
    const result = code.join("");
    if (!/^(\d)\1{9}$/.test(result)) return result;
  }
}

function jalaliToStr(jy, jm, jd) {
  return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
}

function addDaysJalali(jy, jm, jd, days) {
  const g = jalaali.toGregorian(jy, jm, jd);
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
  d.setUTCDate(d.getUTCDate() + days);
  const resJ = jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { jy: resJ.jy, jm: resJ.jm, jd: resJ.jd, str: jalaliToStr(resJ.jy, resJ.jm, resJ.jd) };
}

function todayJalali() {
  const now = new Date();
  const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { jy: j.jy, jm: j.jm, jd: j.jd, str: jalaliToStr(j.jy, j.jm, j.jd) };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("🚀 Starting generation of 1000 Persian soldier records with strictly 630 days service duration...");

    // Reset rules to ensure exact camelCase dateField mapping
    await client.query("DELETE FROM notification_rules");

    // 1. Ensure essential Notification Rules exist with camelCase dateField properties
    const defaultRules = [
      {
        name: "سالگرد ازدواج سربازان",
        description: "هشدار سالگرد ازدواج ۱۵ روز قبل جهت اعطای مرخصی یا تشویقی",
        dateField: "marriageDate",
        daysBefore: 15,
        priority: "high",
        recurrence: "yearly",
        filters: JSON.stringify({ maritalStatus: "متاهل" }),
        messageTemplate: "سالگرد ازدواج سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} می‌باشد. ({{daysLeft}} روز باقی مانده)",
      },
      {
        name: "هشدار پایان خدمت",
        description: "هشدار ۳۰ روز قبل از سررسید پایان خدمت وظیفه عمومی",
        dateField: "serviceEndDate",
        daysBefore: 30,
        priority: "urgent",
        recurrence: "once",
        filters: JSON.stringify({ serviceStatus: "در حال خدمت" }),
        messageTemplate: "خدمت سرباز {{firstName}} {{lastName}} (یگان {{serviceUnit}}) در تاریخ {{eventDate}} پایان می‌یابد. ({{daysLeft}} روز باقی مانده)",
      },
      {
        name: "موعد تسویه‌حساب یگانی",
        description: "هشدار تسویه‌حساب اداری ۷ روز قبل از پایان خدمت",
        dateField: "serviceEndDate",
        daysBefore: 7,
        priority: "urgent",
        recurrence: "once",
        filters: JSON.stringify({ serviceStatus: "در حال خدمت" }),
        messageTemplate: "برگه تسویه‌حساب سرباز {{firstName}} {{lastName}} صادر گردد. موعد پایان: {{eventDate}}.",
      },
      {
        name: "سالگرد اعزام به خدمت",
        description: "هشدار سالگرد شروع خدمت وظیفه",
        dateField: "dispatchDate",
        daysBefore: 10,
        priority: "normal",
        recurrence: "yearly",
        filters: JSON.stringify({ serviceStatus: "در حال خدمت" }),
        messageTemplate: "یک سال از اعزام سرباز {{firstName}} {{lastName}} در تاریخ {{eventDate}} گذشت.",
      },
    ];

    for (const r of defaultRules) {
      await client.query(
        `INSERT INTO notification_rules (name, description, date_field, days_before, priority, recurrence, filters, message_template, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, true)`,
        [r.name, r.description, r.dateField, r.daysBefore, r.priority, r.recurrence, r.filters, r.messageTemplate]
      );
    }
    console.log("✓ Default notification rules reset/created.");

    // Clear existing soldiers & notifications for a pristine test setup
    await client.query("TRUNCATE TABLE notifications, service_adjustments, transfers CASCADE");
    await client.query("DELETE FROM soldiers");
    console.log("✓ Reset existing soldier and notification data.");

    const today = todayJalali();
    console.log(`📅 Current Reference Date in Jalali: ${today.str} (سال ۱۴۰۵)`);

    const batchSize = 100;
    let totalInserted = 0;

    for (let batch = 0; batch < 10; batch++) {
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (let i = 0; i < batchSize; i++) {
        totalInserted++;
        const rowNum = totalInserted;
        const personnelCode = String(100000 + rowNum);
        const nationalCode = generateValidNationalCode();
        const firstName = randomItem(FIRST_NAMES);
        const lastName = randomItem(LAST_NAMES);
        const fatherName = randomItem(FATHER_NAMES);

        const edu = randomItem(EDUCATIONS);
        const educationLevel = edu.level;
        const rank = edu.rank;
        const serviceUnit = randomItem(UNITS);
        const dutyType = randomItem(DUTY_TYPES);

        // Birth Year logic
        let birthYear;
        if (edu.isHigher) {
          birthYear = randomInt(1378, 1382);
        } else {
          birthYear = randomInt(1383, 1387);
        }

        const birthJ = {
          jy: birthYear,
          jm: randomInt(1, 12),
          jd: randomInt(1, 28)
        };
        const birthDate = jalaliToStr(birthJ.jy, birthJ.jm, birthJ.jd);

        const place = randomItem(PROVINCES_CITIES);
        const city = place.city;
        const birthPlace = place.province;
        const mobilePhone = `${place.phonePrefix}${randomInt(1000007, 9999999)}`;

        // Dispatch Date selection so service covers active / upcoming service periods
        const minDispatchYear = Math.max(1403, birthYear + 18);
        const dispatchYear = Math.min(1405, randomInt(minDispatchYear, 1405));
        const dispatchMonth = dispatchYear === 1405 ? randomInt(1, 4) : randomInt(1, 12);
        const dispatchJ = {
          jy: dispatchYear,
          jm: dispatchMonth,
          jd: randomInt(1, 28)
        };
        const dispatchDate = jalaliToStr(dispatchJ.jy, dispatchJ.jm, dispatchJ.jd);

        // MARITAL STATUS & MARRIAGE DATE LOGIC
        const isMarried = Math.random() < 0.35;
        const maritalStatus = isMarried ? "متاهل" : "مجرد";
        let marriageDate = null;
        let childrenCount = 0;

        if (isMarried) {
          childrenCount = randomInt(0, 2);
          if (Math.random() < 0.20) {
            const targetDaysLeft = randomInt(1, 14);
            const anniversaryEvent = addDaysJalali(today.jy, today.jm, today.jd, targetDaysLeft);
            const mYear = Math.min(1404, Math.max(birthYear + 18, today.jy - randomInt(1, 4)));
            marriageDate = jalaliToStr(mYear, anniversaryEvent.jm, anniversaryEvent.jd);
          } else {
            const minMYear = birthYear + 18;
            const mYear = Math.min(1405, randomInt(minMYear, 1405));
            marriageDate = jalaliToStr(mYear, randomInt(1, 12), randomInt(1, 28));
          }
        }

        // STRICT 630 DAYS SERVICE DURATION REQUIREMENT:
        // Service end date MUST BE strictly dispatchDate + 630 days!
        const serviceEndDateObj = addDaysJalali(dispatchJ.jy, dispatchJ.jm, dispatchJ.jd, 630);
        const serviceEndDate = serviceEndDateObj.str;

        valueRows.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );

        params.push(
          rowNum,
          personnelCode,
          nationalCode,
          firstName,
          lastName,
          fatherName,
          birthDate,
          birthPlace,
          city,
          mobilePhone,
          maritalStatus,
          marriageDate,
          childrenCount,
          educationLevel,
          rank,
          dispatchDate,
          dispatchDate, // service_start_date
          serviceEndDate,
          serviceUnit,
          dutyType,
          JSON.stringify({ generatedBy: "seed-1000-630days", batch: batch + 1, province: place.province, totalServiceDays: 630 })
        );
      }

      const queryText = `
        INSERT INTO soldiers (
          row_number, personnel_code, national_code, first_name, last_name, father_name,
          birth_date, birth_place, city, mobile_phone, marital_status, marriage_date,
          children_count, education_level, rank, dispatch_date, service_start_date,
          service_end_date, service_unit, duty_type, metadata
        ) VALUES ${valueRows.join(", ")}
      `;

      await client.query(queryText, params);
      console.log(`✓ Inserted batch ${batch + 1}/10 (${totalInserted}/1000 soldiers)`);
    }

    console.log("⚡ Executing Real-Time Notification Engine on 630-days dataset...");
    const { runNotificationEngine } = await import("../src/lib/notification-engine.ts");
    const result = await runNotificationEngine();

    console.log(`✅ SUCCESS! Seeded 1000 records with EXACT 630 days service duration.`);
    console.log(`🔔 Notifications Generated: ${result.created} active alerts!`);

  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
