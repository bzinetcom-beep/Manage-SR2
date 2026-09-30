"use strict";
/**
 * SRMS Desktop — Core utilities
 * -----------------------------------------------------------------------------
 * Path resolution, logging, persistent config and network helpers shared by the
 * Electron main process and the packaging scripts.
 *
 * Everything here is PATH-SAFE: no assumption about the working directory, no
 * hard-coded drive letters, tolerant of spaces / non-ASCII characters in paths.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const crypto = require("crypto");
const http = require("http");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** True when running inside a packaged (asar) Electron build. */
function isPackaged() {
  try {
    // eslint-disable-next-line global-require
    const { app } = require("electron");
    return Boolean(app && app.isPackaged);
  } catch {
    return false;
  }
}

/**
 * Root folder that contains the Next.js standalone application.
 *  - dev      : <repo>/
 *  - packaged : <install>/resources/app.asar.unpacked/  (we stage it unpacked)
 */
function appRoot() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, "app");
  }
  return path.resolve(__dirname, "..", "..");
}

/** Folder that holds bundled runtime assets (portable postgres, etc.). */
function resourcesRoot() {
  return isPackaged() ? process.resourcesPath : path.resolve(__dirname, "..", "runtime");
}

/** Writable per-user folder: %APPDATA%/SRMS  |  ~/Library/Application Support/SRMS */
function userDataDir() {
  try {
    // eslint-disable-next-line global-require
    const { app } = require("electron");
    if (app) return app.getPath("userData");
  } catch {
    /* not in electron */
  }
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "SRMS");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const logsDir = () => ensureDir(path.join(userDataDir(), "logs"));
const dataDir = () => ensureDir(path.join(userDataDir(), "data"));

// ---------------------------------------------------------------------------
// Logger — rotating, crash-safe, never throws
// ---------------------------------------------------------------------------

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2 MB

class Logger {
  constructor(name = "srms") {
    this.file = path.join(logsDir(), `${name}.log`);
    this.rotate();
  }

  rotate() {
    try {
      const st = fs.statSync(this.file);
      if (st.size > MAX_LOG_BYTES) {
        fs.renameSync(this.file, `${this.file}.1`);
      }
    } catch {
      /* first run */
    }
  }

  write(level, ...parts) {
    const line = `[${new Date().toISOString()}] [${level}] ${parts
      .map((p) => (typeof p === "string" ? p : safeStringify(p)))
      .join(" ")}\n`;
    try {
      fs.appendFileSync(this.file, line, "utf8");
    } catch {
      /* disk full / locked — never crash the launcher because of logging */
    }
    if (level === "ERROR") process.stderr.write(line);
    else process.stdout.write(line);
  }

  info(...a) {
    this.write("INFO", ...a);
  }
  warn(...a) {
    this.write("WARN", ...a);
  }
  error(...a) {
    this.write("ERROR", ...a);
  }
}

function safeStringify(value) {
  try {
    if (value instanceof Error) return `${value.message}\n${value.stack || ""}`;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Persistent configuration (per machine, per user)
// ---------------------------------------------------------------------------

const CONFIG_FILE = () => path.join(userDataDir(), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  ensureDir(userDataDir());
  const tmp = `${CONFIG_FILE()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, CONFIG_FILE()); // atomic write
  return next;
}

/** Auth secret is generated once per installation and never shipped in source. */
function getOrCreateAuthSecret() {
  const cfg = loadConfig();
  if (cfg.authSecret && String(cfg.authSecret).length >= 32) return cfg.authSecret;
  const secret = crypto.randomBytes(48).toString("base64url");
  saveConfig({ authSecret: secret });
  return secret;
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

/** Resolve a free TCP port, preferring `preferred` then scanning upwards. */
function findFreePort(preferred = 3000, attempts = 60) {
  return new Promise((resolve, reject) => {
    let port = preferred;
    let tried = 0;

    const tryPort = () => {
      if (tried++ >= attempts) {
        // last resort: let the OS pick anything
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => {
          const p = srv.address().port;
          srv.close(() => resolve(p));
        });
        srv.on("error", reject);
        return;
      }
      const srv = net.createServer();
      srv.unref();
      srv.on("error", () => {
        port += 1;
        tryPort();
      });
      srv.listen(port, "127.0.0.1", () => {
        srv.close(() => resolve(port));
      });
    };

    tryPort();
  });
}

/** True if something is already listening on the port. */
function isPortBusy(port, host = "127.0.0.1", timeout = 900) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (busy) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(busy);
    };
    sock.setTimeout(timeout);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

/** Poll an HTTP endpoint until it answers 2xx or the deadline passes. */
function waitForHttp(url, { timeoutMs = 120000, intervalMs = 500, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  let ticks = 0;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, { timeout: 4000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", retry);
    };

    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`سرویس در مهلت مقرر پاسخ نداد: ${url}`));
        return;
      }
      if (onTick) onTick(++ticks);
      setTimeout(attempt, intervalMs);
    };

    attempt();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  isPackaged,
  appRoot,
  resourcesRoot,
  userDataDir,
  ensureDir,
  logsDir,
  dataDir,
  Logger,
  loadConfig,
  saveConfig,
  getOrCreateAuthSecret,
  findFreePort,
  isPortBusy,
  waitForHttp,
  sleep,
};
