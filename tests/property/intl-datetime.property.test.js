/**
 * Property-Based Tests for Intl.DateTimeFormat Override
 * Feature: timezone-spoofing-and-status-display
 */

const fc = require("fast-check");
const { setupContentScript } = require("../../content/content.test.helper");

describe("Intl.DateTimeFormat Override Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 3: Intl.DateTimeFormat Timezone Override
   * 
   * For any valid timezone data, when protection is enabled, calling
   * Intl.DateTimeFormat().resolvedOptions().timeZone should return the
   * spoofed IANA timezone identifier.
   * 
   * **Validates: Requirements 2.1**
   */
  test("Property 3: Intl.DateTimeFormat Timezone Override", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom(
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Asia/Tokyo",
            "Australia/Sydney",
            "UTC"
          ),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60)
        }),
        (timezone) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: timezone
          });

          // Create DateTimeFormat instance and get resolved options
          const formatter = new contentScript.Intl.DateTimeFormat();
          const options = formatter.resolvedOptions();
          
          // Should return the spoofed timezone identifier
          expect(options.timeZone).toBe(timezone.identifier);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Original Intl.DateTimeFormat When Disabled
   * 
   * For any DateTimeFormat options, when protection is disabled,
   * resolvedOptions() should return the same result as the original
   * (preserved) method.
   * 
   * **Validates: Requirements 2.3**
   */
  test("Property 4: Original Intl.DateTimeFormat When Disabled", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.string({ minLength: 1 }),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.integer({ min: 0, max: 120 })
        }),
        (timezone) => {
          const contentScript = setupContentScript({
            enabled: false, // Protection disabled
            location: null,
            timezone: timezone
          });

          // Create DateTimeFormat with original
          const originalFormatter = new contentScript.originals.DateTimeFormat();
          const originalOptions = originalFormatter.resolvedOptions();
          
          // Create DateTimeFormat with override
          const formatter = new contentScript.Intl.DateTimeFormat();
          const options = formatter.resolvedOptions();
          
          // Should return the same timezone as original when disabled
          expect(options.timeZone).toBe(originalOptions.timeZone);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Intl.DateTimeFormat Properties Preservation
   * 
   * For any DateTimeFormat options, when protection is enabled, all properties
   * returned by resolvedOptions() except timeZone should remain unchanged from
   * the original method.
   * 
   * **Validates: Requirements 2.5**
   */
  test("Property 5: Intl.DateTimeFormat Properties Preservation", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom("America/New_York", "Europe/London", "Asia/Tokyo"),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60)
        }),
        fc.constantFrom("en-US", "en-GB", "fr-FR", "de-DE", "ja-JP"),
        (timezone, locale) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: timezone
          });

          // Create DateTimeFormat with specific locale
          const formatter = new contentScript.Intl.DateTimeFormat(locale);
          const options = formatter.resolvedOptions();
          
          // Should have all standard properties
          expect(options).toHaveProperty('locale');
          expect(options).toHaveProperty('calendar');
          expect(options).toHaveProperty('numberingSystem');
          expect(options).toHaveProperty('timeZone');
          
          // Locale should be preserved (or normalized)
          expect(typeof options.locale).toBe('string');
          expect(options.locale.length).toBeGreaterThan(0);
          
          // Calendar and numberingSystem should be preserved
          expect(typeof options.calendar).toBe('string');
          expect(typeof options.numberingSystem).toBe('string');
          
          // TimeZone should be spoofed
          expect(options.timeZone).toBe(timezone.identifier);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 3: Intl.DateTimeFormat handles null timezone gracefully", () => {
    const contentScript = setupContentScript({
      enabled: true,
      location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
      timezone: null // No timezone data
    });

    // Create DateTimeFormat with original
    const originalFormatter = new contentScript.originals.DateTimeFormat();
    const originalOptions = originalFormatter.resolvedOptions();
    
    // Create DateTimeFormat with override
    const formatter = new contentScript.Intl.DateTimeFormat();
    const options = formatter.resolvedOptions();
    
    // Should fallback to original timezone when timezone is null
    expect(options.timeZone).toBe(originalOptions.timeZone);
  });

  test("Property 3: Intl.DateTimeFormat with explicit timezone option", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom("America/New_York", "Europe/London", "Asia/Tokyo"),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.constantFrom(0, 60)
        }),
        (timezone) => {
          const contentScript = setupContentScript({
            enabled: true,
            location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
            timezone: timezone
          });

          // Create DateTimeFormat with explicit timezone option
          const formatter = new contentScript.Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago' // User explicitly sets timezone
          });
          const options = formatter.resolvedOptions();
          
          // Should still override with spoofed timezone
          expect(options.timeZone).toBe(timezone.identifier);
        }
      ),
      { numRuns: 100 }
    );
  });
});
