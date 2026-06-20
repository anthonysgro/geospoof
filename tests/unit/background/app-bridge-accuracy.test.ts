/**
 * Cross-bridge contract for the Safari app ↔ extension `accuracySetting`
 * passthrough.
 *
 * The native app encodes the spoofed-accuracy setting as a compact JSON string
 * (`SpoofAccuracySetting.toJSON()` in safari/Shared (App)/SpoofModel.swift) and
 * shuttles it verbatim through the App Group store. On adoption the extension
 * (`adoptPendingSettingsFromApp` in src/background/app-bridge.ts) does:
 *
 *     const parsed = JSON.parse(pending.accuracySetting);
 *     const validated = validateAccuracySetting(parsed);
 *     if (JSON.stringify(validated) !== JSON.stringify(latest.accuracySetting)) { ... }
 *
 * The Safari-only adoption branch itself is compiled out under the test harness
 * (`__SAFARI__` is a build-time literal `false`), so we verify the reusable core
 * the branch depends on: that the EXACT JSON shapes the Swift encoder emits
 * round-trip through `validateAccuracySetting` to the canonical TS value, and
 * that the change-detection / ignore-on-malformed semantics hold. This is the
 * guard that keeps the two language sides in agreement.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

import { describe, test, expect } from "vitest";
import { validateAccuracySetting } from "@/background/settings";
import type { AccuracySetting } from "@/shared/types/settings";

/**
 * Mirror of the bridge's parse step: JSON.parse inside try/catch, returning
 * `undefined` on malformed input so the caller leaves existing state untouched.
 */
function parseAccuracyJSON(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/**
 * Mirror of the bridge's full adopt decision: parse → validate → change-detect.
 * Returns the validated value to adopt, or null for "no change / ignore".
 */
function adoptAccuracy(json: string, current: AccuracySetting): AccuracySetting | null {
  const parsed = parseAccuracyJSON(json);
  if (parsed === undefined) return null; // malformed JSON — ignored by the bridge
  const validated = validateAccuracySetting(parsed);
  if (JSON.stringify(validated) === JSON.stringify(current)) return null; // no-op
  return validated;
}

describe("Safari accuracySetting bridge contract", () => {
  describe("exact Swift toJSON() shapes round-trip to the canonical TS value", () => {
    test('{"mode":"auto"} → { mode: "auto" }', () => {
      expect(validateAccuracySetting(JSON.parse('{"mode":"auto"}'))).toEqual({ mode: "auto" });
    });

    test('{"mode":"fixed","meters":N} → { mode: "fixed", meters: N }', () => {
      expect(validateAccuracySetting(JSON.parse('{"mode":"fixed","meters":45}'))).toEqual({
        mode: "fixed",
        meters: 45,
      });
    });

    test('{"mode":"range","min":N,"max":N} → { mode: "range", min, max }', () => {
      expect(validateAccuracySetting(JSON.parse('{"mode":"range","min":10,"max":200}'))).toEqual({
        mode: "range",
        min: 10,
        max: 200,
      });
    });

    test("range bounds at the shared [1, 10000] clamp limits survive verbatim", () => {
      expect(validateAccuracySetting(JSON.parse('{"mode":"range","min":1,"max":10000}'))).toEqual({
        mode: "range",
        min: 1,
        max: 10000,
      });
    });
  });

  describe("adoption decision (parse → validate → change-detect)", () => {
    test("adopts a changed setting", () => {
      const result = adoptAccuracy('{"mode":"fixed","meters":100}', { mode: "auto" });
      expect(result).toEqual({ mode: "fixed", meters: 100 });
    });

    test("no-ops when the decoded value matches the current setting", () => {
      const result = adoptAccuracy('{"mode":"auto"}', { mode: "auto" });
      expect(result).toBeNull();
    });

    test("no-ops when an out-of-range value repairs back to the current setting", () => {
      // Swift clamps on encode, but a hand-tampered store could carry e.g.
      // meters:45.4 — validation rounds it to 45, matching the current value.
      const result = adoptAccuracy('{"mode":"fixed","meters":45.4}', { mode: "fixed", meters: 45 });
      expect(result).toBeNull();
    });

    test("ignores malformed JSON (leaves existing state untouched)", () => {
      expect(adoptAccuracy("not json", { mode: "fixed", meters: 30 })).toBeNull();
      expect(adoptAccuracy("", { mode: "auto" })).toBeNull();
    });

    test("repairs an unknown mode to auto, then adopts only if that differs", () => {
      // Unknown mode validates to { mode: "auto" }.
      expect(adoptAccuracy('{"mode":"bogus"}', { mode: "fixed", meters: 30 })).toEqual({
        mode: "auto",
      });
      // ...and is a no-op when already auto.
      expect(adoptAccuracy('{"mode":"bogus"}', { mode: "auto" })).toBeNull();
    });
  });
});
