import type { PoolClient } from "pg";
import { toJalaliIsoString, roundToMonthStart, computeServiceEndDate } from "./service-date";
import { rankForEducation } from "./military-rank";
import { NOTIFICATION_RULE_PRESETS } from "./notification-presets";

/**
 * مایگریشن‌های داده — هر مایگریشن فقط یک‌بار اجرا می‌شود (شناسه‌ی آن در system_meta ثبت می‌گردد)
 * و کاملاً idempotent است؛ یعنی اجرای دوباره‌ی آن آسیبی نمی‌زند.
 */
const META_KEY = "data_migrations";

async function readApplied(client: PoolClient): Promise<string[]> {
  const r = await client.query(`SELECT value FROM system_meta WHERE key = $1`, [META_KEY]);
  const v = r.rows[0]?.value;
  return Array.isArray(v) ? (v as string[]) : [];
}

async function markApplied(client: PoolClient, applied: string[]) {
  await client.query(
    `INSERT INTO system_meta (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [META_KEY, JSON.stringify(applied)],
  );
}

/**
 * ۱) تاریخ اعزام همه‌ی سربازان «رُند» (اول ماه) و به شمسی نرمال می‌شود.
 * ۲) تاریخ پایان خدمت = اعزام + ۲۱ ماه (+ کسری/اضافه خدمت ثبت‌شده).
 * ۳) درجه‌ی نظامی هر سرباز بر اساس مدرک تحصیلی تعیین می‌شود.
 */
export async function migrateSoldierDatesAndRanks(client: PoolClient): Promise<number> {
  const adj = await client.query(
    `SELECT soldier_id, COALESCE(SUM(CASE WHEN effect_direction = 'decrease' THEN -days ELSE days END), 0)::int AS net
       FROM service_adjustments GROUP BY soldier_id`,
  );
  const netBySoldier = new Map<number, number>(adj.rows.map((r) => [Number(r.soldier_id), Number(r.net)]));

  const { rows } = await client.query(
    `SELECT id, dispatch_date, service_start_date, education_level FROM soldiers ORDER BY id`,
  );

  let changed = 0;
  for (const s of rows) {
    const dispatch = roundToMonthStart(s.dispatch_date || s.service_start_date);
    const net = netBySoldier.get(Number(s.id)) ?? 0;
    const end = dispatch
      ? computeServiceEndDate(dispatch, net === 0 ? [] : [{ effectDirection: net < 0 ? "decrease" : "increase", days: Math.abs(net) }])
      : null;
    const rank = rankForEducation(s.education_level);

    await client.query(
      `UPDATE soldiers
          SET dispatch_date      = COALESCE($2, dispatch_date),
              service_start_date = COALESCE($2, service_start_date),
              service_end_date   = COALESCE($3, service_end_date),
              rank               = $4,
              updated_at         = NOW()
        WHERE id = $1`,
      [s.id, dispatch, end, rank],
    );
    changed++;
  }
  return changed;
}

/** نوع انتقال‌های قدیمی («انتقال») به «انتقال دائم» تبدیل می‌شوند. */
export async function migrateTransferTypes(client: PoolClient) {
  await client.query(
    `UPDATE transfers SET transfer_type = 'انتقال دائم'
      WHERE transfer_type IS NULL OR transfer_type IN ('', 'انتقال', 'دائمی', 'دائم')`,
  );
  // تاریخ ماموریت‌ها به شمسی ISO نرمال شود (در صورت ثبت به‌صورت میلادی)
  const { rows } = await client.query(
    `SELECT id, mission_start_date, mission_end_date FROM transfers
      WHERE mission_start_date IS NOT NULL OR mission_end_date IS NOT NULL`,
  );
  for (const r of rows) {
    await client.query(`UPDATE transfers SET mission_start_date = $2, mission_end_date = $3 WHERE id = $1`, [
      r.id,
      toJalaliIsoString(r.mission_start_date),
      toJalaliIsoString(r.mission_end_date),
    ]);
  }
}

/** ساخت قوانین اعلان پیشنهادی (فقط قوانینی که هم‌نام آن‌ها وجود ندارد). */
export async function seedNotificationPresets(client: PoolClient): Promise<number> {
  let created = 0;
  for (const p of NOTIFICATION_RULE_PRESETS) {
    const exists = await client.query(`SELECT 1 FROM notification_rules WHERE name = $1 LIMIT 1`, [p.name]);
    if (exists.rowCount) continue;
    await client.query(
      `INSERT INTO notification_rules
         (name, description, date_field, days_before, priority, recurrence, filters, message_template, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, true)`,
      [p.name, p.description, p.dateField, p.daysBefore, p.priority, p.recurrence, JSON.stringify(p.filters), p.messageTemplate],
    );
    created++;
  }
  return created;
}

export async function runDataMigrations(client: PoolClient) {
  const applied = await readApplied(client);
  const steps: { id: string; run: () => Promise<unknown> }[] = [
    { id: "2026-soldier-dates-and-ranks", run: () => migrateSoldierDatesAndRanks(client) },
    { id: "2026-transfer-types", run: () => migrateTransferTypes(client) },
    { id: "2026-notification-presets", run: () => seedNotificationPresets(client) },
  ];
  for (const step of steps) {
    if (applied.includes(step.id)) continue;
    try {
      await client.query("BEGIN");
      await step.run();
      applied.push(step.id);
      await markApplied(client, applied);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[SRMS] data migration ${step.id} failed`, e);
    }
  }
}
