/**
 * Unit Tests for Geolocation API Override Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 */

import { setupContentScript } from "../../helpers/content.test.helper";
import { getPositionFromCallback } from "../../helpers/mock-types";
import type { SpoofedGeolocationPosition } from "@/shared/types/location";

describe("Geolocation API Override Edge Cases", () => {
  const testLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 10,
  };

  describe("watchPosition callback management", () => {
    test("should manage multiple watch callbacks independently", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      const callbacks = [];
      const watchIds = [];

      // Create multiple watch positions
      for (let i = 0; i < 3; i++) {
        const callback = vi.fn();
        callbacks.push(callback);

        const watchId = contentScript.navigator.geolocation.watchPosition(callback);
        watchIds.push(watchId);
      }

      // Wait for callbacks to be invoked
      await new Promise((resolve) => setTimeout(resolve, 100));

      // All callbacks should have been called
      callbacks.forEach((callback) => {
        expect(callback).toHaveBeenCalled();
        const position = getPositionFromCallback(callback);
        expect(position.coords.latitude).toBe(testLocation.latitude);
        expect(position.coords.longitude).toBe(testLocation.longitude);
      });

      // Watch IDs should be unique
      const uniqueIds = new Set(watchIds);
      expect(uniqueIds.size).toBe(3);
    });

    test("should return unique watch IDs for each watchPosition call", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      const watchId1 = contentScript.navigator.geolocation.watchPosition(() => {});
      const watchId2 = contentScript.navigator.geolocation.watchPosition(() => {});
      const watchId3 = contentScript.navigator.geolocation.watchPosition(() => {});

      expect(watchId1).not.toBe(watchId2);
      expect(watchId2).not.toBe(watchId3);
      expect(watchId1).not.toBe(watchId3);
    });
  });

  describe("clearWatch functionality", () => {
    test("should remove watch callback when clearWatch is called", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      const callback = vi.fn();
      const watchId = contentScript.navigator.geolocation.watchPosition(callback);

      // Wait for initial callback
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(callback).toHaveBeenCalledTimes(1);

      // Clear the watch
      contentScript.navigator.geolocation.clearWatch(watchId);

      // Verify callback was removed from internal map
      const watchCallbacks = contentScript.getWatchCallbacks();
      expect(watchCallbacks.has(watchId)).toBe(false);
    });

    test("should handle clearWatch with invalid watch ID gracefully", () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      // Should not throw error
      expect(() => {
        contentScript.navigator.geolocation.clearWatch(999);
      }).not.toThrow();
    });

    test("should pass through to original clearWatch when protection disabled", () => {
      const contentScript = setupContentScript({
        enabled: false,
        location: testLocation,
        timezone: null,
      });

      const watchId = 123;
      contentScript.navigator.geolocation.clearWatch(watchId);

      // Should have called original clearWatch
      expect(contentScript.originals.clearWatch).toHaveBeenCalledWith(watchId);
    });
  });

  describe("multiple simultaneous API calls", () => {
    test("should handle multiple simultaneous getCurrentPosition calls", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      // Make 5 simultaneous calls
      const promises: Promise<SpoofedGeolocationPosition>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          new Promise((resolve) => {
            contentScript.navigator.geolocation.getCurrentPosition((pos) => {
              resolve(pos);
            });
          })
        );
      }

      const positions = await Promise.all(promises);

      // All should return the same spoofed location
      positions.forEach((position) => {
        expect(position.coords.latitude).toBe(testLocation.latitude);
        expect(position.coords.longitude).toBe(testLocation.longitude);
      });
    });

    test("should handle mixed getCurrentPosition and watchPosition calls", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      interface PositionResult {
        type: string;
        position: SpoofedGeolocationPosition;
      }

      const results = await Promise.all([
        new Promise<PositionResult>((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve({ type: "getCurrentPosition", position: pos });
          });
        }),
        new Promise<PositionResult>((resolve) => {
          contentScript.navigator.geolocation.watchPosition((pos) => {
            resolve({ type: "watchPosition", position: pos });
          });
        }),
        new Promise<PositionResult>((resolve) => {
          contentScript.navigator.geolocation.getCurrentPosition((pos) => {
            resolve({ type: "getCurrentPosition", position: pos });
          });
        }),
      ]);

      // All should return spoofed coordinates
      results.forEach((result) => {
        expect(result.position.coords.latitude).toBe(testLocation.latitude);
        expect(result.position.coords.longitude).toBe(testLocation.longitude);
      });
    });
  });

  describe("error callback handling", () => {
    test("should not invoke error callback when spoofing succeeds", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      const successCallback = vi.fn();
      const errorCallback = vi.fn();

      await new Promise<void>((resolve) => {
        contentScript.navigator.geolocation.getCurrentPosition((pos) => {
          successCallback(pos);
          resolve();
        }, errorCallback);
      });

      expect(successCallback).toHaveBeenCalled();
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });

  describe("protection state transitions", () => {
    test("should switch from spoofed to real location when protection disabled mid-call", async () => {
      const contentScript = setupContentScript({
        enabled: true,
        location: testLocation,
        timezone: null,
      });

      // Start with protection enabled
      const position1 = await new Promise<SpoofedGeolocationPosition>((resolve) => {
        contentScript.navigator.geolocation.getCurrentPosition((pos) => {
          resolve(pos);
        });
      });

      expect(position1.coords.latitude).toBe(testLocation.latitude);

      // Disable protection
      contentScript.updateSettings({ enabled: false });

      // Next call should use original API
      const position2 = await new Promise<SpoofedGeolocationPosition>((resolve) => {
        contentScript.navigator.geolocation.getCurrentPosition((pos) => {
          resolve(pos);
        });
      });

      expect(position2.coords.latitude).toBe(0); // Mock returns 0,0
    });
  });
});
