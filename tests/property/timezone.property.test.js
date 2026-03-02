/**
 * Property-Based Tests for Timezone Functionality
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, beforeEach } = require("@jest/globals");
const fc = require("fast-check");

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

/**
 * Property 8: IANA Timezone Identifier Format
 *
 * Validates: Requirements 2.6
 *
 * For any timezone override, the timezone identifier should be a valid
 * IANA timezone database identifier (e.g., "America/Los_Angeles", "Europe/London").
 */
test("Property 8: IANA Timezone Identifier Format", async () => {
  const { getTimezoneForCoordinates, isValidIANATimezone } = require(backgroundPath);

  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        // Mock successful GeoNames API response
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

        const timezone = await getTimezoneForCoordinates(latitude, longitude);

        // Timezone identifier should be valid IANA format
        return isValidIANATimezone(timezone.identifier);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 6: Timezone Recalculation Responsiveness
 *
 * Validates: Requirements 2.4
 *
 * For any location change, the timezone should be recalculated and updated
 * within 100ms to maintain consistency between coordinates and timezone.
 */
test("Property 6: Timezone Recalculation Responsiveness", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        // Clear require cache to get fresh module
        delete require.cache[backgroundPath];
        const { getTimezoneForCoordinates } = require(backgroundPath);

        // Mock successful GeoNames API response
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

        const startTime = Date.now();
        await getTimezoneForCoordinates(latitude, longitude);
        const endTime = Date.now();

        const responseTime = endTime - startTime;

        // Should complete within 100ms (being generous with network mock)
        return responseTime < 100;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test timezone fallback when API fails
 */
test("Timezone fallback when API fails", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        // Use unique coordinates that won't collide with other tests
        latitude: fc.double({ min: -89, max: -80, noNaN: true }),
        longitude: fc.double({ min: 170, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        // Clear require cache to get fresh module with empty cache
        delete require.cache[backgroundPath];
        const { getTimezoneForCoordinates } = require(backgroundPath);

        // Mock API failure
        global.fetch = jest.fn(() => Promise.reject(new Error("API unavailable")));

        const timezone = await getTimezoneForCoordinates(latitude, longitude);

        // Should return fallback timezone
        if (!timezone) return false;

        // Identifier should be in Etc/GMT format
        if (!timezone.identifier.startsWith("Etc/GMT")) return false;

        if (typeof timezone.offset !== "number") return false;
        if (typeof timezone.dstOffset !== "number") return false;
        if (timezone.dstOffset !== 0) return false;
        if (timezone.fallback !== true) return false;

        // Fallback offset should be based on longitude
        const expectedOffset = Math.round(longitude / 15) * 60;
        return timezone.offset === expectedOffset;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test IANA timezone identifier validation
 */
test("IANA timezone identifier validation", () => {
  const { isValidIANATimezone } = require(backgroundPath);

  fc.assert(
    fc.property(
      fc.constantFrom(
        "America/Los_Angeles",
        "America/New_York",
        "Europe/London",
        "Asia/Tokyo",
        "Australia/Sydney",
        "America/Argentina/Buenos_Aires",
        "UTC"
      ),
      (validTimezone) => {
        return isValidIANATimezone(validTimezone) === true;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test invalid timezone identifiers are rejected
 */
test("Invalid timezone identifiers are rejected", () => {
  const { isValidIANATimezone } = require(backgroundPath);

  fc.assert(
    fc.property(
      fc.constantFrom(
        "",
        "invalid",
        "america/los_angeles", // lowercase
        "America/", // incomplete
        "/Los_Angeles", // missing area
        "123/456", // numbers
        null,
        undefined
      ),
      (invalidTimezone) => {
        return isValidIANATimezone(invalidTimezone) === false;
      }
    ),
    { numRuns: 100 }
  );
});
