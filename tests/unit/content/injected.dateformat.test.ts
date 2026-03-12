/**
 * Unit Tests for Date Formatting Overrides
 * Feature: date-api-coverage
 *
 * Tests error fallback, edge cases, and specific formatting scenarios
 * for toString, toTimeString, and toDateString overrides.
 */
import { setupContentScript } from "../../helpers/content.test.helper";

describe("Date Formatting Overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Fallback Behavior", () => {
    // Validates: Requirements 1.4, 2.6, 3.5, 6.1, 6.2
    test("toString falls back to native on invalid timezone", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: { identifier: "Invalid/NoSuchZone", offset: 0, dstOffset: 0 },
      });
      const d = new Date("2024-06-15T12:00:00Z");
      const result = cs.Date.prototype.toString.call(d);
      const native = cs.originals.toString.call(d);
      expect(result).toBe(native);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[GeoSpoof Injected]"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    test("toTimeString falls back to native on invalid timezone", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: { identifier: "Invalid/NoSuchZone", offset: 0, dstOffset: 0 },
      });
      const d = new Date("2024-06-15T12:00:00Z");
      const result = cs.Date.prototype.toTimeString.call(d);
      const native = cs.originals.toTimeString.call(d);
      expect(result).toBe(native);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[GeoSpoof Injected]"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    test("toDateString falls back to native on invalid timezone", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: { identifier: "Invalid/NoSuchZone", offset: 0, dstOffset: 0 },
      });
      const d = new Date("2024-06-15T12:00:00Z");
      const result = cs.Date.prototype.toDateString.call(d);
      const native = cs.originals.toDateString.call(d);
      expect(result).toBe(native);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[GeoSpoof Injected]"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });
  });

  describe("getLongTimezoneName Fallback", () => {
    // Validates: Requirement 6.3
    test("toString includes a parenthesized timezone name", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 },
      });
      const d = new Date("2024-01-15T12:00:00Z");
      const result = cs.Date.prototype.toString.call(d);
      expect(result).toMatch(/\(.+\)$/);
    });
  });

  describe("Original toDateString Reference", () => {
    // Validates: Requirement 1.5
    test("originalToDateString is stored as a function", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 },
      });
      expect(typeof cs.originals.toDateString).toBe("function");
      const d = new Date("2024-06-15T12:00:00Z");
      const original = cs.originals.toDateString.call(d);
      expect(original).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4}$/);
    });
  });

  describe("DST Transition Edge Case", () => {
    test("shows EDT after spring-forward for America/New_York", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 },
      });
      const d = new Date("2024-03-10T07:00:00Z");
      const result = cs.Date.prototype.toString.call(d);
      expect(result).toContain("GMT-0400");
      expect(result).toMatch(/Eastern Daylight Time/);
    });

    test("shows EST before spring-forward for America/New_York", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
        timezone: { identifier: "America/New_York", offset: -300, dstOffset: 60 },
      });
      const d = new Date("2024-03-10T06:00:00Z");
      const result = cs.Date.prototype.toString.call(d);
      expect(result).toContain("GMT-0500");
      expect(result).toMatch(/Eastern Standard Time/);
    });
  });

  describe("Half-Hour Offset Timezone", () => {
    test("formats Asia/Kolkata as GMT+0530", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 28.6139, longitude: 77.209, accuracy: 10 },
        timezone: { identifier: "Asia/Kolkata", offset: 330, dstOffset: 0 },
      });
      const d = new Date("2024-06-15T12:00:00Z");
      const str = cs.Date.prototype.toString.call(d);
      expect(str).toContain("GMT+0530");
      const time = cs.Date.prototype.toTimeString.call(d);
      expect(time).toContain("GMT+0530");
      expect(time).toMatch(/^17:30:00 GMT\+0530/);
    });
  });

  describe("Midnight UTC Boundary", () => {
    test("toDateString shows previous day for negative-offset tz", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 21.3069, longitude: -157.8583, accuracy: 10 },
        timezone: { identifier: "Pacific/Honolulu", offset: -600, dstOffset: 0 },
      });
      const d = new Date("2024-01-15T00:00:00Z");
      const dateStr = cs.Date.prototype.toDateString.call(d);
      expect(dateStr).toMatch(/^[A-Z][a-z]{2} Jan 14 2024$/);
    });

    test("toDateString shows next day for positive-offset tz", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: 540, dstOffset: 0 },
      });
      const d = new Date("2024-01-14T23:00:00Z");
      const dateStr = cs.Date.prototype.toDateString.call(d);
      expect(dateStr).toMatch(/^[A-Z][a-z]{2} Jan 15 2024$/);
    });
  });

  describe("Firefox-Native Format Verification", () => {
    // Validates: Requirements 2.1, 3.1, 1.1, 1.2, 5.1, 5.2, 5.3
    test("toString matches Firefox-native regex", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 34.0522, longitude: -118.2437, accuracy: 10 },
        timezone: { identifier: "America/Los_Angeles", offset: -480, dstOffset: 60 },
      });
      const d = new Date("2024-01-15T20:30:45Z");
      const r = cs.Date.prototype.toString.call(d);
      expect(r).toMatch(
        /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \(.+\)$/
      );
    });

    test("toTimeString matches Firefox-native regex", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 34.0522, longitude: -118.2437, accuracy: 10 },
        timezone: { identifier: "America/Los_Angeles", offset: -480, dstOffset: 60 },
      });
      const d = new Date("2024-01-15T20:30:45Z");
      const r = cs.Date.prototype.toTimeString.call(d);
      expect(r).toMatch(/^\d{2}:\d{2}:\d{2} GMT[+-]\d{4} \(.+\)$/);
    });

    test("toDateString matches expected regex", () => {
      const cs = setupContentScript({
        enabled: true,
        location: { latitude: 34.0522, longitude: -118.2437, accuracy: 10 },
        timezone: { identifier: "America/Los_Angeles", offset: -480, dstOffset: 60 },
      });
      const d = new Date("2024-01-15T20:30:45Z");
      const r = cs.Date.prototype.toDateString.call(d);
      expect(r).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4}$/);
    });
  });
});
