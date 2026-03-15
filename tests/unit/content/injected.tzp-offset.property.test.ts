/**
 * Property-Based Tests for TZP Offset Consistency
 * Feature: tzp-offset-consistency
 *
 * Tests correctness properties for epoch adjustment, Date numeric coercion,
 * Date.parse consistency, and local getter round-trip using fast-check.
 */
import fc from "fast-check";
import { setupContentScript } from "../../helpers/content.test.helper";

/** Representative IANA timezones covering DST, non-DST, half-hour, and southern hemisphere. */
const TEST_ZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Singapore",
  "Africa/Nairobi",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Santiago",
  "America/Phoenix",
  "Pacific/Honolulu",
] as const;

/** Resolve the real UTC offset (minutes east of UTC) for a date and IANA timezone via Intl. */
function resolveRealOffset(date: Date, timezoneId: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(date);
  const tzVal = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  if (tzVal === "GMT" || tzVal === "UTC") return 0;
  // Handle GMT±H:MM:SS (historical sub-minute offsets like GMT+0:53:28)
  const m = tzVal.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  const seconds = parseInt(m[4] || "0", 10);
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10) + (seconds >= 30 ? 1 : 0));
}

/** Arbitrary for a timezone identifier from the test set. */
const arbTimezoneId = fc.constantFrom(...TEST_ZONES);

/** Months as full English names for building ambiguous date strings. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Arbitrary for an ambiguous date string in "Month DD, YYYY HH:MM:SS" format.
 * Avoids DST gap hours by using safe hour ranges and day=1-28.
 */
