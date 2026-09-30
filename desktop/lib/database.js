"use strict";
/**
 * SRMS Desktop — Database provisioning
 * -----------------------------------------------------------------------------
 * Guarantees a working PostgreSQL-compatible endpoint, with a 4-tier fallback
 * chain so the application ALWAYS starts, even on a machine with nothing
 * installed and no internet connection:
 *
 *   1. PINNED       — a DATABASE_URL the operator explicitly configured.
 *   2. EMBEDDED     — portable PostgreSQL binaries bundled with the installer.
 *   3. SYSTEM       — an already-installed local PostgreSQL service.
 *   4. PGLITE       — WASM PostgreSQL exposed over the real wire protocol.
 *
 * The chosen strategy is remembered in config.json so subsequent launches are
 * fast and deterministic.
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const {
  resourcesRoot,
  dataDir,
  userDataDir,
  ensureDir,
  loadConfig,
  saveConfig,
  findFreePort,
  sleep,
} = require("./core");

const DB_NAME = "srms_db";
const DB_USER = "srms";
const CONNECT_TIMEOUT_MS = 4000;

/** Candidate credentials probed when looking for a pre-installed PostgreSQL. */
const SYSTEM_CANDIDATES = [];
for (const port of [5432, 5433, 5434]) {
  for (const password of ["postgres", "admin", "123456", "1234", "root", "password"]) {
    SYSTEM_CANDIDATES.push({ host: "127.0.0.1", port, user: "postgres", password });
  }
}

function pg() {
  // Loaded lazily so the splash screen can render before the driver is required.
  // eslint-disable-next-line global-require
  return require("pg");
}

function buildUrl({ user, password, host, port, database }) {
  const enc = encodeURIComponent;
  const auth = password ? `${enc(user)}:${enc(password)}` : enc(user);
  return `postgresql://${auth}@${host}:${port}/${database}`;
}

/** Try `select 1` against a URL. Returns true/false, never throws. */
async function probe(url) {
  const { Client } = pg();
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

/** Create the application database if the server is reachable but the DB is missing. */
async function ensureDatabaseExists(adminUrl, dbName) {
  const { Client } = pg();
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rows.length === 0) {
      // Identifier is a constant, not user input — safe to interpolate.
      await client.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
    }
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Tier 2 — Embedded / portable PostgreSQL
// ---------------------------------------------------------------------------

function embeddedBinDir() {
  return path.join(resourcesRoot(), "pgsql", "bin");
}

function embeddedExe(name) {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(embeddedBinDir(), name + ext);
}

function hasEmbeddedPostgres() {
  try {
    return fs.existsSync(embeddedExe("pg_ctl")) && fs.existsSync(embeddedExe("initdb"));
  } catch {
    return false;
  }
}

function runSync(exe, args, opts = {}) {
  const res = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, ...opts });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error,
  };
}

/**
 * Initialise (first run) and start the bundled PostgreSQL cluster.
 * Data lives in the per-user folder so a read-only Program Files install works.
 */
async function startEmbedded(log) {
  const pgData = path.join(dataDir(), "pgdata");
  const pwFile = path.join(userDataDir(), ".pgpass_init");
  const port = await findFreePort(55432);

  if (!fs.existsSync(path.join(pgData, "PG_VERSION"))) {
    log("آماده‌سازی پایگاه‌داده داخلی برای اولین بار…");
    ensureDir(path.dirname(pgData));
    fs.writeFileSync(pwFile, "srms-local-only", "utf8");
    const init = runSync(embeddedExe("initdb"), [
      "-D", pgData,
      "-U", DB_USER,
      "--pwfile", pwFile,
      "--encoding=UTF8",
      "--locale=C",
      "-A", "scram-sha-256",
    ]);
    try {
      fs.unlinkSync(pwFile);
    } catch {
      /* ignore */
    }
    if (!init.ok) throw new Error(`initdb failed: ${init.stderr || init.error}`);
  }

  log("راه‌اندازی موتور پایگاه‌داده…");
  const logFile = path.join(userDataDir(), "logs", "postgres.log");
  // Bind to loopback only — the database is never exposed on the network.
  const start = runSync(embeddedExe("pg_ctl"), [
    "-D", pgData,
    "-l", logFile,
    "-o", `-p ${port} -h 127.0.0.1 -c listen_addresses=127.0.0.1`,
    "-w", "-t", "60",
    "start",
  ]);
  if (!start.ok && !/already running/i.test(start.stdout + start.stderr)) {
    throw new Error(`pg_ctl start failed: ${start.stderr || start.stdout}`);
  }

  const adminUrl = buildUrl({
    user: DB_USER, password: "srms-local-only", host: "127.0.0.1", port, database: "postgres",
  });
  for (let i = 0; i < 30; i++) {
    if (await probe(adminUrl)) break;
    await sleep(500);
  }
  await ensureDatabaseExists(adminUrl, DB_NAME);

  return {
    kind: "embedded",
    url: buildUrl({
      user: DB_USER, password: "srms-local-only", host: "127.0.0.1", port, database: DB_NAME,
    }),
    stop: async () => {
      runSync(embeddedExe("pg_ctl"), ["-D", pgData, "-m", "fast", "-w", "-t", "30", "stop"]);
    },
  };
}

