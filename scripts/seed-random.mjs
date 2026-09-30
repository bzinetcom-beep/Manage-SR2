import "dotenv/config";
import pg from "pg";
import * as jalaali from "jalaali-js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIRST = ["علی","محمد","رضا","حسین","مهدی","امیر","سعید","حسن","مجتبی","احمد","جواد","یاسر","میلاد","پویا","کاوه","بهزاد","نیما","سجاد","وحید","کامران","فرهاد","بابک","آرش","مسعود","هادی","اکبر","صادق","ابوالفضل","محسن","ایمان"];
const LAST = ["محمدی","کریمی","رضایی","احمدی","موسوی","حسینی","نوری","صادقی","اکبری","جعفری","قاسمی","کاظمی","رحیمی","یوسفی","نجفی","شریفی","عباسی","بهرامی","سلطانی","فتحی","مرادی","کریمی‌نژاد","زارعی","حیدری","غلامی","رستمی","اسدی","صالحی","طاهری","فلاحی"];
const FATHER = ["حسن","علی","محمد","رضا","اکبر","حسین","قاسم","محمود","عباس","کریم","اصغر","جعفر","مصطفی","ناصر","یدالله"];
const CITIES = ["تهران","اصفهان","شیراز","مشهد","تبریز","کرج","اهواز","قم","کرمانشاه","رشت","یزد","اراک","همدان","زنجان","ساری"];
const UNITS = ["سرمایه انسانی","عملیات","فرهنگی"];
const EDU = ["زیر دیپلم","دیپلم","فوق دیپلم","کارشناسی","کارشناسی ارشد","دکتری"];
const MAJORS = ["مکانیک","برق","کامپیوتر","حسابداری","مدیریت","عمران","صنایع","علوم انسانی","تربیت بدنی","الهیات"];
const MARITAL = ["مجرد","متاهل"];
const RANKS = ["سرباز","سرباز یکم","سرباز دوم","گروهبان سوم"];
const MEMBERSHIP = ["وظیفه","پیمانی"];
const BLOOD = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const ADJ_TYPES = [
  ["کسری خدمت","decrease"],["کمیسیون پزشکی","decrease"],["کسری ایثارگری","decrease"],
  ["اضافه خدمت","increase"],["غیبت","increase"],["فرار از خدمت","increase"],
];

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
function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
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

    for (let i = 0; i < 50; i++) {
      row++;
      const dispatchIso = jToIso(rnd([1401, 1402, 1403]), rndInt(1, 12), rndInt(1, 28));
      const birthIso = jToIso(rndInt(1379, 1384), rndInt(1, 12), rndInt(1, 28));
      const baseEnd = addMonths(dispatchIso, 21);

      const { rows: ins } = await c.query(
        `INSERT INTO soldiers
          (row_number, personnel_code, national_code, first_name, last_name, father_name,
           birth_date, city, marital_status, dispatch_date, service_start_date, service_unit,
           education_level, education_major, rank, membership_type, duty_type, blood_type,
           service_end_date, service_location, recruitment_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id`,
        [
          row,
          String(20000 + row),
          randNationalCode(),
          rnd(FIRST),
          rnd(LAST),
          rnd(FATHER),
          birthIso,
          rnd(CITIES),
          rnd(MARITAL),
          dispatchIso,
          dispatchIso,
          rnd(UNITS),
          rnd(EDU),
          rnd(MAJORS),
          rnd(RANKS),
          rnd(MEMBERSHIP),
          "سرباز وظیفه",
          rnd(BLOOD),
          baseEnd,
          rnd(CITIES),
          "عادی",
        ],
      );
      const soldierId = ins[0].id;

      // ~35% get one or two service adjustments
      if (Math.random() < 0.35) {
        const nAdj = rndInt(1, 2);
        let net = 0;
        for (let k = 0; k < nAdj; k++) {
          const [type, dir] = rnd(ADJ_TYPES);
          const days = rndInt(5, 60);
          net += dir === "decrease" ? -days : days;
          await c.query(
            `INSERT INTO service_adjustments (soldier_id, type, effect_direction, days, effective_date, title, legal_document_number)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [soldierId, type, dir, days, dispatchIso, type, `م-${rndInt(1000, 9999)}`],
          );
        }
        const newEnd = addDays(baseEnd, net);
        await c.query(`UPDATE soldiers SET service_end_date=$1 WHERE id=$2`, [newEnd, soldierId]);
      }

      // ~20% get a transfer between units
      if (Math.random() < 0.2) {
        const from = rnd(UNITS);
        let to = rnd(UNITS);
        while (to === from) to = rnd(UNITS);
        await c.query(
          `INSERT INTO transfers (soldier_id, transfer_date, from_service_unit, to_service_unit, transfer_reason, status, document_number, issuer_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [soldierId, dispatchIso, from, to, "نیاز عملیاتی", rnd(["پیش‌نویس", "تایید شده"]), `انت-${rndInt(1000, 9999)}`, rnd(FIRST) + " " + rnd(LAST)],
        );
      }
    }
    console.log("✓ 50 random soldiers seeded (units: سرمایه انسانی / عملیات / فرهنگی)");
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
