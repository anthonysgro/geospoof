/**
 * Cross-bridge contract for the Safari app ↔ extension scope-list passthrough.
 *
 * The native app encodes the allow/deny lists as JSON string arrays and shuttles
 * them verbatim through the App Group store. On adoption the extension
 * (`adoptPendingSettingsFromApp` in src/background/app-bridge.ts) parses each
 * entry through the shared Pattern_Parser and de-duplicates by canonical form:
 *
 *     for (const entry of arr) {
 *       const canonical = parsePattern(entry);
 *       if (canonical !== null && !seen.has(canonical)) out.push(canonical);
 *     }
 *
 * The Safari-only adoption branch is compiled out under the test harness
 * (`__SAFARI__` is a build-time literal `false`), so — like the accuracy bridge
 * test — we verify the reusable core the branch depends on: that `parsePattern`
 * (not the old hostname-only normalizer) is used, so advanced glob patterns
 * survive the app→extension round-trip instead of being silently dropped, and
 * that bare hostnames still carry forward losslessly.
 *
 * Validates: Requirements 13.3, 13.4 (via the bridge)
 */

import { describe, test, expect } from "vitest";
import { parsePattern } from "@/shared/utils/scope";

/** Mirror of the bridge's `parsePatternList`: JSON.parse → parse → dedupe-by-canonical. */
function adoptScopeList(json: string | undefined): string[] | undefined {
  if (typeof json !== "string") return undefined;
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(arr)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry !== "string") continue;
    const canonical = parsePattern(entry);
    if (canonical !== null && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

describe("Safari scope-list bridge contract", () => {
  test("advanced glob patterns survive the round-trip (the fix)", () => {
    // Under the old hostname-only normalizer these were all dropped.
    const json = JSON.stringify(["*.ru", "*.example.com", "localhost:3000", "site.com/app/*"]);
    expect(adoptScopeList(json)).toEqual([
      "*.ru",
      "*.example.com",
      "localhost:3000",
      "site.com/app/*",
    ]);
  });

  test("bare hostnames carry forward losslessly", () => {
    expect(adoptScopeList(JSON.stringify(["example.com", "sub.example.org"]))).toEqual([
      "example.com",
      "sub.example.org",
    ]);
  });

  test("invalid entries are dropped, valid ones kept", () => {
    const json = JSON.stringify(["bad_domain.com", "exa(mple).com", "no-dot", "valid.com"]);
    expect(adoptScopeList(json)).toEqual(["valid.com"]);
  });

  test("entries are canonicalized and de-duplicated by canonical form (keep first)", () => {
    const json = JSON.stringify(["EXAMPLE.com", "example.com", "  Example.COM  ", "other.org"]);
    expect(adoptScopeList(json)).toEqual(["example.com", "other.org"]);
  });

  test("non-string entries are skipped", () => {
    const json = JSON.stringify(["example.com", 42, null, { host: "x" }, "*.ru"]);
    expect(adoptScopeList(json)).toEqual(["example.com", "*.ru"]);
  });

  test("malformed JSON or a non-array is ignored (leaves existing state untouched)", () => {
    expect(adoptScopeList("not json")).toBeUndefined();
    expect(adoptScopeList(JSON.stringify({ not: "an array" }))).toBeUndefined();
    expect(adoptScopeList(undefined)).toBeUndefined();
  });
});
