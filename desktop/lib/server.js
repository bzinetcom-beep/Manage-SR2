"use strict";
/**
 * SRMS Desktop — Application server supervisor
 * -----------------------------------------------------------------------------
 * Starts the Next.js *standalone* server as a child process and supervises it.
 *
 * KEY IDEA: we re-launch Electron's own binary with ELECTRON_RUN_AS_NODE=1.
 * Electron embeds a full Node.js runtime, therefore the end user does NOT need
 * Node.js installed — the runtime travels with the application.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { appRoot, findFreePort, waitForHttp, getOrCreateAuthSecret } = require("./core");

/** Locate the compiled standalone entrypoint produced by `next build`. */
function resolveServerEntry() {
  const root = appRoot();
  const candidates = [
    path.join(root, "server.js"), // staged layout (installer)
    path.join(root, ".next", "standalone", "server.js"), // raw build output
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Boot the web server.
 * @param {object}   opts
 * @param {string}   opts.databaseUrl
 * @param {function} opts.log
 * @param {function} opts.onOutput  raw stdout/stderr sink
 */
async function startServer({ databaseUrl, log = () => {}, onOutput = () => {} }) {
  const entry = resolveServerEntry();
  if (!entry) {
    const err = new Error(
      "فایل سرور برنامه پیدا نشد. بسته نصبی ناقص است (server.js موجود نیست).",
    );
    err.code = "SERVER_ENTRY_MISSING";
    throw err;
  }

  const port = await findFreePort(3000);
  const origin = `http://127.0.0.1:${port}`;
  const cwd = path.dirname(entry);

  log("راه‌اندازی موتور برنامه…");

  const isWin = process.platform === "win32";
  const child = spawn(process.execPath, [entry], {
    cwd,
    windowsHide: true,
    // POSIX: dedicated process group so the whole tree can be terminated.
    detached: !isWin,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // run the embedded Node, not a new Electron UI
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // never bind to 0.0.0.0 on a client machine
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: getOrCreateAuthSecret(),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  child.stdout.on("data", (b) => onOutput(b.toString()));
  child.stderr.on("data", (b) => onOutput(b.toString()));

  let exited = false;
  let exitInfo = null;
  child.on("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
    onOutput(`\n[server] exited code=${code} signal=${signal}\n`);
  });

  log("در انتظار آماده شدن سرویس…");
  try {
    await waitForHttp(`${origin}/api/health`, {
      timeoutMs: 180000, // first run also creates the schema + seeds users
      intervalMs: 600,
      onTick: (n) => {
        if (exited) throw new Error("server exited");
        if (n === 20) log("در حال ساخت جداول پایگاه‌داده (اولین اجرا)…");
        if (n === 60) log("کمی بیشتر طول می‌کشد، لطفاً صبر کنید…");
      },
    });
  } catch (e) {
    if (exited) {
      const err = new Error(
        `سرور برنامه به‌طور غیرمنتظره متوقف شد (code=${exitInfo && exitInfo.code}).`,
      );
      err.code = "SERVER_CRASHED";
      throw err;
    }
    throw e;
  }

  return {
    port,
    origin,
    pid: child.pid,
    isAlive: () => !exited,
    stop: () =>
      new Promise((resolve) => {
        if (exited) return resolve();
        const done = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 6000);
        child.once("exit", () => {
          clearTimeout(done);
          resolve();
        });
        try {
          if (isWin) {
            // Ensure the whole process tree dies (Next may spawn workers).
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
          } else {
            process.kill(-child.pid, "SIGTERM"); // negative pid = process group
          }
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          clearTimeout(done);
          resolve();
        }
      }),
  };
}

module.exports = { startServer, resolveServerEntry };
