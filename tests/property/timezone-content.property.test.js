/**
 * Property-Based Tests for Timezone API Override in Content Script
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require("fast-check");
const { setupContentScript } = require("../../content/content.test.helper");

describe("Timezone API Override Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 5: Timezone Override Consistency
   * 
   * For any timezone override, both Date.prototype.getTimezoneOffset() and
   * Intl.DateTimeFormat().resolvedOptions().timeZone should return values
   * consistent with the overridden timezone.
   * 
   * Validates: Requirements 2.2, 2.3
   */
  test("Property 5: Timezone Override Consistency", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          identifier: fc.constantFrom(
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "Asia/Tokyo",
            "Australia/Sydney",
            "America/Chicago",
            "Europe/Paris",
            "Asia/Shanghai"
          ),
          offset: fc.integer({ min: -720, max: 720 }), // -12 to +12 hours in minutes
          dstOffset: fc.constantFrom(0, 60) // Add dstOffset for validation
        }),
        async (timezoneOverride) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
            timezone: timezoneOverride
          });

          // Test Date.prototype.getTimezoneOffset
          const date = new Date();
          const timezoneOffset = contentScript.Date.prototype.getTimezoneOffset.call(date);
          
          // JavaScript getTimezoneOffset returns inverted offset
          expect(timezoneOffset).toBe(-timezoneOverride.offset);

          // Test Intl.DateTimeFormat
          const formatter = new contentScript.Intl.DateTimeFormat();
          const resolvedOptions = formatter.resolvedOptions();
          
          expect(resolvedOptions.timeZone).toBe(timezoneOverride.identifier);
        }
      ),
      { numRuns: 100 }
    );
  });
});

  /**
   * Property 7: Timezone Disable Restores Original Behavior
   * 
   * For any initial timezone state, enabling timezone override then disabling
   * protection should restore the original timezone behavior.
   * 
   * Validates: Requirements 2.5
   */
  test("Property 7: Timezone Disable Restores Original Behavior", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          identifier: fc.constantFrom(
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "Asia/Tokyo"
          ),
          offset: fc.integer({ min: -720, max: 720 }),
          dstOffset: fc.constantFrom(0, 60) // Add dstOffset for validation
        }),
        async (timezoneOverride) => {
          // Get original timezone offset before any overrides
          const originalDate = new Date();
          const originalOffset = Date.prototype.getTimezoneOffset.call(originalDate);

          // Start with protection enabled
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
            timezone: timezoneOverride
          });

          // Verify timezone is overridden
          const date1 = new Date();
          const overriddenOffset = contentScript.Date.prototype.getTimezoneOffset.call(date1);
          expect(overriddenOffset).toBe(-timezoneOverride.offset);

          // Disable protection
          contentScript.updateSettings({ enabled: false });

          // Verify timezone is restored to original
          const date2 = new Date();
          const restoredOffset = contentScript.Date.prototype.getTimezoneOffset.call(date2);
          expect(restoredOffset).toBe(originalOffset);
        }
      ),
      { numRuns: 100 }
    );
  });
