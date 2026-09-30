import "dotenv/config";
import pg from "pg";
import * as jalaali from "jalaali-js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function jToIso(jy, jm, jd) {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

function isoToJalali(iso) {
  const parts = iso.split("-");
  const [gy, gm, gd] = parts.map(p => parseInt(p, 10));
  const j = jalaali.toJalaali(gy, gm, gd);
  return j;
}

function addDaysJalali(jy, jm, jd, days) {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const d = new Date(gy, gm - 1, gd);
  d.setUTCDate(d.getUTCDate() + days);
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return j;
}

const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

const ABSENCE_REASONS = [
  "غیبت بدون مجوز", "غیبت با اطلاع قبلی", "عدم حضور در یگان",
  "غیبت به دلیل شخصی", "ترک پست", "غیبت موجه"
];
const LEAVE_REASONS = {
  "مرخصی استحقاقی": ["مرخصی عادی", "مرخصی خانوادگی", "مرخصی شخصی"],
  "مرخصی استعلاجی": ["بستری بیمارستان", "استراحت پزشکی", "عمل جراحی", "بیماری فصلی"],
  "مرخصی کمیسیون": ["کمیسیون پزشکی", "کمیسیون سلامت"],
  "مرخصی تشویقی": ["پاداش عملکرد", "تشویقی فرماندهی"],
};

async function main() {
  const c = await pool.connect();
  try {
    console.log("🔧 Fixing soldier data...\n");

    // 1. Get all soldiers
    const { rows: soldiers } = await c.query(
      `SELECT id, dispatch_date, service_end_date, first_name, last_name, service_unit, rank FROM soldiers WHERE deleted_at IS NULL ORDER BY id`
    );

    let fixedCount = 0;
    let attendanceInserted = 0;

    for (const soldier of soldiers) {
      // Generate a realistic Jalali dispatch date between 1400/01/01 and 1404/06/01
      const dispatchJy = rndInt(1400, 1404);
      const dispatchJm = rndInt(1, 12);
      const dispatchJd = rndInt(1, 28);

      // Convert to ISO for storage
      const dispatchIso = jToIso(dispatchJy, dispatchJm, dispatchJd);

      // End date = dispatch + 630 days
      const endJ = addDaysJalali(dispatchJy, dispatchJm, dispatchJd, 630);
      const endIso = jToIso(endJ.jy, endJ.jm, endJ.jd);

      // Update soldier dates
      await c.query(
        `UPDATE soldiers SET dispatch_date = $1, service_start_date = $1, service_end_date = $2 WHERE id = $3`,
        [dispatchIso, endIso, soldier.id]
      );
      fixedCount++;

      // 2. Generate attendance records for this soldier
      // Calculate total days in service period
      const startGreg = jalaali.toGregorian(dispatchJy, dispatchJm, dispatchJd);
      const endGreg = jalaali.toGregorian(endJ.jy, endJ.jm, endJ.jd);
      const startDate = new Date(startGreg.gy, startGreg.gm - 1, startGreg.gd);
      const endDate = new Date(endGreg.gy, endGreg.gm - 1, endGreg.gd);
      const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Generate random absences (5-25 days total)
      const absenceDays = rndInt(5, 25);
      const absenceDates = new Set();
      for (let i = 0; i < absenceDays; i++) {
        const randomDay = rndInt(0, totalDays - 1);
        const d = new Date(startDate);
        d.setUTCDate(d.getUTCDate() + randomDay);
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        absenceDates.add(`${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`);
      }

      // Generate random leaves (3-15 days total)
      const leaveTypes = Object.keys(LEAVE_REASONS);
      const totalLeaveDays = rndInt(3, 15);
      const leaveDates = new Set();
      const leaveInfo = {}; // date -> {type, reason}
      for (let i = 0; i < totalLeaveDays; i++) {
        const randomDay = rndInt(0, totalDays - 1);
        const d = new Date(startDate);
        d.setUTCDate(d.getUTCDate() + randomDay);
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const dateStr = `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
        if (!absenceDates.has(dateStr) && !leaveDates.has(dateStr)) {
          leaveDates.add(dateStr);
          const type = rnd(leaveTypes);
          const reason = rnd(LEAVE_REASONS[type]);
          leaveInfo[dateStr] = { type, reason };
        }
      }

      // Insert attendance records for absences
      for (const dateStr of absenceDates) {
        const reason = rnd(ABSENCE_REASONS);
        const docNum = `غ-${rndInt(1000, 9999)}`;
        await c.query(
          `INSERT INTO attendance_records (soldier_id, jalali_date, status, event_type, reason, document_number, recorded_by, created_at, updated_at)
           VALUES ($1, $2, 'غیبت', 'غیبت', $3, $4, 'سیستم', NOW(), NOW())`,
          [soldier.id, dateStr, reason, docNum]
        );
        attendanceInserted++;
      }

      // Insert attendance records for leaves
      for (const [dateStr, info] of Object.entries(leaveInfo)) {
        const docNum = `م-${rndInt(1000, 9999)}`;
        await c.query(
          `INSERT INTO attendance_records (soldier_id, jalali_date, status, event_type, reason, document_number, recorded_by, created_at, updated_at)
           VALUES ($1, $2, $3, $3, $4, $5, 'سیستم', NOW(), NOW())`,
          [soldier.id, dateStr, info.type, info.reason, docNum]
        );
        attendanceInserted++;
      }
    }

    console.log(`✅ Fixed ${fixedCount} soldiers`);
    console.log(`✅ Inserted ${attendanceInserted} attendance records`);
    console.log(`\n📊 Sample soldier data:`);

    // Show sample
    const { rows: sample } = await c.query(`
      SELECT s.id, s.first_name, s.last_name, s.dispatch_date, s.service_end_date,
             COUNT(a.id) as attendance_count,
             SUM(CASE WHEN a.status = 'غیبت' THEN 1 ELSE 0 END) as absence_count,
             SUM(CASE WHEN a.status LIKE 'مرخصی%' THEN 1 ELSE 0 END) as leave_count
      FROM soldiers s
      LEFT JOIN attendance_records a ON s.id = a.soldier_id
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
      ORDER BY s.id
      LIMIT 5
    `);

    for (const s of sample) {
      const startJ = isoToJalali(s.dispatch_date);
      const endJ = isoToJalali(s.service_end_date);
      console.log(`  ${s.first_name} ${s.last_name}: اعزام ${startJ.jy}/${startJ.jm}/${startJ.jd} → پایان ${endJ.jy}/${endJ.jm}/${endJ.jd} | غیبت: ${s.absence_count} | مرخصی: ${s.leave_count}`);
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
