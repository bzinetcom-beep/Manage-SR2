import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * `SRMS_DESKTOP_BUILD=1` is set only by desktop/scripts/make-dist.mjs.
 * In that mode Next emits a self-contained server (.next/standalone) that the
 * Electron shell can run without `node_modules` and without a Node install.
 * The normal web build/deploy path stays exactly as before.
 */
const isDesktopBuild = process.env.SRMS_DESKTOP_BUILD === "1";

/**
 * Resolve the JWT signing secret used by `src/lib/auth.ts` (Node runtime) and
 * `src/middleware.ts` (Edge runtime). Both MUST agree or every session breaks.
 *
 * Order:
 *   1. `AUTH_SECRET` from the environment — always wins.
 *   2. A random secret persisted in `.srms-secret`, generated on first build.
 *
 * Why persist to a file instead of relying on `.env`?
 * Hosted sandboxes regenerate `.env` on every restart, which silently dropped
 * `AUTH_SECRET` and fell back to the shared hard-coded development key. The
 * file keeps a unique per-installation secret without any manual step.
 *
 * NOTE: the value is inlined at build time, so it is deliberately NOT applied
 * to desktop builds — there the Electron shell injects a per-machine secret at
 * runtime (see desktop/lib/core.js → getOrCreateAuthSecret).
 */
function resolveAuthSecret(): string | null {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32) {
    return process.env.AUTH_SECRET;
  }

  const file = path.join(process.cwd(), ".srms-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* first build — fall through and create it */
  }

  try {
    const secret = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(file, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
    return secret;
  } catch {
    // Read-only filesystem: let the app use its built-in fallback constant.
    return null;
  }
}

const authSecret = isDesktopBuild ? null : resolveAuthSecret();

const nextConfig: NextConfig = {
  // آپلود فایل ZIP کامل سامانه (بروزرسانی) و تصاویر: سقف پیش‌فرض ۱۰ مگابایت است
  experimental: {
    proxyClientMaxBodySize: "300mb",
  },
  ...(isDesktopBuild
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: process.cwd(),
      }
    : {}),
  ...(authSecret ? { env: { AUTH_SECRET: authSecret } } : {}),
};

export default nextConfig;
