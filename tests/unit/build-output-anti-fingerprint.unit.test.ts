/**
 * Build output verification tests for anti-fingerprint hardening.
 *
 * These tests run actual Vite builds and inspect the output to verify:
 * - Production builds strip console.log/console.info from injected.js
 * - Production builds strip console.error/console.warn containing "GeoSpoof"
 * - Development builds preserve all console calls
 * - The built event name does not contain "GeoSpoof" or "geospoof"
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, test, expect, beforeAll } from "vitest";

const ROOT = resolve(__dirname, "../..");
const DIST_INJECTED = resolve(ROOT, "dist/content/injected.js");

/**
 * Helper: run a Vite build with the given mode and return the injected.js content.
 * Caches results so each mode is only built once per test suite run.
 */
const buildCache = new Map<string, string>();

function buildAndRead(mode: "production" | "development"): string {
  const cached = buildCache.get(mode);
  if (cached !== undefined) return cached;

  execSync(`npx vite build --mode ${mode}`, {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: mode },
    timeout: 60_000,
  });

  if (!existsSync(DIST_INJECTED)) {
    throw new Error(`Build output not found: ${DIST_INJECTED}`);
  }

  const content = readFileSync(DIST_INJECTED, "utf-8");
  buildCache.set(mode, content);
  return content;
}

// ---------------------------------------------------------------------------
// Production build tests
// ---------------------------------------------------------------------------
describe("Production build of injected.js", () => {
  let prodContent: string;

  beforeAll(() => {
    prodContent = buildAndRead("production");
  }, 120_000);

  test("contains no console.log calls (Req 3.1)", () => {
    // After minification, console.log calls are stripped by esbuild pure config.
    // Match console.log( but not console.log as part of a longer identifier.
    const matches = prodContent.match(/\bconsole\.log\s*\(/g);
    expect(matches).toBeNull();
  });

  test("contains no console.info calls (Req 3.1)", () => {
    const matches = prodContent.match(/\bconsole\.info\s*\(/g);
    expect(matches).toBeNull();
  });

  test("contains no console.debug calls (Req 3.1)", () => {
    const matches = prodContent.match(/\bconsole\.debug\s*\(/g);
    expect(matches).toBeNull();
  });

  test('contains no console.error calls with "GeoSpoof" (Req 3.2)', () => {
    // Look for console.error(...GeoSpoof...) patterns
    const matches = prodContent.match(/console\.error\([^)]*GeoSpoof[^)]*\)/gi);
    expect(matches).toBeNull();
  });

  test('contains no console.warn calls with "GeoSpoof" (Req 3.2)', () => {
    const matches = prodContent.match(/console\.warn\([^)]*GeoSpoof[^)]*\)/gi);
    expect(matches).toBeNull();
  });

  test('event name does not contain "GeoSpoof" or "geospoof" (Req 3.5)', () => {
    // The event name should be replaced with a non-descriptive string at build time.
    // Check that no string literal in the output contains geospoof as part of an event name.
    expect(prodContent).not.toMatch(/__geospoof/i);
    expect(prodContent).not.toMatch(/geospoof_settings/i);
  });
});

// ---------------------------------------------------------------------------
// Development build tests
// ---------------------------------------------------------------------------
describe("Development build of injected.js", () => {
  let devContent: string;

  beforeAll(() => {
    devContent = buildAndRead("development");
  }, 120_000);

  test("preserves console.log calls (Req 3.3)", () => {
    const matches = devContent.match(/\bconsole\.log\s*\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(0);
  });

  test("preserves console.error calls (Req 3.3)", () => {
    const matches = devContent.match(/\bconsole\.error\s*\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(0);
  });

  test("preserves console.warn calls (Req 3.3)", () => {
    // The source has at least one console.warn with GeoSpoof
    const matches = devContent.match(/\bconsole\.warn\s*\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(0);
  });
});
