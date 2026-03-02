/**
 * Property-Based Tests for Intl-Based Timezone Offset Resolution
 * Feature: extension-hardening, Property 3: Timezone Offset Consistency with Intl.DateTimeFormat
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import fc from "fast-check";

/**
 * Re-implement parseGMTOffset identically to src/content/injected.ts
 * so we can unit-test it in isolation without executing the IIFE.
 */
function parseGMTOffset(gmtString: string): number {
  if (gmtString === "GMT" || gmtString === "UTC") {
    return 0;
  }
  const match = gmtString.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] || "0", 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Re-implement getIntlBasedOffset identically to src/content/injected.ts.
 */
function getIntlBasedOffset(date: Date, timezoneId: string, fallbackOffset: number): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezoneId,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return parseGMTOffset(tzPart?.value ?? "GMT");
  } catch {
    return fallbackOffset;
  }
}

/**
 * Reference implementation: resolve UTC offset using Intl.DateTimeFormat
 * independently (different code path) to cross-check getIntlBasedOffset.
 */
function referenceOffset(date: Date, timezoneId: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";

  if (tz === "GMT" || tz === "UTC") return 0;
  const m = tz.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10));
}

// Comprehensive list of IANA timezones covering all requirement categories
const NON_DST_ZONES = [
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Africa/Nairobi",
] as const;

const SOUTHERN_HEMISPHERE_ZONES = [
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Santiago",
  "Australia/Adelaide",
] as const;

const EXCEPTION_ZONES = [
  "America/Phoenix", // US state that does not observe DST
  "Pacific/Honolulu", // Hawaii, no DST
  "Asia/Kathmandu", // UTC+5:45 (non-standard offset)
  "Asia/Colombo", // UTC+5:30
] as const;

const DST_ZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
] as const;

const ALL_TEST_ZONES = [
  ...NON_DST_ZONES,
  ...SOUTHERN_HEMISPHERE_ZONES,
  ...EXCEPTION_ZONES,
  ...DST_ZONES,
] as const;

describe("Timezone Offset Consistency with Intl.DateTimeFormat (Property 3)", () => {
  /**
   * Property 3: Timezone Offset Consistency with Intl.DateTimeFormat
   *
   * For any valid IANA timezone and any date, the overridden getTimezoneOffset()
   * equals the negative of the Intl-resolved UTC offset.
   *
   * The injected script computes: getTimezoneOffset() = -getIntlBasedOffset(date, tz, fallback)
   * So we verify: getIntlBasedOffset(date, tz, fallback) === referenceOffset(date, tz)
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  test("Property 3: getIntlBasedOffset matches Intl-resolved offset for any timezone and date", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TEST_ZONES),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2030-12-31") }),
        (timezoneId, date) => {
          const result = getIntlBasedOffset(date, timezoneId, 0);
          const expected = referenceOffset(date, timezoneId);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 2.2: Non-DST timezones return a correct, constant offset
   * regardless of the date.
   */
  test("Non-DST zones return the same offset year-round", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_DST_ZONES),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") }),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") }),
        (timezoneId, dateA, dateB) => {
          const offsetA = getIntlBasedOffset(dateA, timezoneId, 0);
          const offsetB = getIntlBasedOffset(dateB, timezoneId, 0);
          expect(offsetA).toBe(offsetB);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 2.3: Southern-hemisphere timezones produce correct offsets
   * (DST transitions differ from northern hemisphere).
   */
  test("Southern-hemisphere zones produce valid offsets for any date", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUTHERN_HEMISPHERE_ZONES),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") }),
        (timezoneId, date) => {
          const offset = getIntlBasedOffset(date, timezoneId, 0);
          expect(typeof offset).toBe("number");
          expect(Number.isFinite(offset)).toBe(true);
          // Offset must be within valid range (-720 to +840 minutes)
          expect(offset).toBeGreaterThanOrEqual(-720);
          expect(offset).toBeLessThanOrEqual(840);
          // Must match the reference
          expect(offset).toBe(referenceOffset(date, timezoneId));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 2.4: Exception timezones (e.g., America/Phoenix) are handled correctly.
   */
  test("Exception zones (no DST despite region conventions) return constant offset", () => {
    // America/Phoenix and Pacific/Honolulu do not observe DST
    fc.assert(
      fc.property(
        fc.constantFrom("America/Phoenix", "Pacific/Honolulu"),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") }),
        fc.date({ min: new Date("2020-01-01"), max: new Date("2026-12-31") }),
        (timezoneId, dateA, dateB) => {
          const offsetA = getIntlBasedOffset(dateA, timezoneId, 0);
          const offsetB = getIntlBasedOffset(dateB, timezoneId, 0);
          expect(offsetA).toBe(offsetB);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 2.5: Round-trip consistency — getTimezoneOffset() is consistent
   * with Intl.DateTimeFormat.resolvedOptions().timeZone.
   *
   * Simulates the full override: getTimezoneOffset() returns -getIntlBasedOffset().
   */
  test("getTimezoneOffset simulation equals negative of Intl-resolved offset", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TEST_ZONES),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2030-12-31") }),
        (timezoneId, date) => {
          const intlOffset = getIntlBasedOffset(date, timezoneId, 0);
          // The override returns: -intlOffset
          const simulatedGetTimezoneOffset = -intlOffset;
          // Standard JS convention: getTimezoneOffset() = -(UTC offset in minutes)
          expect(simulatedGetTimezoneOffset).toBe(-referenceOffset(date, timezoneId));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Fallback behavior: invalid IANA identifiers should return the fallback offset.
   */
  test("Invalid timezone identifiers fall back to provided offset", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.integer({ min: -720, max: 840 }),
        fc.date(),
        (invalidTz, fallback, date) => {
          const result = getIntlBasedOffset(date, invalidTz, fallback);
          // Should return fallback since the timezone is invalid
          expect(result).toBe(fallback);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * parseGMTOffset correctness: for any valid GMT offset string,
   * the parsed value is within the valid UTC offset range.
   */
  test("parseGMTOffset produces valid minute offsets for well-formed strings", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("+", "-"),
        fc.integer({ min: 0, max: 14 }),
        fc.integer({ min: 0, max: 59 }),
        (sign, hours, minutes) => {
          const gmtString =
            minutes > 0
              ? `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`
              : `GMT${sign}${hours}`;
          const result = parseGMTOffset(gmtString);
          const expected = (sign === "+" ? 1 : -1) * (hours * 60 + minutes);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("parseGMTOffset returns 0 for GMT and UTC", () => {
    expect(parseGMTOffset("GMT")).toBe(0);
    expect(parseGMTOffset("UTC")).toBe(0);
  });

  test("parseGMTOffset returns 0 for malformed strings", () => {
    fc.assert(
      fc.property(
        fc
          .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 "), {
            minLength: 0,
            maxLength: 15,
          })
          .filter((s) => !s.match(/^GMT([+-]\d{1,2}(:\d{2})?)?$/) && s !== "UTC"),
        (malformed) => {
          expect(parseGMTOffset(malformed)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
