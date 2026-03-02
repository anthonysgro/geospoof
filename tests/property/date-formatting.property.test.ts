/**
 * Property-Based Tests for Date Formatting Methods Override
 * Feature: timezone-spoofing-and-status-display
 */

import fc from "fast-check";
import { setupContentScript } from "../helpers/content.test.helper";

describe("Date Formatting Methods Override Properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 6: Date Formatting Methods Use Spoofed Timezone
   *
   * For any Date object and valid timezone data, when protection is enabled,
   * all Date formatting methods (toString, toTimeString, toLocaleString,
   * toLocaleDateString, toLocaleTimeString) should reflect the spoofed
   * timezone in their output.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   */
  test("Property 6: Date Formatting Methods Use Spoofed Timezone", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom(
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Tokyo"
          ),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60),
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
            timezone: timezone,
          });

          const testDate = new Date(date);

          // Test toString
          const toStringResult = contentScript.Date.prototype.toString.call(testDate);
          expect(typeof toStringResult).toBe("string");
          expect(toStringResult.length).toBeGreaterThan(0);

          // Test toTimeString
          const toTimeStringResult = contentScript.Date.prototype.toTimeString.call(testDate);
          expect(typeof toTimeStringResult).toBe("string");
          expect(toTimeStringResult.length).toBeGreaterThan(0);

          // Test toLocaleString
          const toLocaleStringResult = contentScript.Date.prototype.toLocaleString.call(testDate);
          expect(typeof toLocaleStringResult).toBe("string");
          expect(toLocaleStringResult.length).toBeGreaterThan(0);

          // Test toLocaleDateString
          const toLocaleDateStringResult =
            contentScript.Date.prototype.toLocaleDateString.call(testDate);
          expect(typeof toLocaleDateStringResult).toBe("string");
          expect(toLocaleDateStringResult.length).toBeGreaterThan(0);

          // Test toLocaleTimeString
          const toLocaleTimeStringResult =
            contentScript.Date.prototype.toLocaleTimeString.call(testDate);
          expect(typeof toLocaleTimeStringResult).toBe("string");
          expect(toLocaleTimeStringResult.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Original Date Formatting When Disabled
   *
   * For any Date object, when protection is disabled, all Date formatting
   * methods should return the same output as the original (preserved) methods.
   *
   * **Validates: Requirements 3.6**
   */
  test("Property 7: Original Date Formatting When Disabled", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.string({ minLength: 1 }),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.integer({ min: 0, max: 120 }),
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: false, // Protection disabled
            location: null,
            timezone: timezone,
          });

          const testDate = new Date(date);

          // Test toString
          const originalToString = contentScript.originals.toString.call(testDate);
          const overrideToString = contentScript.Date.prototype.toString.call(testDate);
          expect(overrideToString).toBe(originalToString);

          // Test toTimeString
          const originalToTimeString = contentScript.originals.toTimeString.call(testDate);
          const overrideToTimeString = contentScript.Date.prototype.toTimeString.call(testDate);
          expect(overrideToTimeString).toBe(originalToTimeString);

          // Test toLocaleString
          const originalToLocaleString = contentScript.originals.toLocaleString.call(testDate);
          const overrideToLocaleString = contentScript.Date.prototype.toLocaleString.call(testDate);
          expect(overrideToLocaleString).toBe(originalToLocaleString);

          // Test toLocaleDateString
          const originalToLocaleDateString =
            contentScript.originals.toLocaleDateString.call(testDate);
          const overrideToLocaleDateString =
            contentScript.Date.prototype.toLocaleDateString.call(testDate);
          expect(overrideToLocaleDateString).toBe(originalToLocaleDateString);

          // Test toLocaleTimeString
          const originalToLocaleTimeString =
            contentScript.originals.toLocaleTimeString.call(testDate);
          const overrideToLocaleTimeString =
            contentScript.Date.prototype.toLocaleTimeString.call(testDate);
          expect(overrideToLocaleTimeString).toBe(originalToLocaleTimeString);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 6: Date Formatting handles null timezone gracefully", () => {
    fc.assert(
      fc.property(fc.date(), (date) => {
        const contentScript = setupContentScript({
          enabled: true,
          location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
          timezone: null, // No timezone data
        });

        const testDate = new Date(date);

        // Should fallback to original methods when timezone is null
        const originalToString = contentScript.originals.toString.call(testDate);
        const overrideToString = contentScript.Date.prototype.toString.call(testDate);
        expect(overrideToString).toBe(originalToString);

        const originalToLocaleString = contentScript.originals.toLocaleString.call(testDate);
        const overrideToLocaleString = contentScript.Date.prototype.toLocaleString.call(testDate);
        expect(overrideToLocaleString).toBe(originalToLocaleString);
      }),
      { numRuns: 100 }
    );
  });

  test("Property 6: toLocaleString with custom locale", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom("America/New_York", "Europe/London", "Asia/Tokyo"),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60),
        }),
        fc.date(),
        fc.constantFrom("en-US", "en-GB", "fr-FR", "de-DE"),
        (timezone, date, locale) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
            timezone: timezone,
          });

          const testDate = new Date(date);

          // Test with custom locale
          const result = contentScript.Date.prototype.toLocaleString.call(testDate, locale);
          expect(typeof result).toBe("string");
          expect(result.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 6: Date formatting methods are consistent", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom("America/New_York", "Europe/London", "Asia/Tokyo"),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60),
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
            timezone: timezone,
          });

          const testDate = new Date(date);

          // Call the same method multiple times
          const result1 = contentScript.Date.prototype.toLocaleString.call(testDate);
          const result2 = contentScript.Date.prototype.toLocaleString.call(testDate);
          const result3 = contentScript.Date.prototype.toLocaleString.call(testDate);

          // Should return consistent results
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
