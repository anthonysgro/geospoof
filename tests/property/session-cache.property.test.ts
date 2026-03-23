/**
 * Property-Based Tests for Session Cache
 * Feature: mv3-manifest-compat, Property 1: Session cache round-trip
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * For any cache entry type (LocationName, Timezone, IpGeolocationResult, or number)
 * and any valid value of that type, writing the value to session storage via sessionSet
 * and then reading it back via sessionGet with the same key should produce a value
 * deeply equal to the original.
 */

import fc from "fast-check";
import { sessionGet, sessionSet } from "@/background/session-cache";

/** Arbitrary for LocationName values (reverse geocode cache entries) */
const locationNameArb = fc.record({
  city: fc.string({ minLength: 0, maxLength: 50 }),
  country: fc.string({ minLength: 0, maxLength: 50 }),
  displayName: fc.string({ minLength: 0, maxLength: 100 }),
});

/** Arbitrary for Timezone values (timezone cache entries) */
const timezoneArb = fc.record({
  identifier: fc.constantFrom(
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Etc/GMT",
    "Etc/GMT-5",
    "Etc/GMT+8"
  ),
  offset: fc.integer({ min: -720, max: 840 }),
  dstOffset: fc.integer({ min: 0, max: 60 }),
  fallback: fc.option(fc.boolean(), { nil: undefined }),
});

/** Arbitrary for IpGeolocationResult values (VPN IP geo cache entries) */
const ipGeoResultArb = fc.record({
  latitude: fc.double({ min: -90, max: 90, noNaN: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true }),
  city: fc.string({ minLength: 0, maxLength: 50 }),
  country: fc.string({ minLength: 0, maxLength: 50 }),
  ip: fc.ipV4(),
});

/** Arbitrary for rate limiter timestamps */
const timestampArb = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });

/** Arbitrary for cache keys (alphanumeric with colons for namespacing) */
const cacheKeyArb = fc.stringMatching(/^[a-zA-Z0-9:._-]{1,50}$/);

test("Property 1: Session cache round-trip — LocationName", async () => {
  await fc.assert(
    fc.asyncProperty(cacheKeyArb, locationNameArb, async (key, value) => {
      await sessionSet(key, value);
      const retrieved = await sessionGet(key);
      expect(retrieved).toEqual(value);
    }),
    { numRuns: 100 }
  );
});

test("Property 1: Session cache round-trip — Timezone", async () => {
  await fc.assert(
    fc.asyncProperty(cacheKeyArb, timezoneArb, async (key, value) => {
      await sessionSet(key, value);
      const retrieved = await sessionGet(key);
      expect(retrieved).toEqual(value);
    }),
    { numRuns: 100 }
  );
});

test("Property 1: Session cache round-trip — IpGeolocationResult", async () => {
  await fc.assert(
    fc.asyncProperty(cacheKeyArb, ipGeoResultArb, async (key, value) => {
      await sessionSet(key, value);
      const retrieved = await sessionGet(key);
      expect(retrieved).toEqual(value);
    }),
    { numRuns: 100 }
  );
});

test("Property 1: Session cache round-trip — number (rate limiter timestamp)", async () => {
  await fc.assert(
    fc.asyncProperty(cacheKeyArb, timestampArb, async (key, value) => {
      await sessionSet(key, value);
      const retrieved = await sessionGet<number>(key);
      expect(retrieved).toBe(value);
    }),
    { numRuns: 100 }
  );
});
