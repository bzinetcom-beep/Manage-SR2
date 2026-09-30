#!/usr/bin/env node
/**
 * SRMS — Turbopack external-module repair
 * =============================================================================
 * FIXES:
 *   ⨯ Error: Failed to load external module pg-573ead783b4a4202:
 *     Cannot find package '<project>\.next\node_modules\pg-573ead783b4a4202\index.js'
 *
 * WHY IT HAPPENS
 * --------------
 * When Next.js 16 builds with Turbopack, server-side packages that must stay
 * outside the bundle (`pg`, `bcryptjs`, …) are referenced by a *hashed alias*:
 *
 *     await a.y("pg-587764f78a6c7a9c")   →   .next/node_modules/pg-587764f78a6c7a9c
 *
 * At the end of the build Turbopack creates that folder as a **symlink** to the
 * real package. Two things break this on Windows:
 *
 *   1. Creating a symlink on Windows needs Administrator rights or Developer
 *      Mode. Without them the link is silently not created, so the build looks
 *      green but `next start` explodes on the first database request.
 *   2. The hash encodes the resolved package location, so a `.next` folder that
 *      was produced on another machine / before `npm install` changed anything
 *      references a hash that no longer exists ("Build cached" → stale build).
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 *   • scans the compiled server output for every `<name>-<16 hex>` alias
 *   • checks whether `.next/node_modules/<alias>` really resolves
 *   • recreates the missing ones as a **directory junction** — junctions do NOT
 *     require elevation on Windows — and falls back to a real recursive copy
 *   • exits 0 when everything is healthy, 1 when it could not be repaired
 *
 * USAGE
 *   node scripts/fix-turbopack-externals.mjs            # repair
 *   node scripts/fix-turbopack-externals.mjs --verify   # report only, no writes
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require_ = createRequire(path.join(ROOT, "package.json"));

const VERIFY_ONLY = process.argv.includes("--verify");
const QUIET = process.argv.includes("--quiet");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const say = (m) => !QUIET && console.log(m);

/** Turbopack alias format: `<package name>-<16 lowercase hex chars>` */
const ALIAS_RE = /"((?:@[a-z0-9._-]+\/)?[a-zA-Z0-9._-]+-[0-9a-f]{16})"/g;

/** Recursively collect *.js files under a directory (bounded, cycle-free). */
function collectJs(dir, out = [], depth = 0) {
  if (depth > 12) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue; // never scan the link target tree
      collectJs(p, out, depth + 1);
    } else if (e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".mjs"))) {
      out.push(p);
    }
  }
  return out;
}

/** Every hashed alias referenced by the compiled server bundles. */
function findAliases(serverDir) {
  const aliases = new Set();
  for (const file of collectJs(serverDir)) {
    let src;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(ALIAS_RE)) aliases.add(m[1]);
  }
  return [...aliases];
}

/** `pg-587764f78a6c7a9c` → `pg`   |   `@scope/x-0123456789abcdef` → `@scope/x` */
const aliasToPackage = (alias) => alias.replace(/-[0-9a-f]{16}$/, "");

/** Is the alias folder present AND does it point at a loadable package? */
function isHealthy(dir) {
  try {
    const pkg = path.join(dir, "package.json");
    if (!fs.existsSync(pkg)) return false;
    JSON.parse(fs.readFileSync(pkg, "utf8"));
    return true;
  } catch {
    return false;
  }
}

/** Absolute path of the installed package, or null. */
function resolvePackageDir(name) {
  try {
    return path.dirname(require_.resolve(`${name}/package.json`));
  } catch {
    /* package.json may not be exported — fall back to a manual lookup */
  }
  const guess = path.join(ROOT, "node_modules", ...name.split("/"));
  return fs.existsSync(path.join(guess, "package.json")) ? guess : null;
}

/**
 * Link `target` → `linkPath`.
 * Windows: "junction" needs NO administrator rights (plain symlinks do).
 * Anything else: a real recursive copy, which always works.
 */
function link(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return "junction";
  } catch {
    fs.cpSync(target, linkPath, { recursive: true, dereference: true });
    return "copy";
  }
}

/** Repair one build output folder (`.next` or `.next/standalone`). */
function repairBuild(buildDir, label) {
  const serverDir = path.join(buildDir, "server");
  if (!fs.existsSync(serverDir)) return { scanned: 0, missing: 0, fixed: 0, failed: [] };

  const aliases = findAliases(serverDir);
  const nm = path.join(buildDir, "node_modules");
  const result = { scanned: aliases.length, missing: 0, fixed: 0, failed: [] };

  if (aliases.length === 0) return result;
  say(c.dim(`  ${label}: ${aliases.length} external alias(es)`));

  for (const alias of aliases) {
    const dest = path.join(nm, ...alias.split("/"));
    if (isHealthy(dest)) {
      say(`    ${c.green("✓")} ${alias}`);
      continue;
    }
    result.missing += 1;

    if (VERIFY_ONLY) {
      say(`    ${c.red("✗")} ${alias} ${c.dim("(missing)")}`);
      result.failed.push(alias);
      continue;
    }

    const pkgName = aliasToPackage(alias);
    const source = resolvePackageDir(pkgName);
    if (!source) {
      say(`    ${c.red("✗")} ${alias} ${c.dim(`→ package "${pkgName}" is not installed`)}`);
      result.failed.push(alias);
      continue;
    }

    try {
      const how = link(source, dest);
      result.fixed += 1;
      say(`    ${c.yellow("↻")} ${alias} ${c.dim(`→ ${pkgName} (${how})`)}`);
    } catch (e) {
      say(`    ${c.red("✗")} ${alias} ${c.dim(String(e.message))}`);
      result.failed.push(alias);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

function main() {
  const next = path.join(ROOT, ".next");
  if (!fs.existsSync(next)) {
    say(c.yellow("  بیلدی وجود ندارد (.next یافت نشد) — چیزی برای ترمیم نیست."));
    process.exit(0);
  }

  say(c.cyan(VERIFY_ONLY ? "  بررسی سلامت ماژول‌های خارجی…" : "  ترمیم ماژول‌های خارجی Turbopack…"));

  const targets = [[next, ".next"]];
  const standalone = path.join(next, "standalone", ".next");
  if (fs.existsSync(standalone)) targets.push([standalone, ".next/standalone/.next"]);

  let scanned = 0;
  let missing = 0;
  let fixed = 0;
  const failed = [];

  for (const [dir, label] of targets) {
    const r = repairBuild(dir, label);
    scanned += r.scanned;
    missing += r.missing;
    fixed += r.fixed;
    failed.push(...r.failed);
  }

  if (scanned === 0) {
    say(c.dim("  هیچ ماژول خارجی‌ای در خروجی بیلد یافت نشد."));
    process.exit(0);
  }

  if (failed.length > 0) {
    say(
      c.red(`  ${failed.length} ماژول قابل ترمیم نبود: `) +
        failed.join(", ") +
        c.dim("\n  راه‌حل: پوشه .next را حذف و دوباره بیلد بگیرید (SRMS-Repair.bat)."),
    );
    process.exit(1);
  }

  if (missing === 0) say(c.green(`  ✓ همه ${scanned} ماژول خارجی سالم هستند`));
  else say(c.green(`  ✓ ${fixed} ماژول ترمیم شد (از ${scanned})`));

  process.exit(0);
}

main();
