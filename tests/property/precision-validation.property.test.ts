/**
 * Property-based tests for locationPrecision + precisionSeed validation/migration.
 * Feature: location-precision (Task 3)
 *
 *   Property 7: Validation repairs every malformed setting
 *   Property 8: Settings round-trip
 *
 * `validateSettings` is the reload path (loadSettings runs it on stored data),
 * so exercising it directly covers persistence round-trips.
 */

import fc from "fast-check";
import type { LocationPrecision } from "@/shared/types/settings";
import { MIN_PRECISION_RADIUS_M, MAX_PRECISION_RADIUS_M } from "@/shared/types/settings";
import { importBackground } from "../helpers/import-background";

describe("Property 7: validation repairs every malformed locationPrecision", () => {
  test("any junk in the locationPrecision slot yields a valid shape", async () => {
    const { validateSettings } = await importBackground();

    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const lp = validateSettings({
          locationPrecision: junk as LocationPrecision,
        }).locationPrecision;

        if (lp.mode === "exact") {
          expect(Object.keys(lp)).toEqual(["mode"]);
        } else if (lp.mode === "approximate") {
          expect(Number.isFinite(lp.radiusMeters)).toBe(true);
          expect(lp.radiusMeters).toBeGreaterThanOrEqual(MIN_PRECISION_RADIUS_M);
          expect(lp.radiusMeters).toBeLessThanOrEqual(MAX_PRECISION_RADIUS_M);
        } else {
          throw new Error(`unexpected mode: ${String((lp as { mode: unknown }).mode)}`);
        }
      }),
      { numRuns: 300 }
    );
  });

  test("targeted repair cases", async () => {
    const { validateSettings } = await importBackground();
    const lp = (v: unknown): LocationPrecision =>
      validateSettings({ locationPrecision: v as LocationPrecision }).locationPrecision;

    // Absent → exact
    expect(validateSettings({}).locationPrecision).toEqual({ mode: "exact" });
    // Unknown mode → exact
    expect(lp({ mode: "wobble" })).toEqual({ mode: "exact" });
    // Approximate with non-finite radius → exact
    expect(lp({ mode: "approximate", radiusMeters: NaN })).toEqual({ mode: "exact" });
    expect(lp({ mode: "approximate", radiusMeters: "500" })).toEqual({ mode: "exact" });
    // Out-of-bounds radius → clamped
    expect(lp({ mode: "approximate", radiusMeters: 5 })).toEqual({
      mode: "approximate",
      radiusMeters: MIN_PRECISION_RADIUS_M,
    });
    expect(lp({ mode: "approximate", radiusMeters: 10_000_000 })).toEqual({
      mode: "approximate",
      radiusMeters: MAX_PRECISION_RADIUS_M,
    });
    // In-bounds radius → preserved
    expect(lp({ mode: "approximate", radiusMeters: 2000 })).toEqual({
      mode: "approximate",
      radiusMeters: 2000,
    });
  });

  test("precisionSeed is always a finite non-zero number (kept or generated)", async () => {
    const { validateSettings } = await importBackground();
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const seed = validateSettings({ precisionSeed: junk as number }).precisionSeed;
        expect(typeof seed).toBe("number");
        expect(Number.isFinite(seed)).toBe(true);
        expect(seed).not.toBe(0);
      }),
      { numRuns: 200 }
    );
  });
});

describe("Property 8: locationPrecision + precisionSeed round-trip", () => {
  test("a valid setting and non-zero seed survive validation unchanged", async () => {
    const { validateSettings } = await importBackground();

    const validPrecisionArb: fc.Arbitrary<LocationPrecision> = fc.oneof(
      fc.constant<LocationPrecision>({ mode: "exact" }),
      fc
        .integer({ min: MIN_PRECISION_RADIUS_M, max: MAX_PRECISION_RADIUS_M })
        .map((radiusMeters) => ({ mode: "approximate" as const, radiusMeters }))
    );

    fc.assert(
      fc.property(validPrecisionArb, fc.integer({ min: 1, max: 2 ** 31 }), (precision, seed) => {
        const validated = validateSettings({ locationPrecision: precision, precisionSeed: seed });
        expect(validated.locationPrecision).toEqual(precision);
        expect(validated.precisionSeed).toBe(seed);
      }),
      { numRuns: 300 }
    );
  });

  test("precisionSeed is independent of accuracySeed", async () => {
    const { validateSettings } = await importBackground();
    const validated = validateSettings({ accuracySeed: 111, precisionSeed: 222 });
    expect(validated.accuracySeed).toBe(111);
    expect(validated.precisionSeed).toBe(222);
  });
});