const arbAmbiguousDateString = fc
  .record({
    year: fc.integer({ min: 2000, max: 2030 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 4, max: 22 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  })
  .map(
    ({ year, month, day, hour, minute, second }) =>
      `${MONTHS[month]} ${day}, ${year} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
  );

/**
 * Arbitrary for valid date components (avoiding DST gap hours).
 */
const arbDateComponents = fc.record({
  year: fc.integer({ min: 2000, max: 2030 }),
  month: fc.integer({ min: 0, max: 11 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 4, max: 22 }),
  minute: fc.integer({ min: 0, max: 59 }),
  second: fc.integer({ min: 0, max: 59 }),
});

// Feature: tzp-offset-consistency, Property 1: Arithmetic offset consistency
// Validates: Requirements 1.1, 1.4, 2.3, 2.4
describe("Property 1: Arithmetic offset consistency", () => {
  test("ambiguousDate.getTime() - utcDate.getTime() equals negated spoofed UTC offset in ms", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbAmbiguousDateString, (tzId, dateStr) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const ambiguousDate = cs.DateConstructor(dateStr);
        const utcDate = cs.DateConstructor(dateStr + " UTC");

        // Both should be valid dates
        if (isNaN(ambiguousDate.getTime()) || isNaN(utcDate.getTime())) return;

        const diff = ambiguousDate.getTime() - utcDate.getTime();

        // The expected offset is the spoofed timezone's UTC offset at the UTC date's epoch,
        // resolved via Intl (which is what the adjusted epoch should reflect).
        const spoofedOffsetMinutes = resolveRealOffset(utcDate, tzId);
        const expectedDiff = spoofedOffsetMinutes === 0 ? 0 : -spoofedOffsetMinutes * 60000;

        expect(diff).toBe(expectedDiff);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 2: Date numeric coercion invariant
// Validates: Requirements 1.2, 1.3
describe("Property 2: Date numeric coercion invariant", () => {
  test("valueOf(), Symbol.toPrimitive('number'), and getTime() all return the same value", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbAmbiguousDateString, (tzId, dateStr) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const date = cs.DateConstructor(dateStr);
        if (isNaN(date.getTime())) return;

        const getTimeVal = date.getTime();
        const valueOfVal = date.valueOf();
        const toPrimVal = date[Symbol.toPrimitive]("number");

        expect(valueOfVal).toBe(getTimeVal);
        expect(toPrimVal).toBe(getTimeVal);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 3: Date.parse and Date constructor epoch consistency
// Validates: Requirements 1.5, 7.5
describe("Property 3: Date.parse and Date constructor epoch consistency", () => {
  test("Date.parse(str) equals new Date(str).getTime() for ambiguous strings", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbAmbiguousDateString, (tzId, dateStr) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const parsedEpoch = cs.DateParse(dateStr);
        const constructedEpoch = cs.DateConstructor(dateStr).getTime();

        if (isNaN(parsedEpoch) && isNaN(constructedEpoch)) return;

        expect(parsedEpoch).toBe(constructedEpoch);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 4: Local getter round-trip
// Validates: Requirements 2.1, 5.3
describe("Property 4: Local getter round-trip", () => {
  test("new Date(y,m,d,h,min,s) read back via getters returns original values", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbDateComponents, (tzId, comps) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const date = cs.DateConstructor(
          comps.year,
          comps.month,
          comps.day,
          comps.hour,
          comps.minute,
          comps.second
        );

        if (isNaN(date.getTime())) return;

        expect(cs.Date.prototype.getFullYear.call(date)).toBe(comps.year);
        expect(cs.Date.prototype.getMonth.call(date)).toBe(comps.month);
        expect(cs.Date.prototype.getDate.call(date)).toBe(comps.day);
        expect(cs.Date.prototype.getHours.call(date)).toBe(comps.hour);
        expect(cs.Date.prototype.getMinutes.call(date)).toBe(comps.minute);
        expect(cs.Date.prototype.getSeconds.call(date)).toBe(comps.second);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 5: Intl.DateTimeFormat explicit-spoofed-tz equivalence
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
describe("Property 5: Intl.DateTimeFormat explicit-spoofed-tz equivalence", () => {
  /** Arbitrary for dateStyle values. */
  const arbDateStyle = fc.constantFrom("full", "long", "medium", "short");

  /** Arbitrary for timeStyle values. */
  const arbTimeStyle = fc.constantFrom("full", "long", "medium", "short");

  /** Arbitrary for dateStyle/timeStyle combinations (at least one must be present). */
  const arbStyleOptions = fc.oneof(
    fc.record({ dateStyle: arbDateStyle }),
    fc.record({ timeStyle: arbTimeStyle }),
    fc.record({ dateStyle: arbDateStyle, timeStyle: arbTimeStyle })
  );

  /** Arbitrary for a Date epoch in a reasonable range (2000–2030). */
  const arbDateEpoch = fc.integer({
    min: new Date(2000, 0, 1).getTime(),
    max: new Date(2030, 11, 31).getTime(),
  });

  test("formatter with no timeZone and one with spoofed timeZone produce identical format() and resolvedOptions().timeZone", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbStyleOptions, arbDateEpoch, (tzId, styleOpts, epoch) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const date = new Date(epoch);

        // Formatter with no explicit timeZone (should use spoofed tz)
        const fmtDefault = cs.Intl.DateTimeFormat("en-US", styleOpts);
        // Formatter with explicit timeZone matching the spoofed tz
        const fmtExplicit = cs.Intl.DateTimeFormat("en-US", {
          ...styleOpts,
          timeZone: tzId,
        });

        // format() output must be identical
        expect(fmtExplicit.format(date)).toBe(fmtDefault.format(date));

        // resolvedOptions().timeZone must both return the spoofed tz
        const resolvedDefault = cs.Intl.resolvedOptions(fmtDefault);
        const resolvedExplicit = cs.Intl.resolvedOptions(fmtExplicit);
        expect(resolvedDefault.timeZone).toBe(tzId);
        expect(resolvedExplicit.timeZone).toBe(tzId);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 6: Multi-argument Date epoch correctness
// Validates: Requirements 5.1, 5.2
describe("Property 6: Multi-argument Date epoch correctness", () => {
  test("new Date(y,m,d,h,min,s).getTime() equals UTC epoch for those wall-clock components in the spoofed timezone", () => {
    fc.assert(
      fc.property(arbTimezoneId, arbDateComponents, (tzId, comps) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        const date = cs.DateConstructor(
          comps.year,
          comps.month,
          comps.day,
          comps.hour,
          comps.minute,
          comps.second
        );

        if (isNaN(date.getTime())) return;

        // Build the same wall-clock time as an ambiguous string and parse it
        const dateStr = `${MONTHS[comps.month]} ${comps.day}, ${comps.year} ${String(comps.hour).padStart(2, "0")}:${String(comps.minute).padStart(2, "0")}:${String(comps.second).padStart(2, "0")}`;
        const fromString = cs.DateConstructor(dateStr);

        if (isNaN(fromString.getTime())) return;

        // Both should produce the same epoch (same wall-clock in spoofed tz)
        expect(date.getTime()).toBe(fromString.getTime());
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 7: Non-ISO ambiguous string detection
// Validates: Requirements 7.4
describe("Property 7: Non-ISO ambiguous string detection", () => {
  /** Short month names for building date strings. */
  const SHORT_MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;

  /** Arbitrary for date components used in string generation. */
  const arbStringComponents = fc.record({
    year: fc.integer({ min: 2000, max: 2030 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  });

  /** Arbitrary for non-ISO format selection. */
  const arbFormat = fc.constantFrom("long", "short", "dayFirst");

  /** Build a non-ISO date string without timezone indicator. */
  function buildDateString(
    comps: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    },
    format: "long" | "short" | "dayFirst"
  ): string {
    const hh = String(comps.hour).padStart(2, "0");
    const mm = String(comps.minute).padStart(2, "0");
    const ss = String(comps.second).padStart(2, "0");
    switch (format) {
      case "long":
        return `${MONTHS[comps.month]} ${comps.day}, ${comps.year} ${hh}:${mm}:${ss}`;
      case "short":
        return `${SHORT_MONTHS[comps.month]} ${comps.day}, ${comps.year} ${hh}:${mm}:${ss}`;
      case "dayFirst":
        return `${comps.day} ${SHORT_MONTHS[comps.month]} ${comps.year} ${hh}:${mm}:${ss}`;
    }
  }

  /** Arbitrary for timezone suffixes that make a string explicit. */
  const arbTzSuffix = fc.constantFrom(" UTC", " GMT", "Z", "+00:00", "-05:00", "+05:30");

  test("non-ISO date strings without tz indicator are detected as ambiguous", () => {
    const cs = setupContentScript({
      enabled: true,
      location: { latitude: 0, longitude: 0, accuracy: 10 },
      timezone: { identifier: "Europe/Berlin", offset: 60, dstOffset: 120 },
    });

    fc.assert(
      fc.property(arbStringComponents, arbFormat, (comps, format) => {
        const str = buildDateString(comps, format);
        expect(cs.isAmbiguousDateString(str)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("non-ISO date strings with tz indicator appended are NOT ambiguous", () => {
    const cs = setupContentScript({
      enabled: true,
      location: { latitude: 0, longitude: 0, accuracy: 10 },
      timezone: { identifier: "Europe/Berlin", offset: 60, dstOffset: 120 },
    });

    fc.assert(
      fc.property(arbStringComponents, arbFormat, arbTzSuffix, (comps, format, suffix) => {
        const str = buildDateString(comps, format) + suffix;
        expect(cs.isAmbiguousDateString(str)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: tzp-offset-consistency, Property 8: Cross-source date agreement
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
describe("Property 8: Cross-source date agreement", () => {
  test("toLocaleString, toTimeString, getters, and Temporal.Now.plainDateTimeISO agree within 1 second", () => {
    fc.assert(
      fc.property(arbTimezoneId, (tzId) => {
        const cs = setupContentScript({
          enabled: true,
          location: { latitude: 0, longitude: 0, accuracy: 10 },
          timezone: { identifier: tzId, offset: 0, dstOffset: 0 },
        });

        // Capture current time from all sources
        const now = new Date();

        // Source 1: getHours/getMinutes/getSeconds
        const getterH = cs.Date.prototype.getHours.call(now);
        const getterM = cs.Date.prototype.getMinutes.call(now);
        const getterS = cs.Date.prototype.getSeconds.call(now);

        // Source 2: toLocaleString — parse hours/minutes/seconds
        const localeStr = cs.Date.prototype.toLocaleString.call(now, "en-US", {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: false,
        });
        const localeParts = localeStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);

        // Source 3: toTimeString — parse hours/minutes/seconds
        const timeStr = cs.Date.prototype.toTimeString.call(now);
        const timeParts = timeStr.match(/(\d{2}):(\d{2}):(\d{2})/);

        // Source 4: Temporal.Now.plainDateTimeISO
        const temporal = cs.Temporal.Now.plainDateTimeISO();

        // All sources should be parseable
        if (!localeParts || !timeParts) return;

        const localeH = parseInt(localeParts[1], 10);
        const localeM = parseInt(localeParts[2], 10);
        const localeS = parseInt(localeParts[3], 10);

        const timeH = parseInt(timeParts[1], 10);
        const timeM = parseInt(timeParts[2], 10);
        const timeS = parseInt(timeParts[3], 10);

        // Convert each source to total seconds for comparison
        const toSec = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

        const getterSec = toSec(getterH, getterM, getterS);
        const localeSec = toSec(localeH, localeM, localeS);
        const timeSec = toSec(timeH, timeM, timeS);
        const temporalSec = toSec(temporal.hour, temporal.minute, temporal.second);

        // All should agree within 1 second (accounting for execution time between calls)
        const sources = [getterSec, localeSec, timeSec, temporalSec];
        for (let i = 0; i < sources.length; i++) {
          for (let j = i + 1; j < sources.length; j++) {
            const diff = Math.abs(sources[i] - sources[j]);
            // Handle midnight wraparound (e.g., 86399 vs 0)
            const adjustedDiff = Math.min(diff, 86400 - diff);
            expect(adjustedDiff).toBeLessThanOrEqual(1);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
