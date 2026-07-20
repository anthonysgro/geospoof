/**
 * Property-based tests for the location-precision Offset_Resolver.
 * Feature: location-precision (Task 2)
 *
 * Covers the correctness properties from the design:
 *   Property 1: Exact mode is the identity
 *   Property 2: Approximate output is within the radius
 *   Property 3: Output is always a valid coordinate
 *   Property 4: Determinism
 *   Property 5: Seed sensitivity
 *   Property 6: Directional spread / area-uniform disk
 *
 * plus range/determinism checks for `offsetHash01`.
 */

import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  resolveReportedLocation,
  offsetHash01,
  type ReportedCoordinates,
} from "@/shared/precision/offset";
import {
  MIN_PRECISION_RADIUS_M,
  MAX_PRECISION_RADIUS_M,
  type LocationPrecision,
} from "@/shared/types/settings";

/** Great-circle distance in meters between two coordinates (reference impl). */
function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Anchors comfortably away from the poles/antimeridian so clamp/wrap are no-ops. */
const inRangeAnchorArb: fc.Arbitrary<ReportedCoordinates> = fc.record({
  latitude: fc.double({ min: -80, max: 80, noNaN: true }),
  longitude: fc.double({ min: -179, max: 179, noNaN: true }),
});

const seedArb = fc.integer({ min: 0, max: 2 ** 31 });

const radiusArb = fc.integer({ min: MIN_PRECISION_RADIUS_M, max: MAX_PRECISION_RADIUS_M });

const approximateArb: fc.Arbitrary<LocationPrecision> = radiusArb.map((radiusMeters) => ({
  mode: "approximate" as const,
  radiusMeters,
}));

describe("precision offset — Property 1: exact mode is the identity", () => {
  test("exact mode returns the anchor unchanged", () => {
    fc.assert(
      fc.property(inRangeAnchorArb, seedArb, (anchor, seed) => {
        const out = resolveReportedLocation(anchor, { mode: "exact" }, seed);
        expect(out.latitude).toBe(anchor.latitude);
        expect(out.longitude).toBe(anchor.longitude);
      }),
      { numRuns: 200 }
    );
  });
});

describe("precision offset — Property 2: approximate output is within the radius", () => {
  test("the offset point is within radiusMeters of the anchor", () => {
    fc.assert(
      fc.property(inRangeAnchorArb, approximateArb, seedArb, (anchor, precision, seed) => {
        const out = resolveReportedLocation(anchor, precision, seed);
        const radius = (precision as { radiusMeters: number }).radiusMeters;
        const dist = haversineMeters(
          anchor.latitude,
          anchor.longitude,
          out.latitude,
          out.longitude
        );
        // sqrt(u1) < 1 so the planar distance is < radius; allow a small
        // tolerance for the equirectangular projection back to degrees.
        expect(dist).toBeLessThanOrEqual(radius * 1.02 + 2);
      }),
      { numRuns: 500 }
    );
  });
});

describe("precision offset — Property 3: output is always a valid coordinate", () => {
  test("latitude in [-90,90] and longitude in [-180,180) for any input", () => {
    // Deliberately include out-of-range and non-finite anchors to exercise the
    // clamp/wrap guards.
    const wildAnchorArb: fc.Arbitrary<ReportedCoordinates> = fc.record({
      latitude: fc.oneof(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.constantFrom(NaN, Infinity, -Infinity, 90, -90)
      ),
      longitude: fc.oneof(
        fc.double({ min: -400, max: 400, noNaN: true }),
        fc.constantFrom(NaN, Infinity, -Infinity, 180, -180)
      ),
    });
    const precisionArb: fc.Arbitrary<LocationPrecision> = fc.oneof(
      fc.constant<LocationPrecision>({ mode: "exact" }),
      approximateArb,
      // Malformed radii the resolver must tolerate defensively.
      fc.constantFrom<LocationPrecision>(
        { mode: "approximate", radiusMeters: 0 },
        { mode: "approximate", radiusMeters: -5 },
        { mode: "approximate", radiusMeters: NaN },
        { mode: "approximate", radiusMeters: Infinity },
        { mode: "approximate", radiusMeters: 10_000_000 }
      )
    );
    fc.assert(
      fc.property(wildAnchorArb, precisionArb, seedArb, (anchor, precision, seed) => {
        const out = resolveReportedLocation(anchor, precision, seed);
        expect(Number.isFinite(out.latitude)).toBe(true);
        expect(Number.isFinite(out.longitude)).toBe(true);
        expect(out.latitude).toBeGreaterThanOrEqual(-90);
        expect(out.latitude).toBeLessThanOrEqual(90);
        expect(out.longitude).toBeGreaterThanOrEqual(-180);
        expect(out.longitude).toBeLessThan(180);
      }),
      { numRuns: 500 }
    );
  });
});

