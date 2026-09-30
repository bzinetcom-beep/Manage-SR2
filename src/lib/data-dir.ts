import fs from "node:fs";
import path from "node:path";

/**
 * پوشه‌ی داده‌های ماندگار برنامه (تصاویر ویجت‌ها، فایل‌های بروزرسانی و ...).
 * این پوشه هنگام بروزرسانی سامانه هرگز بازنویسی یا حذف نمی‌شود، بنابراین
 * فایل‌های آپلود شده با بستن و اجرای دوباره‌ی برنامه باقی می‌مانند.
 *
 * مسیر پیش‌فرض:  <ریشه پروژه>/data      (قابل تغییر با متغیر SRMS_DATA_DIR)
 */
export function getDataDir(): string {
  const dir = process.env.SRMS_DATA_DIR
    ? path.resolve(process.env.SRMS_DATA_DIR)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSubDir(...parts: string[]): string {
  const dir = path.join(getDataDir(), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
