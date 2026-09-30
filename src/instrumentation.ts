/**
 * Next.js instrumentation — یک‌بار هنگام بالا آمدن سرور اجرا می‌شود.
 * اینجا زمان‌بند پشتیبان‌گیری خودکار را راه می‌اندازیم.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startBackupScheduler } = await import("./lib/backup-scheduler");
    startBackupScheduler();
  } catch (e) {
    console.error("[SRMS] instrumentation failed", e);
  }
  // تولید اعلان‌ها بر اساس قوانین فعال: چند ثانیه پس از راه‌اندازی و سپس هر ۶ ساعت
  // (تا اعلان‌های تاریخ ازدواج، پایان خدمت، ماموریت و ... بدون نیاز به ویرایش دستی ساخته شوند)
  const scan = async () => {
    try {
      const { runNotificationEngine } = await import("./lib/notification-engine");
      const r = await runNotificationEngine();
      if (r.created > 0) console.log(`[SRMS] notification scan: ${r.created} new notification(s)`);
    } catch (e) {
      console.error("[SRMS] notification scan failed", e);
    }
  };
  setTimeout(scan, 20_000).unref?.();
  setInterval(scan, 6 * 60 * 60 * 1000).unref?.();

  // ثبت نتیجه‌ی آخرین بروزرسانی کامل (ZIP) که پیش از راه‌اندازی مجدد سرور انجام شده است
  try {
    const { finalizePendingSystemUpdate } = await import("./lib/system-package");
    await finalizePendingSystemUpdate();
  } catch (e) {
    console.error("[SRMS] finalize system update failed", e);
  }
}