// ---------------------------------------------------------------------------
// Tier 3 — Pre-installed system PostgreSQL
// ---------------------------------------------------------------------------

async function findSystemPostgres(log) {
  log("جستجوی PostgreSQL نصب‌شده روی سیستم…");
  for (const c of SYSTEM_CANDIDATES) {
    const adminUrl = buildUrl({ ...c, database: "postgres" });
    // eslint-disable-next-line no-await-in-loop
    if (await probe(adminUrl)) {
      // eslint-disable-next-line no-await-in-loop
      await ensureDatabaseExists(adminUrl, DB_NAME);
      return {
        kind: "system",
        url: buildUrl({ ...c, database: DB_NAME }),
        stop: async () => {}, // we did not start it, we must not stop it
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tier 4 — PGlite (WASM PostgreSQL over the real wire protocol)
// ---------------------------------------------------------------------------

async function startPglite(log) {
  log("راه‌اندازی پایگاه‌داده جاسازی‌شده (حالت سازگاری)…");
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const store = path.join(dataDir(), "pglite");
  ensureDir(store);
  const db = await PGlite.create({ dataDir: store });
  const port = await findFreePort(55433);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();

  return {
    kind: "pglite",
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      try {
        await server.stop();
      } catch {
        /* ignore */
      }
      try {
        await db.close();
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Resolve a usable database endpoint.
 * @param {(msg:string)=>void} log progress reporter (shown on the splash screen)
 * @returns {Promise<{kind:string,url:string,stop:()=>Promise<void>}>}
 */
async function provisionDatabase(log = () => {}) {
  const cfg = loadConfig();
  const errors = [];

  // Tier 1 — pinned / previously working URL
  const pinned = process.env.SRMS_DATABASE_URL || cfg.databaseUrl;
  if (pinned) {
    log("اتصال به پایگاه‌داده پیکربندی‌شده…");
    if (await probe(pinned)) {
      return { kind: cfg.databaseKind || "pinned", url: pinned, stop: async () => {} };
    }
    errors.push("پایگاه‌داده ذخیره‌شده در دسترس نیست؛ تلاش برای گزینه‌های دیگر.");
  }

  // Tier 2 — embedded portable PostgreSQL
  if (hasEmbeddedPostgres()) {
    try {
      const r = await startEmbedded(log);
      saveConfig({ databaseUrl: r.url, databaseKind: r.kind });
      return r;
    } catch (e) {
      errors.push(`embedded: ${e.message}`);
    }
  }

  // Tier 3 — system PostgreSQL
  try {
    const r = await findSystemPostgres(log);
    if (r) {
      saveConfig({ databaseUrl: r.url, databaseKind: r.kind });
      return r;
    }
  } catch (e) {
    errors.push(`system: ${e.message}`);
  }

  // Tier 4 — PGlite (always works, zero prerequisites)
  try {
    const r = await startPglite(log);
    // Port is dynamic → do not pin the URL, only the strategy.
    saveConfig({ databaseUrl: null, databaseKind: r.kind });
    return r;
  } catch (e) {
    errors.push(`pglite: ${e.message}`);
  }

  const err = new Error(
    "امکان آماده‌سازی پایگاه‌داده وجود نداشت.\n" + errors.map((x) => ` • ${x}`).join("\n"),
  );
  err.code = "DB_PROVISION_FAILED";
  throw err;
}

module.exports = {
  DB_NAME,
  provisionDatabase,
  probe,
  buildUrl,
  hasEmbeddedPostgres,
  ensureDatabaseExists,
};
