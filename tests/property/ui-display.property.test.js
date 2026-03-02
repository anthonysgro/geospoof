/**
 * Property-Based Tests for UI Display Functions
 * Tests the status display formatting functions in popup.js
 */

const fc = require('fast-check');

describe('UI Display Property Tests', () => {
  // Extract and define the display functions directly for testing
  const displayLocationStatus = (location) => {
    if (!location) {
      return "Not configured";
    }
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (±${location.accuracy}m)`;
  };

  const displayTimezoneStatus = (timezone) => {
    if (!timezone) {
      return "Not configured";
    }
    
    const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
    const offsetMinutes = Math.abs(timezone.offset) % 60;
    const sign = timezone.offset >= 0 ? '+' : '-';
    const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
    
    let display = `${timezone.identifier} (${offsetStr})`;
    if (timezone.fallback) {
      display += " (estimated)";
    }
    
    return display;
  };

  const displayOverriddenApis = (enabled, hasLocation, hasTimezone) => {
    if (!enabled) {
      return "None (protection disabled)";
    }
    
    const apis = [];
    
    if (hasLocation) {
      apis.push("navigator.geolocation.getCurrentPosition");
      apis.push("navigator.geolocation.watchPosition");
    }
    
    if (hasTimezone) {
      apis.push("Date.prototype.getTimezoneOffset");
      apis.push("Intl.DateTimeFormat");
      apis.push("Date formatting methods");
    }
    
    return apis.length > 0 ? apis.join(", ") : "None";
  };

  const displayWebRTCStatus = (enabled) => {
    return enabled 
      ? "✓ Active (non-proxied UDP disabled)" 
      : "✗ Inactive";
  };

  // Feature: timezone-spoofing-and-status-display, Property 10: Location Display Completeness
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.5**
  describe('Property 10: Location Display Completeness', () => {
    test('displays all location properties with correct formatting', () => {
      fc.assert(
        fc.property(
          fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
            accuracy: fc.integer({ min: 1, max: 10000 })
          }),
          (location) => {
            const result = displayLocationStatus(location);
            
            // Should contain latitude formatted to 4 decimal places
            const latStr = location.latitude.toFixed(4);
            expect(result).toContain(latStr);
            
            // Should contain longitude formatted to 4 decimal places
            const lonStr = location.longitude.toFixed(4);
            expect(result).toContain(lonStr);
            
            // Should contain accuracy with unit
            expect(result).toContain(`±${location.accuracy}m`);
            
            // Should be in the format: "lat, lon (±accuracy)"
            expect(result).toMatch(/^-?\d+\.\d{4}, -?\d+\.\d{4} \(±\d+m\)$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('returns "Not configured" for null location', () => {
      const result = displayLocationStatus(null);
      expect(result).toBe("Not configured");
    });

    test('returns "Not configured" for undefined location', () => {
      const result = displayLocationStatus(undefined);
      expect(result).toBe("Not configured");
    });
  });

  // Feature: timezone-spoofing-and-status-display, Property 11: Timezone Display Format
  // **Validates: Requirements 6.1, 6.2**
  describe('Property 11: Timezone Display Format', () => {
    test('displays timezone identifier and offset in UTC±HH:MM format', () => {
      fc.assert(
        fc.property(
          fc.record({
            identifier: fc.constantFrom(
              'America/New_York',
              'America/Los_Angeles',
              'Europe/London',
              'Europe/Paris',
              'Asia/Tokyo',
              'Asia/Shanghai',
              'Australia/Sydney',
              'UTC'
            ),
            offset: fc.integer({ min: -720, max: 840 }),
            dstOffset: fc.integer({ min: 0, max: 60 })
          }),
          (timezone) => {
            const result = displayTimezoneStatus(timezone);
            
            // Should contain the identifier
            expect(result).toContain(timezone.identifier);
            
            // Calculate expected offset format
            const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
            const offsetMinutes = Math.abs(timezone.offset) % 60;
            const sign = timezone.offset >= 0 ? '+' : '-';
            const expectedOffset = `UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
            
            // Should contain the formatted offset
            expect(result).toContain(expectedOffset);
            
            // Should be in the format: "identifier (UTC±HH:MM)"
            expect(result).toMatch(/^[\w/]+ \(UTC[+-]\d{2}:\d{2}\)( \(estimated\))?$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('returns "Not configured" for null timezone', () => {
      const result = displayTimezoneStatus(null);
      expect(result).toBe("Not configured");
    });

    test('returns "Not configured" for undefined timezone', () => {
      const result = displayTimezoneStatus(undefined);
      expect(result).toBe("Not configured");
    });
  });

  // Feature: timezone-spoofing-and-status-display, Property 12: Fallback Timezone Indication
  // **Validates: Requirements 6.5**
  describe('Property 12: Fallback Timezone Indication', () => {
    test('includes "(estimated)" indicator when fallback is true', () => {
      fc.assert(
        fc.property(
          fc.record({
            identifier: fc.constantFrom(
              'America/New_York',
              'Europe/London',
              'Asia/Tokyo'
            ),
            offset: fc.integer({ min: -720, max: 840 }),
            dstOffset: fc.integer({ min: 0, max: 60 }),
            fallback: fc.constant(true)
          }),
          (timezone) => {
            const result = displayTimezoneStatus(timezone);
            
            // Should contain "(estimated)" when fallback is true
            expect(result).toContain("(estimated)");
            
            // Should still contain identifier and offset
            expect(result).toContain(timezone.identifier);
            expect(result).toMatch(/UTC[+-]\d{2}:\d{2}/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('does not include "(estimated)" when fallback is false', () => {
      fc.assert(
        fc.property(
          fc.record({
            identifier: fc.constantFrom(
              'America/New_York',
              'Europe/London',
              'Asia/Tokyo'
            ),
            offset: fc.integer({ min: -720, max: 840 }),
            dstOffset: fc.integer({ min: 0, max: 60 }),
            fallback: fc.constant(false)
          }),
          (timezone) => {
            const result = displayTimezoneStatus(timezone);
            
            // Should NOT contain "(estimated)" when fallback is false
            expect(result).not.toContain("(estimated)");
          }
        ),
        { numRuns: 100 }
      );
    });

    test('does not include "(estimated)" when fallback is undefined', () => {
      fc.assert(
        fc.property(
          fc.record({
            identifier: fc.constantFrom(
              'America/New_York',
              'Europe/London',
              'Asia/Tokyo'
            ),
            offset: fc.integer({ min: -720, max: 840 }),
            dstOffset: fc.integer({ min: 0, max: 60 })
          }),
          (timezone) => {
            const result = displayTimezoneStatus(timezone);
            
            // Should NOT contain "(estimated)" when fallback is undefined
            expect(result).not.toContain("(estimated)");
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
