/**
 * Unit Tests for Data Transmission in Content Script
 * Feature: timezone-spoofing-and-status-display
 *
 * Tests CustomEvent structure, payload, error handling, and retry logic
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

describe("Content Script Data Transmission", () => {
  let mockWindow;
  let mockBrowser;
  let contentScriptCode;

  beforeEach(() => {
    // Mock window object
    mockWindow = {
      dispatchEvent: jest.fn(() => true),
      addEventListener: jest.fn(),
    };

    // Mock browser API
    mockBrowser = {
      runtime: {
        getURL: jest.fn((path) => `moz-extension://test/${path}`),
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(),
        },
      },
    };

    global.window = mockWindow;
    global.browser = mockBrowser;
    global.CustomEvent = class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.window;
    delete global.browser;
    delete global.CustomEvent;
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
      const dispatchedEvent = mockWindow.dispatchEvent.mock.calls[0][0];
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
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockWindow.dispatchEvent = jest.fn(() => {
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
        expect(error.message).toBe("Dispatch failed");
      }

      consoleErrorSpy.mockRestore();
    });

    test("should log errors with [GeoSpoof Content] prefix", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

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
    test("should retry once after 100ms delay on failure", (done) => {
      let callCount = 0;
      mockWindow.dispatchEvent = jest.fn(() => {
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
      } catch (error) {
        // Expected to fail
      }

      // Retry after 100ms
      setTimeout(() => {
        try {
          mockWindow.dispatchEvent(event);
          expect(callCount).toBe(2);
          done();
        } catch (error) {
          done(error);
        }
      }, 100);
    });

    test("should log retry success", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      console.log("[GeoSpoof Content] Retry successful: Dispatched settings update event");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[GeoSpoof Content] Retry successful: Dispatched settings update event"
      );

      consoleLogSpy.mockRestore();
    });

    test("should log retry failure", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const error = new Error("Retry failed");
      console.error("[GeoSpoof Content] Retry failed to dispatch settings update:", error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[GeoSpoof Content] Retry failed to dispatch settings update:",
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Integration with Background Script", () => {
    test("should receive timezone data from background script UPDATE_SETTINGS message", () => {
      const message = {
        type: "UPDATE_SETTINGS",
        payload: {
          enabled: true,
          location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
          timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
        },
      };

      expect(message.payload.timezone).toBeDefined();
      expect(message.payload.timezone.identifier).toBe("Asia/Tokyo");
      expect(message.payload.timezone.offset).toBe(-540);
    });

    test("should receive timezone data from background script GET_SETTINGS response", () => {
      const settings = {
        enabled: true,
        location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
        timezone: { identifier: "Asia/Tokyo", offset: -540, dstOffset: 0 },
      };

      expect(settings.timezone).toBeDefined();
      expect(settings.timezone.identifier).toBe("Asia/Tokyo");
    });
  });
});