describe("precision offset — Property 4: determinism", () => {
  test("identical inputs yield identical output", () => {
    const precisionArb: fc.Arbitrary<LocationPrecision> = fc.oneof(
      fc.constant<LocationPrecision>({ mode: "exact" }),
      approximateArb
    );
    fc.assert(
      fc.property(inRangeAnchorArb, precisionArb, seedArb, (anchor, precision, seed) => {
        const a = resolveReportedLocation(anchor, precision, seed);
        const b = resolveReportedLocation(anchor, precision, seed);
        expect(a).toEqual(b);
      }),
      { numRuns: 300 }
    );
  });
});

describe("precision offset — Property 5: seed sensitivity", () => {
  test("distinct seeds yield distinct offsets for the same anchor", () => {
    fc.assert(
      fc.property(
        inRangeAnchorArb,
        // A non-degenerate radius so distinct draws map to distinct points.
        fc.integer({ min: 1000, max: MAX_PRECISION_RADIUS_M }),
        seedArb,
        seedArb,
        (anchor, radiusMeters, seedA, seedB) => {
          fc.pre(seedA !== seedB);
          const precision: LocationPrecision = { mode: "approximate", radiusMeters };
          const a = resolveReportedLocation(anchor, precision, seedA);
          const b = resolveReportedLocation(anchor, precision, seedB);
          // Overwhelmingly likely to differ; a full 64-bit-ish collision is
          // astronomically improbable.
          expect(a.latitude !== b.latitude || a.longitude !== b.longitude).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe("precision offset — Property 6: directional spread / area-uniform disk", () => {
  test("offsets spread over all bearings with mean distance ~ 2R/3", () => {
    const anchor: ReportedCoordinates = { latitude: 37.7749, longitude: -122.4194 };
    const radius = 5000;
    const precision: LocationPrecision = { mode: "approximate", radiusMeters: radius };
    const N = 3000;

    let sumDist = 0;
    let minDist = Infinity;
    let maxDist = 0;
    const quadrants = new Set<number>();

    for (let seed = 1; seed <= N; seed++) {
      const out = resolveReportedLocation(anchor, precision, seed);
      const dist = haversineMeters(anchor.latitude, anchor.longitude, out.latitude, out.longitude);
      sumDist += dist;
      minDist = Math.min(minDist, dist);
      maxDist = Math.max(maxDist, dist);

      const north = out.latitude - anchor.latitude;
      const east = out.longitude - anchor.longitude;
      // Bucket the bearing into one of four quadrants by sign.
      quadrants.add((north >= 0 ? 0 : 2) + (east >= 0 ? 0 : 1));
    }

    const meanDist = sumDist / N;

    // Bearings should populate all four quadrants (not stuck on one direction).
    expect(quadrants.size).toBe(4);

    // sqrt-scaled radius → points reach near the edge and near the center.
    expect(minDist).toBeLessThan(radius * 0.3);
    expect(maxDist).toBeGreaterThan(radius * 0.9);

    // Area-uniform disk has E[distance] = 2R/3 ≈ 0.667R; allow slack for N.
    expect(meanDist).toBeGreaterThan(radius * 0.6);
    expect(meanDist).toBeLessThan(radius * 0.73);
  });
});

describe("offsetHash01", () => {
  test("is deterministic for identical inputs", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer(),
        (seed, lat, lon, salt) => {
          expect(offsetHash01(seed, lat, lon, salt)).toBe(offsetHash01(seed, lat, lon, salt));
        }
      ),
      { numRuns: 300 }
    );
  });

  test("always returns a value in [0, 1)", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer(),
        (seed, lat, lon, salt) => {
          const v = offsetHash01(seed, lat, lon, salt);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      ),
      { numRuns: 300 }
    );
  });

  test("different salts generally yield different draws for the same coordinate", () => {
    const anchor = { lat: 51.5074, lon: -0.1278 };
    let differ = 0;
    const trials = 500;
    for (let seed = 0; seed < trials; seed++) {
      const a = offsetHash01(seed, anchor.lat, anchor.lon, 0x9e3779b9);
      const b = offsetHash01(seed, anchor.lat, anchor.lon, 0x85ebca6b);
      if (a !== b) differ++;
    }
    // Independent draws should almost always differ.
    expect(differ).toBeGreaterThan(trials - 5);
  });
});
