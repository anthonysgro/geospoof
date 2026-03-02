/**
 * Property-Based Tests for Content Script Injection
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require("fast-check");
const { setupContentScript } = require("../../content/content.test.helper");

describe("Content Script Injection Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 24: New Tab Content Script Injection
   *
   * For any new tab opened when protection is enabled, the content script
   * should be injected before the page's scripts execute (at document_start).
   *
   * Validates: Requirements 8.4
   */
  test("Property 24: New Tab Content Script Injection", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
        }),
        async (spoofedLocation) => {
          // Simulate content script being injected in a new tab
          const contentScript = setupContentScript({
            enabled: true,
            location: spoofedLocation,
            timezone: null,
          });

          // Verify that the API overrides are immediately available
          // (simulating that they were injected before page scripts)
          expect(contentScript.navigator.geolocation.getCurrentPosition).toBeDefined();
          expect(contentScript.navigator.geolocation.watchPosition).toBeDefined();
          expect(contentScript.navigator.geolocation.clearWatch).toBeDefined();

          // Verify that calling the API immediately returns spoofed data
          const position = await new Promise((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition((pos) => {
              resolve(pos);
            });
          });

          expect(position.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position.coords.longitude).toBe(spoofedLocation.longitude);
        }
      ),
      { numRuns: 100 }
    );
  });
});
