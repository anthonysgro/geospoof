/**
 * Unit Tests for Timezone Override Edge Cases
 * Feature: timezone-spoofing-and-status-display
 */

const { setupContentScript } = require("../../../content/content.test.helper");

describe("Timezone Override Edge Cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Null/Undefined Timezone Data", () => {
    /**
     * Test with null timezone data
     * **Validates: Requirements 11.1, 11.2, 12.4**
     */
    test("should fallback to original methods when timezone is null", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: null
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // getTimezoneOffset should use original
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
      
      // DateTimeFormat should use original
      const formatter = new contentScript.Intl.DateTimeFormat();
      const options = formatter.resolvedOptions();
      const originalFormatter = new contentScript.originals.DateTimeFormat();
      const originalOptions = originalFormatter.resolvedOptions();
      expect(options.timeZone).toBe(originalOptions.timeZone);
    });

    test("should fallback to original methods when timezone is undefined", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: undefined
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
    });

    test("should continue geolocation spoofing when timezone is null", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: null
      });

      const position = await new Promise((resolve) => {
        contentScript.navigator.geolocation.getCurrentPosition((pos) => {
          resolve(pos);
        });
      });
      
      // Geolocation should still be spoofed
      expect(position.coords.latitude).toBe(35.6762);
      expect(position.coords.longitude).toBe(139.6503);
    });
  });

  describe("Invalid Timezone Data Structures", () => {
    /**
     * Test with invalid timezone data structures
     * **Validates: Requirements 12.4, 12.5**
     */
    test("should handle timezone with missing identifier", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { offset: -300, dstOffset: 60 } // Missing identifier
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should fallback to original since validation fails
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
    });

    test("should handle timezone with invalid offset type", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: "invalid", dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should fallback to original since validation fails
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
    });

    test("should handle timezone with NaN offset", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: NaN, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should fallback to original since validation fails
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
    });

    test("should handle timezone with Infinity offset", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: Infinity, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should fallback to original since validation fails
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const overrideOffset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(overrideOffset).toBe(originalOffset);
    });
  });

  describe("DST Transitions and Boundary Cases", () => {
    /**
     * Test DST transitions and boundary cases
     * **Validates: Requirements 1.5, 11.4**
     */
    test("should handle timezone with no DST (dstOffset = 0)", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 }
      });

      const summerDate = new Date('2024-07-15T12:00:00Z');
      const winterDate = new Date('2024-01-15T12:00:00Z');
      
      // Should return same offset regardless of season
      const summerOffset = contentScript.Date.prototype.getTimezoneOffset.call(summerDate);
      const winterOffset = contentScript.Date.prototype.getTimezoneOffset.call(winterDate);
      
      expect(summerOffset).toBe(540); // Negative of -540
      expect(winterOffset).toBe(540);
      expect(summerOffset).toBe(winterOffset);
    });

    test("should handle timezone with DST in northern hemisphere", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 }
      });

      const testDate = new Date('2024-07-15T12:00:00Z'); // Summer
      const offset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      
      // Should return negative of offset (300 or 240 depending on DST)
      expect(typeof offset).toBe('number');
      expect(Number.isFinite(offset)).toBe(true);
    });

    test("should handle timezone with DST in southern hemisphere", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: -33.8688, longitude: 151.2093, accuracy: 10 },
        timezone: { identifier: "Australia/Sydney", offset: -600, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z'); // Summer in southern hemisphere
      const offset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      
      expect(typeof offset).toBe('number');
      expect(Number.isFinite(offset)).toBe(true);
    });

    test("should handle fallback timezone with estimation flag", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60, fallback: true }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      const offset = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      
      // Should still apply timezone spoofing even with fallback flag
      expect(typeof offset).toBe('number');
      expect(offset).toBe(300); // Negative of -300
    });
  });

  describe("Error Handling and Fallback Behavior", () => {
    /**
     * Test error handling and fallback behavior
     * **Validates: Requirements 11.1, 11.2, 11.4, 12.5**
     */
    test("should handle invalid Date objects gracefully for getTimezoneOffset", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 }
      });

      const invalidDate = new Date('invalid');
      
      // getTimezoneOffset should not throw error (returns NaN for invalid dates)
      expect(() => {
        contentScript.Date.prototype.getTimezoneOffset.call(invalidDate);
      }).not.toThrow();
    });

    test("should preserve geolocation spoofing when timezone validation fails", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "", offset: -540, dstOffset: 0 } // Invalid: empty identifier
      });

      const position = await new Promise((resolve) => {
        contentScript.navigator.geolocation.getCurrentPosition((pos) => {
          resolve(pos);
        });
      });
      
      // Geolocation should still work
      expect(position.coords.latitude).toBe(35.6762);
      expect(position.coords.longitude).toBe(139.6503);
    });

    test("should handle timezone changes during runtime", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      const offset1 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(offset1).toBe(300);
      
      // Update timezone
      contentScript.updateSettings({
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 }
      });
      
      const offset2 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(offset2).toBe(540);
    });

    test("should handle protection being disabled after being enabled", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // With protection enabled
      const offset1 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(offset1).toBe(300);
      
      // Disable protection
      contentScript.updateSettings({ enabled: false });
      
      // Should use original
      const originalOffset = contentScript.originals.getTimezoneOffset.call(testDate);
      const offset2 = contentScript.Date.prototype.getTimezoneOffset.call(testDate);
      expect(offset2).toBe(originalOffset);
    });
  });

  describe("Edge Cases with Date Formatting", () => {
    test("should handle Date formatting with null timezone", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: null
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should not throw and should return strings
      expect(() => {
        const result = contentScript.Date.prototype.toLocaleString.call(testDate);
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });

    test("should handle Date formatting with custom options", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.0060, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 }
      });

      const testDate = new Date('2024-01-15T12:00:00Z');
      
      // Should handle custom options
      const result = contentScript.Date.prototype.toLocaleString.call(testDate, 'en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
