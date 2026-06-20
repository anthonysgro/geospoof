/**
 * Unit tests for the popup accuracy control's pure mapping/clamping helpers.
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MIN_ACCURACY_M,
  MAX_ACCURACY_M,
  clampAccuracyMeters,
  isAccuracyMetersInRange,
  optionToAccuracySetting,
  accuracySettingToControlState,
} from "@/popup/accuracy";
import type { AccuracySetting } from "@/shared/types/settings";

describe("clampAccuracyMeters", () => {
  it("rounds to an integer", () => {
    expect(clampAccuracyMeters(42.4)).toBe(42);
    expect(clampAccuracyMeters(42.6)).toBe(43);
  });

  it("clamps below the lower bound up to 1", () => {
    expect(clampAccuracyMeters(0)).toBe(MIN_ACCURACY_M);
    expect(clampAccuracyMeters(-100)).toBe(MIN_ACCURACY_M);
  });

  it("clamps above the upper bound down to 10000", () => {
    expect(clampAccuracyMeters(10001)).toBe(MAX_ACCURACY_M);
    expect(clampAccuracyMeters(999999)).toBe(MAX_ACCURACY_M);
  });

  it("falls back to the lower bound for non-finite input", () => {
    expect(clampAccuracyMeters(NaN)).toBe(MIN_ACCURACY_M);
    expect(clampAccuracyMeters(Infinity)).toBe(MIN_ACCURACY_M);
    expect(clampAccuracyMeters(-Infinity)).toBe(MIN_ACCURACY_M);
  });

  it("always returns an integer in [1, 10000] for any number", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (n) => {
        const out = clampAccuracyMeters(n);
        expect(Number.isInteger(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(MIN_ACCURACY_M);
        expect(out).toBeLessThanOrEqual(MAX_ACCURACY_M);
      })
    );
  });
});

describe("isAccuracyMetersInRange", () => {
  it("accepts the inclusive bounds", () => {
    expect(isAccuracyMetersInRange(1)).toBe(true);
    expect(isAccuracyMetersInRange(10000)).toBe(true);
    expect(isAccuracyMetersInRange(500)).toBe(true);
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(isAccuracyMetersInRange(0)).toBe(false);
    expect(isAccuracyMetersInRange(10001)).toBe(false);
    expect(isAccuracyMetersInRange(NaN)).toBe(false);
    expect(isAccuracyMetersInRange(Infinity)).toBe(false);
  });
});

describe("optionToAccuracySetting", () => {
  it("maps Realistic to auto", () => {
    expect(optionToAccuracySetting("realistic")).toEqual({ mode: "auto" });
  });

  it("maps Custom to a fixed setting with clamped meters", () => {
    expect(optionToAccuracySetting("custom", 250)).toEqual({ mode: "fixed", meters: 250 });
    expect(optionToAccuracySetting("custom", 0)).toEqual({ mode: "fixed", meters: 1 });
    expect(optionToAccuracySetting("custom", 50000)).toEqual({ mode: "fixed", meters: 10000 });
    expect(optionToAccuracySetting("custom", 12.7)).toEqual({ mode: "fixed", meters: 13 });
  });

  it("returns null for Custom without a usable value", () => {
    expect(optionToAccuracySetting("custom")).toBeNull();
    expect(optionToAccuracySetting("custom", NaN)).toBeNull();
  });
});

describe("accuracySettingToControlState (reverse mapping)", () => {
  it("maps auto to realistic", () => {
    expect(accuracySettingToControlState({ mode: "auto" })).toEqual({
      option: "realistic",
      customMeters: null,
    });
  });

  it("maps the legacy Tight range to realistic (preset retired)", () => {
    expect(accuracySettingToControlState({ mode: "range", min: 5, max: 15 })).toEqual({
      option: "realistic",
      customMeters: null,
    });
  });

  it("maps the legacy Loose range to realistic (preset retired)", () => {
    expect(accuracySettingToControlState({ mode: "range", min: 35, max: 100 })).toEqual({
      option: "realistic",
      customMeters: null,
    });
  });

  it("maps a fixed setting to custom with clamped meters", () => {
    expect(accuracySettingToControlState({ mode: "fixed", meters: 250 })).toEqual({
      option: "custom",
      customMeters: 250,
    });
    expect(accuracySettingToControlState({ mode: "fixed", meters: 99999 })).toEqual({
      option: "custom",
      customMeters: 10000,
    });
  });

  it("falls back to realistic for an unrecognized range", () => {
    expect(accuracySettingToControlState({ mode: "range", min: 7, max: 42 })).toEqual({
      option: "realistic",
      customMeters: null,
    });
  });

  it("round-trips the remaining options through option→setting→option", () => {
    const presets: AccuracySetting[] = [{ mode: "auto" }, { mode: "fixed", meters: 500 }];
    for (const setting of presets) {
      const { option, customMeters } = accuracySettingToControlState(setting);
      const back = optionToAccuracySetting(option, customMeters ?? undefined);
      expect(back).toEqual(setting);
    }
  });

  it("collapses any range to realistic→auto (presets retired, no round-trip)", () => {
    for (const range of [
      { mode: "range", min: 5, max: 15 } as const,
      { mode: "range", min: 35, max: 100 } as const,
      { mode: "range", min: 7, max: 42 } as const,
    ]) {
      const { option, customMeters } = accuracySettingToControlState(range);
      expect(option).toBe("realistic");
      expect(optionToAccuracySetting(option, customMeters ?? undefined)).toEqual({ mode: "auto" });
    }
  });
});
