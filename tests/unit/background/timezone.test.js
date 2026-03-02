/**
 * Unit Tests for Timezone Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, expect, describe, beforeEach } = require("@jest/globals");

// Mock browser API
global.browser = {
  storage: {
    local: {
      data: {},
      get: jest.fn(async (key) => {
        if (key === "settings") {
          return { settings: global.browser.storage.local.data.settings };
        }
        return {};
      }),
      set: jest.fn(async (obj) => {
        if (obj.settings) {
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      }),
    },
  },
  tabs: {
    query: jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    onCreated: {
      addListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
    },
  },
  action: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {}),
  },
  browserAction: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {}),
  },
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: {
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
      },
    },
  },
};

const backgroundPath = require("path").join(process.cwd(), "background/background.js");

beforeEach(() => {
  // Clear storage before each test
  global.browser.storage.local.data = {};
  jest.clearAllMocks();

  // Clear require cache to get fresh module
  delete require.cache[backgroundPath];

  // Reset fetch mock
  global.fetch = jest.fn();
});

describe("Timezone Edge Cases", () => {
  /**
   * Test known coordinate-timezone pairs
   * Validates: Requirements 2.1
   */
  test("should correctly map San Francisco coordinates to America/Los_Angeles", async () => {
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock GeoNames API response for San Francisco
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          timezoneId: "America/Los_Angeles",
          rawOffset: -8,
          dstOffset: -7,
        }),
      })
    );

    const timezone = await getTimezoneForCoordinates(37.7749, -122.4194);

    expect(timezone.identifier).toBe("America/Los_Angeles");
    expect(timezone.offset).toBe(-480); // -8 hours in minutes
    expect(timezone.dstOffset).toBe(-420); // -7 hours in minutes
  });

  test("should correctly map London coordinates to Europe/London", async () => {
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock GeoNames API response for London
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/London",
          rawOffset: 0,
          dstOffset: 1,
        }),
      })
    );

    const timezone = await getTimezoneForCoordinates(51.5074, -0.1278);

    expect(timezone.identifier).toBe("Europe/London");
    expect(timezone.offset).toBe(0);
    expect(timezone.dstOffset).toBe(60); // 1 hour in minutes
  });

  test("should correctly map Tokyo coordinates to Asia/Tokyo", async () => {
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock GeoNames API response for Tokyo
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Tokyo",
          rawOffset: 9,
          dstOffset: 9,
        }),
      })
    );

    const timezone = await getTimezoneForCoordinates(35.6762, 139.6503);

    expect(timezone.identifier).toBe("Asia/Tokyo");
    expect(timezone.offset).toBe(540); // 9 hours in minutes
    expect(timezone.dstOffset).toBe(540);
  });

  /**
   * Test fallback timezone estimation
   * Validates: Requirements 2.1
   */
  test("should use fallback timezone estimation when API fails", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API failure
    global.fetch = jest.fn(() => Promise.reject(new Error("API unavailable")));

    // Use unique coordinates
    const timezone = await getTimezoneForCoordinates(43.4567, -117.8901);

    // Fallback should use Etc/GMT format
    // -117.8901 / 15 ≈ -7.86, rounded to -8 hours
    // Etc/GMT uses inverted signs, so -8 hours = Etc/GMT+8
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);

    // Fallback offset should be based on longitude
    // -117.8901 / 15 ≈ -7.86, rounded to -8, * 60 = -480
    expect(timezone.offset).toBe(-480);
    expect(timezone.dstOffset).toBe(0);
  });

  test("should estimate timezone from longitude for positive coordinates", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API failure
    global.fetch = jest.fn(() => Promise.reject(new Error("API unavailable")));

    // Use unique coordinates
    const timezone = await getTimezoneForCoordinates(44.5678, 140.9012);

    // 140.9012 / 15 ≈ 9.39, rounded to 9 hours
    // Etc/GMT uses inverted signs, so +9 hours = Etc/GMT-9
    expect(timezone.identifier).toBe("Etc/GMT-9");
    expect(timezone.fallback).toBe(true);

    // 140.9012 / 15 ≈ 9.39, rounded to 9, * 60 = 540
    expect(timezone.offset).toBe(540);
  });

  /**
   * Test API failure handling
   * Validates: Requirements 2.1
   */
  test("should handle API error responses", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API error response
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    );

    // Use unique coordinates
    const timezone = await getTimezoneForCoordinates(40.1234, -120.5678);

    // Should fall back to estimation
    // -120.5678 / 15 ≈ -8.04, rounded to -8 hours = Etc/GMT+8
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should handle API error status in response", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API error in JSON response
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          status: {
            message: "Invalid coordinates",
            value: 10,
          },
        }),
      })
    );

    // Use unique coordinates
    const timezone = await getTimezoneForCoordinates(41.2345, -119.6789);

    // Should fall back to estimation
    // -119.6789 / 15 ≈ -7.98, rounded to -8 hours = Etc/GMT+8
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should handle invalid timezone identifier from API", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API response with invalid timezone identifier
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          timezoneId: "invalid/timezone", // lowercase, invalid format
          rawOffset: -8,
          dstOffset: -7,
        }),
      })
    );

    // Use unique coordinates
    const timezone = await getTimezoneForCoordinates(42.3456, -118.789);

    // Should fall back to estimation
    // -118.7890 / 15 ≈ -7.92, rounded to -8 hours = Etc/GMT+8
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  /**
   * Test timezone caching
   */
  test("should cache timezone results", async () => {
    // Clear require cache to get fresh module with empty cache
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock successful API response
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          timezoneId: "America/Los_Angeles",
          rawOffset: -8,
          dstOffset: -7,
        }),
      })
    );

    // Use unique coordinates for this test
    const lat = 37.1234;
    const lon = -122.5678;

    // First call should hit the API
    await getTimezoneForCoordinates(lat, lon);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call with same coordinates should use cache
    await getTimezoneForCoordinates(lat, lon);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  test("should cache fallback timezone results", async () => {
    // Clear require cache to get fresh module with empty cache
    delete require.cache[backgroundPath];
    const { getTimezoneForCoordinates } = require(backgroundPath);

    // Mock API failure
    global.fetch = jest.fn(() => Promise.reject(new Error("API unavailable")));

    // Use unique coordinates for this test
    const lat = 38.9876;
    const lon = -121.4321;

    // First call should attempt API
    await getTimezoneForCoordinates(lat, lon);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call with same coordinates should use cached fallback
    await getTimezoneForCoordinates(lat, lon);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, not 2
  });
});
