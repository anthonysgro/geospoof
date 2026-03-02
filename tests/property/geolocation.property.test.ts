/**
 * Property-Based Tests for Geolocation API Override
 * Feature: geolocation-spoof-extension-mvp
 *
 * Consolidated property tests for geolocation spoofing:
 * - Property 1: Returns spoofed coordinates (getCurrentPosition + watchPosition)
 * - Property 2: W3C GeolocationPosition object conformance
 * - Property 4: Protection disable restores original behavior
 *
 * Performance properties (Property 3, Property 25) moved to unit tests (task 7/8).
 */

import fc from "fast-check";
import { setupContentScript } from "../helpers/content.test.helper";
import type { SpoofedGeolocationPosition } from "../../src/shared/types/location";

describe("Geolocation API Override Properties", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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
          const position1Promise = new Promise((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition(
              (position: SpoofedGeolocationPosition) => {
                resolve(position);
              }
            );
          });
          await vi.runAllTimersAsync();
          const position1 = (await position1Promise) as SpoofedGeolocationPosition;

          // Verify spoofed coordinates are returned
          expect(position1.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position1.coords.longitude).toBe(spoofedLocation.longitude);
          expect(position1.coords.accuracy).toBe(spoofedLocation.accuracy);

          // Test watchPosition
          const position2Promise = new Promise((resolve) => {
            contentScript.navigator.geolocation.watchPosition(
              (position: SpoofedGeolocationPosition) => {
                resolve(position);
              }
            );
          });
          await vi.runAllTimersAsync();
          const position2 = (await position2Promise) as SpoofedGeolocationPosition;

          // Verify spoofed coordinates are returned
          expect(position2.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position2.coords.longitude).toBe(spoofedLocation.longitude);
          expect(position2.coords.accuracy).toBe(spoofedLocation.accuracy);
        }
      ),
      { numRuns: 100 }
    );
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

          const positionPromise = new Promise<SpoofedGeolocationPosition>((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition(
              (pos: SpoofedGeolocationPosition) => {
                resolve(pos);
              }
            );
          });
          await vi.runAllTimersAsync();
          const position = await positionPromise;

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
          const position1Promise = new Promise<SpoofedGeolocationPosition>((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition(
              (pos: SpoofedGeolocationPosition) => {
                resolve(pos);
              }
            );
          });
          await vi.runAllTimersAsync();
          const position1 = await position1Promise;

          // Should return spoofed coordinates
          expect(position1.coords.latitude).toBe(spoofedLocation.latitude);
          expect(position1.coords.longitude).toBe(spoofedLocation.longitude);

          // Disable protection
          contentScript.updateSettings({ enabled: false });

          // Get position with protection disabled
          const position2Promise = new Promise<SpoofedGeolocationPosition>((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition(
              (pos: SpoofedGeolocationPosition) => {
                resolve(pos);
              }
            );
          });
          await vi.runAllTimersAsync();
          const position2 = await position2Promise;

          // Should return original behavior (0, 0 from our mock)
          expect(position2.coords.latitude).toBe(0);
          expect(position2.coords.longitude).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
