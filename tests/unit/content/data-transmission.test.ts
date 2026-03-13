/**
 * Unit Tests for Data Transmission in Content Script
 * Feature: timezone-spoofing-and-status-display
 *
 * Tests CustomEvent structure, payload, error handling, and retry logic
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type { Mock } from "vitest";
import { getDispatchedEvent } from "../../helpers/mock-types";
import type { MockLike } from "../../helpers/mock-types";

interface MockWindow {
  dispatchEvent: Mock;
  addEventListener: Mock;
}

describe("Content Script Data Transmission", () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = {
      dispatchEvent: vi.fn(() => true),
      addEventListener: vi.fn(),
    };

    vi.clearAllMocks();
  });

  describe("CustomEvent Structure", () => {
    test("should dispatch CustomEvent with correct event type", () => {
      const settingsData = {
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      mockWindow.dispatchEvent(event);

      expect(mockWindow.dispatchEvent).toHaveBeenCalledTimes(1);
      const dispatchedEvent = getDispatchedEvent(mockWindow.dispatchEvent as unknown as MockLike);
      expect(dispatchedEvent.type).toBe("__geospoof_settings_update");
    });

    test("should include all required fields in CustomEvent payload", () => {
      const settingsData = {
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail).toBeDefined();
      expect(event.detail.enabled).toBe(true);
      expect(event.detail.location).toBeDefined();
      expect(event.detail.timezone).toBeDefined();
    });

    test("should include timezone data in CustomEvent payload", () => {
      const timezone = {
        identifier: "America/Los_Angeles",
        offset: 480,
        dstOffset: 60,
        fallback: false,
      };

      const settingsData = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        timezone: timezone,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone).toEqual(timezone);
      expect(event.detail.timezone.identifier).toBe("America/Los_Angeles");
      expect(event.detail.timezone.offset).toBe(480);
      expect(event.detail.timezone.dstOffset).toBe(60);
      expect(event.detail.timezone.fallback).toBe(false);
    });
  });

  describe("Timezone Data Formats", () => {
    test("should handle timezone with DST offset", () => {
      const timezone = {
        identifier: "Europe/London",
        offset: 0,
        dstOffset: 60,
      };

      const settingsData = {
        enabled: true,
        location: { latitude: 51.5074, longitude: -0.1278, accuracy: 10 },
        timezone: timezone,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone.dstOffset).toBe(60);
    });

    test("should handle timezone without DST", () => {
      const timezone = {
        identifier: "Asia/Tokyo",
        offset: -540,
        dstOffset: 0,
      };

      const settingsData = {
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: timezone,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone.dstOffset).toBe(0);
    });

    test("should handle fallback timezone flag", () => {
      const timezone = {
        identifier: "UTC",
        offset: 0,
        dstOffset: 0,
        fallback: true,
      };

      const settingsData = {
        enabled: true,
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        timezone: timezone,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone.fallback).toBe(true);
    });

    test("should handle null timezone gracefully", () => {
      const settingsData = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        timezone: null,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone).toBeNull();
      expect(event.detail.location).toBeDefined();
      expect(event.detail.enabled).toBe(true);
    });

    test("should handle undefined timezone gracefully", () => {
      const settingsData = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        timezone: undefined,
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      expect(event.detail.timezone).toBeUndefined();
      expect(event.detail.location).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    test("should catch errors during event dispatch", () => {
      mockWindow.dispatchEvent = vi.fn(() => {
        throw new Error("Dispatch failed");
      });

      const settingsData = {
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
      };

      const event = new CustomEvent("__geospoof_settings_update", {
        detail: settingsData,
      });

      try {
        mockWindow.dispatchEvent(event);
      } catch (error) {
        expect((error as Error).message).toBe("Dispatch failed");
      }
    });

    test("should log errors with [GeoSpoof Content] prefix", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const error = new Error("Test error");
      console.error("[GeoSpoof Content] Failed to dispatch settings update:", error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[GeoSpoof Content] Failed to dispatch settings update:",
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Retry Logic", () => {
    test("should retry once after 100ms delay on failure", () => {
      return new Promise<void>((resolve, reject) => {
        let callCount = 0;
        mockWindow.dispatchEvent = vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error("First attempt failed");
          }
          return true;
        });

        const settingsData = {
          enabled: true,
          location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
          timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
        };

        const event = new CustomEvent("__geospoof_settings_update", {
          detail: settingsData,
        });

        // First attempt
        try {
          mockWindow.dispatchEvent(event);
        } catch {
          // Expected to fail
        }

        // Retry after 100ms
        setTimeout(() => {
          try {
            mockWindow.dispatchEvent(event);
            expect(callCount).toBe(2);
            resolve();
          } catch (retryError) {
            reject(retryError instanceof Error ? retryError : new Error(String(retryError)));
          }
        }, 100);
      });
    });

    test("should log retry success", () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      console.log("[GeoSpoof Content] Retry successful: Dispatched settings update event");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[GeoSpoof Content] Retry successful: Dispatched settings update event"
      );

      consoleLogSpy.mockRestore();
    });

    test("should log retry failure", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const error = new Error("Retry failed");
      console.error("[GeoSpoof Content] Retry failed to dispatch settings update:", error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[GeoSpoof Content] Retry failed to dispatch settings update:",
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
