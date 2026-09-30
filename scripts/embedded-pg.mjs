#!/usr/bin/env node
/* -----------------------------------------------------------------------------
 * SRMS — پایگاه‌داده داخلی (embedded PostgreSQL)
 * -----------------------------------------------------------------------------
 * اگر PostgreSQL روی سیستم نصب نباشد، این اسکریپت یک سرور PostgreSQL کامل
 * و آفلاین را داخل پوشه‌ی data اجرا می‌کند (بدون نصب هیچ سرویسی روی ویندوز)
 * و یک سوکت TCP استاندارد در اختیار برنامه می‌گذارد.
 *
 *   node scripts/embedded-pg.mjs            → اجرا روی 127.0.0.1:55432
 *   SRMS_EMBEDDED_PG_PORT=55432 node ...    → پورت دلخواه
 *
 * خروجی، رشته اتصال استاندارد PostgreSQL است که در .env نوشته می‌شود:
 *   postgresql://srms:srms@127.0.0.1:55432/srms
 * --------------------------------------------------------------------------- */
import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SRMS_EMBEDDED_PG_PORT || 55432);
const STORE = process.env.SRMS_EMBEDDED_PG_DATA || path.join(ROOT, "data", "pglite");

const USER = "srms";
const PASS = "srms";
const DB = "srms";

async function main() {
  fs.mkdirSync(STORE, { recursive: true });

  let PGlite, PGLiteSocketServer;
  try {
    const a = await import("@electric-sql/pglite");
    PGlite = a.PGlite;
    const b = await import("@electric-sql/pglite-socket");
    PGLiteSocketServer = b.PGLiteSocketServer;
  } catch (e) {
    console.error("[SRMS] embedded engine missing. Run:  npm i @electric-sql/pglite @electric-sql/pglite-socket");
    console.error(e.message);
    process.exit(1);
  }

  const db = new PGlite(STORE);
  await db.waitReady;

  const server = new PGLiteSocketServer({ db });
  await new Promise((resolve, reject) => {
    server.listen({ host: "127.0.0.1", port: PORT }, (err) => (err ? reject(err) : resolve()));
  });

  const url = `postgresql://${USER}:${PASS}@127.0.0.1:${PORT}/${DB}`;
  console.log(`[SRMS] embedded PostgreSQL ready`);
  console.log(`[SRMS] DATABASE_URL=${url}`);
  console.log(`[SRMS] data dir: ${STORE}`);
  console.log(`[SRMS] press Ctrl+C to stop`);
}

main().catch((e) => {
  console.error("[SRMS] embedded pg failed:", e.message);
  process.exit(1);
});
