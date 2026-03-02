/**
 * Property-Based Tests for Geolocation API Override
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require("fast-check");
const { setupContentScript } = require("../../content/content.test.helper");

describe("Geolocation API Override Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Geolocation API Override Returns Spoofed Coordinates
   *
   * For any spoofed location with valid coordinates, when protection is enabled
   * and a web page calls navigator.geolocation.getCurrentPosition() or
   * watchPosition(), the success callback should receive a GeolocationPosition
   * object containing the spoofed coordinates.
   *
   * Validates: Requirements 1.1, 1.2, 1.4, 1.5
   */
  test("Property 1: Geolocation API Override Returns Spoofed Coordinates", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
        }),
        async (spoofedLocation) => {
          // Setup: Load content script with spoofing enabled
          const contentScript = setupContentScript({
            enabled: true,
            location: spoofedLocation,
            timezone: null,
          });

          // Test getCurrentPosition
          const position1 = await new Promise((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition((position) => {
              resolve(position);
            });
          });

          // Verify spoofed coordinates are returned
          expect(position1.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position1.coords.longitude).toBe(spoofedLocation.longitude);
          expect(position1.coords.accuracy).toBe(spoofedLocation.accuracy);

          // Test watchPosition
          const position2 = await new Promise((resolve) => {
            contentScript.navigator.geolocation.watchPosition((position) => {
              resolve(position);
            });
          });

          // Verify spoofed coordinates are returned
          expect(position2.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position2.coords.longitude).toBe(spoofedLocation.longitude);
          expect(position2.coords.accuracy).toBe(spoofedLocation.accuracy);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: Geolocation Position Object Conformance
 *
 * For any spoofed location, the GeolocationPosition object returned by the
 * overridden API should contain all required properties with correct types
 * matching the W3C GeolocationPosition interface.
 *
 * Validates: Requirements 1.8
 */
test("Property 2: Geolocation Position Object Conformance", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
      }),
      async (spoofedLocation) => {
        const contentScript = setupContentScript({
          enabled: true,
          location: spoofedLocation,
          timezone: null,
        });

        const position = await new Promise((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve(pos);
          });
        });

        // Verify all required properties exist
        expect(position).toHaveProperty("coords");
        expect(position).toHaveProperty("timestamp");

        // Verify coords properties
        expect(position.coords).toHaveProperty("latitude");
        expect(position.coords).toHaveProperty("longitude");
        expect(position.coords).toHaveProperty("accuracy");
        expect(position.coords).toHaveProperty("altitude");
        expect(position.coords).toHaveProperty("altitudeAccuracy");
        expect(position.coords).toHaveProperty("heading");
        expect(position.coords).toHaveProperty("speed");

        // Verify types
        expect(typeof position.coords.latitude).toBe("number");
        expect(typeof position.coords.longitude).toBe("number");
        expect(typeof position.coords.accuracy).toBe("number");
        expect(typeof position.timestamp).toBe("number");

        // Verify nullable properties are null (as per MVP spec)
        expect(position.coords.altitude).toBeNull();
        expect(position.coords.altitudeAccuracy).toBeNull();
        expect(position.coords.heading).toBeNull();
        expect(position.coords.speed).toBeNull();
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 3: Geolocation API Performance Overhead
 *
 * For any geolocation API call with protection enabled, the response time
 * should be within 50ms of the call, ensuring minimal performance overhead.
 *
 * Validates: Requirements 1.4, 1.5, 7.3
 */
test("Property 3: Geolocation API Performance Overhead", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
      }),
      async (spoofedLocation) => {
        const contentScript = setupContentScript({
          enabled: true,
          location: spoofedLocation,
          timezone: null,
        });

        // Test getCurrentPosition performance
        const start1 = Date.now();
        await new Promise((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve(pos);
          });
        });
        const duration1 = Date.now() - start1;

        // Should respond within 50ms (design specifies 10-50ms delay)
        expect(duration1).toBeLessThan(60); // 50ms + 10ms buffer

        // Test watchPosition performance
        const start2 = Date.now();
        await new Promise((resolve) => {
          contentScript.navigator.geolocation.watchPosition((pos) => {
            resolve(pos);
          });
        });
        const duration2 = Date.now() - start2;

        expect(duration2).toBeLessThan(60);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 4: Protection Disable Restores Original Behavior
 *
 * For any initial protection state, enabling protection then disabling it
 * should restore the original geolocation API behavior.
 *
 * Validates: Requirements 1.6
 */
test("Property 4: Protection Disable Restores Original Behavior", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
      }),
      async (spoofedLocation) => {
        // Start with protection enabled
        const contentScript = setupContentScript({
          enabled: true,
          location: spoofedLocation,
          timezone: null,
        });

        // Get position with protection enabled
        const position1 = await new Promise((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve(pos);
          });
        });

        // Should return spoofed coordinates
        expect(position1.coords.latitude).toBe(spoofedLocation.latitude);
        expect(position1.coords.longitude).toBe(spoofedLocation.longitude);

        // Disable protection
        contentScript.updateSettings({ enabled: false });

        // Get position with protection disabled
        const position2 = await new Promise((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve(pos);
          });
        });

        // Should return original behavior (0, 0 from our mock)
        expect(position2.coords.latitude).toBe(0);
        expect(position2.coords.longitude).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 25: Realistic Timing Variance
 *
 * For any sequence of geolocation API calls, the response times should vary
 * realistically (not be constant) to avoid detection through timing analysis.
 *
 * Validates: Requirements 8.7
 */
test("Property 25: Realistic Timing Variance", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
      }),
      async (spoofedLocation) => {
        const contentScript = setupContentScript({
          enabled: true,
          location: spoofedLocation,
          timezone: null,
        });

        // Make multiple API calls and measure timing
        const timings = [];
        const numCalls = 10;

        for (let i = 0; i < numCalls; i++) {
          const start = Date.now();
          await new Promise((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition((pos) => {
              resolve(pos);
            });
          });
          const duration = Date.now() - start;
          timings.push(duration);
        }

        // Calculate variance
        const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
        const variance =
          timings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / timings.length;

        // Timings should not all be the same (variance > 0)
        expect(variance).toBeGreaterThan(0);

        // Timings should be within expected range (10-50ms)
        timings.forEach((timing) => {
          expect(timing).toBeGreaterThanOrEqual(10);
          expect(timing).toBeLessThan(60); // 50ms + buffer
        });
      }
    ),
    { numRuns: 50 } // Fewer runs since each test makes 10 calls
  );
});
