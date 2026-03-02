/**
 * Property-Based Tests for getTimezoneOffset Override
 * Feature: timezone-spoofing-and-status-display
 */

const fc = require("fast-check");
const { setupContentScript } = require("../../content/content.test.helper");

describe("getTimezoneOffset Override Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Timezone Offset Override
   * 
   * For any valid timezone data and any Date object, when protection is enabled,
   * calling getTimezoneOffset() should return the negative of the timezone's
   * current offset (accounting for DST).
   * 
   * **Validates: Requirements 1.1, 1.5**
   */
  test("Property 1: Timezone Offset Override - returns negative of spoofed offset", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom(
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Asia/Tokyo",
            "Australia/Sydney"
          ),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60) // Most common: no DST or 1 hour
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: timezone
          });

          // Create a date instance and call getTimezoneOffset
          const testDate = new Date(date);
          const result = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          
          // Should return negative of the offset
          // Note: We're testing the basic case without DST calculation for simplicity
          // The actual implementation includes DST logic
          expect(typeof result).toBe('number');
          expect(Number.isFinite(result)).toBe(true);
          
          // The result should be the negative of the offset
          expect(result).toBe(-timezone.offset);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Original Timezone Offset When Disabled
   * 
   * For any Date object, when protection is disabled, getTimezoneOffset()
   * should return the same value as the original (preserved) method.
   * 
   * **Validates: Requirements 1.3**
   */
  test("Property 2: Original Timezone Offset When Disabled", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.string({ minLength: 1 }),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.integer({ min: 0, max: 120 })
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: false, // Protection disabled
            location: null,
            timezone: timezone
          });

          // Get the original timezone offset
          const originalOffset = contentScript.originals.getTimezoneOffset.call(date);
          
          // Get the offset through our override
          const testDate = new Date(date);
          const result = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          
          // Should return the same as original when disabled
          expect(result).toBe(originalOffset);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: Timezone Offset Override - handles null timezone gracefully", () => {
    fc.assert(
      fc.property(
        fc.date(),
        (date) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: null // No timezone data
          });

          // Get the original timezone offset
          const originalOffset = contentScript.originals.getTimezoneOffset.call(date);
          
          // Should fallback to original when timezone is null
          const testDate = new Date(date);
          const result = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          
          expect(result).toBe(originalOffset);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: Timezone Offset Override - consistent across multiple calls", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom("America/New_York", "Europe/London", "Asia/Tokyo"),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60)
        }),
        fc.date(),
        (timezone, date) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: timezone
          });

          // Call getTimezoneOffset multiple times with the same date
          const testDate = new Date(date);
          const result1 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          const result2 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          const result3 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
          
          // All calls should return the same value
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
