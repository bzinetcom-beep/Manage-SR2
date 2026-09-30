/**
 * زمان‌بند پشتیبان‌گیری خودکار
 * -----------------------------------------------------------------------------
 * با شروع سرور (instrumentation) فعال می‌شود و هر ۱۰ دقیقه بررسی می‌کند که
 * آیا طبق تنظیمات کاربر (روزانه/هفتگی/ساعتی) زمان تهیه‌ی نسخه پشتیبان رسیده است.
 * هر خطا فقط لاگ می‌شود تا هرگز اجرای سامانه را مختل نکند.
 */

import { runAutoBackupIfDue } from "./backup";

const TICK_MS = 10 * 60 * 1000;

const globalRef = globalThis as unknown as { __srmsBackupScheduler?: boolean };

export function startBackupScheduler(): void {
  if (globalRef.__srmsBackupScheduler) return;
  globalRef.__srmsBackupScheduler = true;

  const tick = async () => {
    try {
      const res = await runAutoBackupIfDue();
      if (res.created) console.log(`[SRMS] auto backup created: ${res.fileName}`);
    } catch (e) {
      console.error("[SRMS] auto backup tick failed", e);
    }
  };

  setTimeout(tick, 15 * 1000).unref?.();
  const interval = setInterval(tick, TICK_MS);
  interval.unref?.();
  console.log("[SRMS] backup scheduler started (every 10 min check)");
}
