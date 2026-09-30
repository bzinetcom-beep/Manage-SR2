import fs from "node:fs";
import path from "node:path";
import { getSubDir } from "./data-dir";

export type WidgetImageKind = "quote" | "flag";

export const MAX_WIDGET_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const WIDGET_IMAGE_URL_PREFIX = "/api/uploads/widgets/";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function dir() {
  return getSubDir("uploads", "widgets");
}

function manifestPath() {
  return path.join(dir(), "manifest.json");
}

type Manifest = Partial<Record<WidgetImageKind, string>>;

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(m: Manifest) {
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2), "utf8");
}

/** تشخیص نوع واقعی تصویر از روی بایت‌های ابتدایی فایل (امنیت) */
function sniffExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export function safeFileName(name: string): string | null {
  return /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(name) && !name.includes("..") ? name : null;
}

export function widgetFilePath(name: string): string | null {
  const safe = safeFileName(name);
  if (!safe) return null;
  return path.join(dir(), safe);
}

export function urlToFileName(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(WIDGET_IMAGE_URL_PREFIX)) return null;
  return safeFileName(url.slice(WIDGET_IMAGE_URL_PREFIX.length).split("?")[0]);
}

/** حذف فایل تصویر یک ویجت (در صورت وجود) و پاک‌کردن از manifest */
export function removeWidgetImage(kind: WidgetImageKind) {
  const m = readManifest();
  const old = m[kind];
  if (old) {
    const p = widgetFilePath(old);
    if (p) fs.rmSync(p, { force: true });
  }
  delete m[kind];
  writeManifest(m);
}

/** ذخیره‌ی تصویر روی دیسک؛ آدرس ماندگار (URL) را برمی‌گرداند. */
export function saveWidgetImage(kind: WidgetImageKind, data: Buffer, declaredMime?: string): { url: string } {
  if (data.length > MAX_WIDGET_IMAGE_BYTES) throw new Error("حجم تصویر نباید بیش از ۸ مگابایت باشد");
  const ext = sniffExt(data) || (declaredMime ? EXT_BY_MIME[declaredMime.toLowerCase()] : undefined);
  if (!ext || !sniffExt(data)) throw new Error("فرمت تصویر پشتیبانی نمی‌شود (PNG، JPG، WEBP یا GIF)");

  const m = readManifest();
  const fileName = `${kind}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir(), fileName), data);
  if (m[kind] && m[kind] !== fileName) {
    const p = widgetFilePath(m[kind]!);
    if (p) fs.rmSync(p, { force: true });
  }
  m[kind] = fileName;
  writeManifest(m);
  return { url: `${WIDGET_IMAGE_URL_PREFIX}${fileName}` };
}

/** تبدیل data-URL (روش قدیمی آپلود) به فایل ماندگار */
export function saveWidgetImageFromDataUrl(kind: WidgetImageKind, dataUrl: string): { url: string } {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("تصویر نامعتبر است");
  return saveWidgetImage(kind, Buffer.from(m[2], "base64"), m[1]);
}

/** آدرس تصویری که روی دیسک برای این ویجت باقی مانده است (برای بازیابی بعد از پاک‌شدن دیتابیس) */
export function persistedWidgetImageUrl(kind: WidgetImageKind): string {
  const name = readManifest()[kind];
  if (!name) return "";
  const p = widgetFilePath(name);
  return p && fs.existsSync(p) ? `${WIDGET_IMAGE_URL_PREFIX}${name}` : "";
}
