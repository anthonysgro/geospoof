/**
 * Property-Based Tests for Offline Timezone Lookup
 * Feature: offline-timezone-lookup
 *
 * Tests the browser-geo-tz-based timezone resolution in src/background/timezone.ts.
 */

import fc from "fast-check";
import { importBackground } from "../helpers/import-background";

// Mock browser-geo-tz at the module level
vi.mock("browser-geo-tz", () => ({
  init: vi.fn(() => ({
    find: vi.fn().mockResolvedValue([]),
  })),
}));

/**
 * Helper: get the mocked `find` function from the object returned by `init`.
 */
async function getMockedFind() {
  const mod = await import("browser-geo-tz");
  const initMock = vi.mocked(mod.init);
  // Get the most recent init() call result (importBackground resets modules, so init is called fresh each time)
  const results = initMock.mock.results;
  const lastResult = results[results.length - 1];
  if (lastResult && lastResult.type === "return") {
    return vi.mocked((lastResult.value as { find: ReturnType<typeof vi.fn> }).find);
  }
  // Fallback: re-configure the mock to return a controllable find
  const findFn = vi.fn().mockResolvedValue([]);
  initMock.mockReturnValue({ find: findFn });
  return findFn;
}

/**
 * Helper: parse a short-offset timezone name into minutes (mirrors the implementation).
 */
function parseShortOffset(tzName: string): number {
  if (tzName === "GMT" || tzName === "UTC") return 0;
  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] || "0", 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Helper: compute the expected current offset for an IANA identifier using Intl API.
 */
function expectedIntlOffset(identifier: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: identifier,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  return parseShortOffset(tzPart?.value ?? "GMT");
}

// Well-known IANA timezone identifiers for testing
const KNOWN_TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

/**
 * Feature: offline-timezone-lookup, Property 1: Offline resolution returns valid timezone for any coordinates
 *
 * For any latitude in [-90, 90] and longitude in [-180, 180],
 * `getTimezoneForCoordinates` returns a Timezone with a valid IANA identifier,
 * finite offset, and finite dstOffset. No GeoNames API calls are made.
 *
 * Validates: Requirements 1.1, 2.2, 3.3, 6.1
 */
test("Property 1: Offline resolution returns valid timezone for any coordinates", async () => {
  const mockedFind = await getMockedFind();

  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: -90, max: 90, noNaN: true }),
      fc.double({ min: -180, max: 180, noNaN: true }),
      async (latitude, longitude) => {
        const { getTimezoneForCoordinates, clearTimezoneCache, isValidIANATimezone } =
          await importBackground();
        await clearTimezoneCache();

        // Mock find to return a known timezone
        mockedFind.mockResolvedValue(["America/New_York"]);

        const tz = await getTimezoneForCoordinates(latitude, longitude);

        // Must have a valid IANA identifier
        expect(isValidIANATimezone(tz.identifier)).toBe(true);
        // Offset must be finite
        expect(Number.isFinite(tz.offset)).toBe(true);
        // dstOffset must be finite
        expect(Number.isFinite(tz.dstOffset)).toBe(true);
        // No GeoNames API calls
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Feature: offline-timezone-lookup, Property 2: Offset matches Intl API for resolved timezone
 *
 * For any coordinates resolving to a non-fallback timezone, the offset field
 * equals the UTC offset in minutes that Intl.DateTimeFormat reports for the
 * resolved identifier at the current time.
 *
 * Validates: Requirements 1.4
 */
test("Property 2: Offset matches Intl API for resolved timezone", async () => {
  const mockedFind = await getMockedFind();

  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: -90, max: 90, noNaN: true }),
      fc.double({ min: -180, max: 180, noNaN: true }),
      fc.constantFrom(...KNOWN_TIMEZONES),
      async (latitude, longitude, tzId) => {
        const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
        await clearTimezoneCache();

        mockedFind.mockResolvedValue([tzId]);

        const tz = await getTimezoneForCoordinates(latitude, longitude);

        // Should not be a fallback
        expect(tz.fallback).toBeUndefined();
        // Offset should match what Intl reports
        expect(tz.offset).toBe(expectedIntlOffset(tzId));
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Feature: offline-timezone-lookup, Property 3: Fallback behavior for uncovered coordinates
 *
 * When browser-geo-tz find() returns an empty array or throws, the result has
 * fallback: true, an Etc/GMT±N identifier, offset = Math.round(longitude / 15) * 60,
 * and dstOffset = 0.
 *
 * Validates: Requirements 3.1, 3.2
 */
test("Property 3: Fallback behavior for uncovered coordinates", async () => {
  const mockedFind = await getMockedFind();

  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: -180, max: 180, noNaN: true }),
      fc.boolean(), // true = empty array, false = throw
      async (longitude, emptyVsThrow) => {
        const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
        await clearTimezoneCache();

        if (emptyVsThrow) {
          mockedFind.mockResolvedValue([]);
        } else {
          mockedFind.mockRejectedValue(new Error("CDN failure"));
        }

        // Use latitude 0 to keep it simple — the property is about longitude-based fallback
        const tz = await getTimezoneForCoordinates(0, longitude);

        const expectedOffset = Math.round(longitude / 15) * 60;
        const offsetHours = Math.round(expectedOffset / 60);

        let expectedIdentifier: string;
        if (offsetHours === 0) {
          expectedIdentifier = "Etc/GMT";
        } else if (offsetHours > 0) {
          expectedIdentifier = `Etc/GMT-${offsetHours}`;
        } else {
          expectedIdentifier = `Etc/GMT+${Math.abs(offsetHours)}`;
        }

        expect(tz.fallback).toBe(true);
        expect(tz.identifier).toBe(expectedIdentifier);
        expect(tz.offset).toBe(expectedOffset);
        expect(tz.dstOffset).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Feature: offline-timezone-lookup, Property 4: Cache idempotency
 *
 * Calling getTimezoneForCoordinates twice with the same coordinates returns
 * deeply equal results, and the underlying find() is invoked only once
 * (second call served from cache).
 *
 * Validates: Requirements 4.2
 */
test("Property 4: Cache idempotency", async () => {
  const mockedFind = await getMockedFind();

  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: -90, max: 90, noNaN: true }),
      fc.double({ min: -180, max: 180, noNaN: true }),
      async (latitude, longitude) => {
        const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
        await clearTimezoneCache();
        mockedFind.mockClear();

        mockedFind.mockResolvedValue(["Europe/London"]);

        const first = await getTimezoneForCoordinates(latitude, longitude);
        const second = await getTimezoneForCoordinates(latitude, longitude);

        // Results should be deeply equal
        expect(second).toEqual(first);
        // find() should only have been called once (second call from cache)
        expect(mockedFind).toHaveBeenCalledTimes(1);
      }
    ),
    { numRuns: 100 }
  );
});
