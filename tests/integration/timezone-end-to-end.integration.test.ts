/**
 * End-to-End Integration Tests for Timezone Spoofing
 *
 * Tests complete flow: set location → fetch timezone → transmit data → override APIs → display status
 *
 * Requirements: 4.1, 4.2, 4.3, 9.4, 9.5
 */

import {
  getSavedSettings,
  getLastSavedSettings,
  getLastBroadcastMessage,
  getBroadcastMessage,
  expectStorageSet,
  expectTabsSendMessage,
  expectWebRTCPolicySet,
  tabsSendMessageCallCount,
} from "../helpers/mock-types";
import { vi } from "vitest";

// Mock DOM for content script testing
(globalThis as Record<string, unknown>).document = {
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

(globalThis as Record<string, unknown>).window = {
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

(globalThis as Record<string, unknown>).CustomEvent = class CustomEvent {
  type: string;
  detail: unknown;
  constructor(type: string, options?: { detail?: unknown }) {
    this.type = type;
    this.detail = options?.detail;
  }
};

const background = await import("@/background");
const fetchMock = vi.mocked(fetch);

describe("Timezone Spoofing End-to-End Integration Tests", () => {
  beforeEach(() => {
    // Default storage mock
    browser.storage.local.get.mockResolvedValue({
      settings: {
        enabled: false,
        location: null,
        timezone: null,
        locationName: null,
        webrtcProtection: false,
        onboardingCompleted: true,
        version: "1.0",
        lastUpdated: Date.now(),
      },
    });

    browser.storage.local.set.mockResolvedValue(undefined);

    // Default tabs mock
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }]);

    browser.tabs.sendMessage.mockResolvedValue(undefined);
  });

  describe("Complete Flow: Set Location → Fetch Timezone → Transmit Data → Override APIs", () => {
    test("should complete full timezone spoofing flow for Tokyo", async () => {
      // Step 1: User sets location to Tokyo
      const tokyoLocation = {
        latitude: 35.6762,
        longitude: 139.6503,
      };

      // Mock timezone API response for Tokyo
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Asia/Tokyo",
            rawOffset: 9,
            dstOffset: 0,
          }),
      } as Response);

      // Mock reverse geocoding response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Tokyo, Japan",
            address: {
              city: "Tokyo",
              country: "Japan",
            },
          }),
      } as Response);

      // Act: Set location (background script fetches timezone)
      await background.handleSetLocation(tokyoLocation);

      // Assert: Timezone data fetched and stored
      expectStorageSet().toHaveBeenCalled();
      const savedSettings = getSavedSettings();

      expect(savedSettings.location!.latitude).toBe(35.6762);
      expect(savedSettings.location!.longitude).toBe(139.6503);
      expect(savedSettings.timezone).toBeDefined();
      expect(savedSettings.timezone!.identifier).toBe("Asia/Tokyo");
      expect(savedSettings.timezone!.offset).toBe(540); // UTC+9 = 540 minutes (positive for east)
      expect(savedSettings.timezone!.dstOffset).toBe(0);

      // Step 2: Enable protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: Settings broadcast to tabs with timezone data
      expectTabsSendMessage().toHaveBeenCalled();
      const lastBroadcast = getLastBroadcastMessage();

      expect(lastBroadcast.type).toBe("UPDATE_SETTINGS");
      expect(lastBroadcast.payload?.enabled).toBe(true);
      expect(lastBroadcast.payload?.location).toBeDefined();
      expect(lastBroadcast.payload?.timezone).toBeDefined();
      expect(lastBroadcast.payload?.timezone?.identifier).toBe("Asia/Tokyo");
      expect(lastBroadcast.payload?.timezone?.offset).toBe(540);

      // Step 3: Verify content script would receive and transmit data
      // (Content script receives via browser.runtime.sendMessage and dispatches CustomEvent)
      // This is tested in the content script unit tests, but we verify the payload structure here
      const transmittedData = lastBroadcast.payload;

      expect(transmittedData).toHaveProperty("enabled", true);
      expect(transmittedData).toHaveProperty("location");
      expect(transmittedData).toHaveProperty("timezone");
      expect(transmittedData?.timezone).toHaveProperty("identifier");
      expect(transmittedData?.timezone).toHaveProperty("offset");
      expect(transmittedData?.timezone).toHaveProperty("dstOffset");
    });

    test("should complete full timezone spoofing flow for Los Angeles", async () => {
      // Step 1: User sets location to Los Angeles
      const laLocation = {
        latitude: 34.0522,
        longitude: -118.2437,
      };

      // Mock timezone API response for Los Angeles
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/Los_Angeles",
            rawOffset: -8,
            dstOffset: 1,
          }),
      } as Response);

      // Mock reverse geocoding response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Los Angeles, CA, USA",
            address: {
              city: "Los Angeles",
              country: "USA",
            },
          }),
      } as Response);

      // Act: Set location
      await background.handleSetLocation(laLocation);

      // Assert: Timezone data includes DST offset
      const savedSettings = getSavedSettings();

      expect(savedSettings.timezone!.identifier).toBe("America/Los_Angeles");
      expect(savedSettings.timezone!.offset).toBe(-480); // UTC-8 = -480 minutes (negative for west)
      expect(savedSettings.timezone!.dstOffset).toBe(60); // 1 hour DST

      // Step 2: Enable protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: DST offset transmitted to content script
      const lastBroadcast = getLastBroadcastMessage();

      expect(lastBroadcast.payload?.timezone?.dstOffset).toBe(60);
    });

    test("should complete full timezone spoofing flow for London", async () => {
      // Step 1: User sets location to London
      const londonLocation = {
        latitude: 51.5074,
        longitude: -0.1278,
      };

      // Mock timezone API response for London
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/London",
            rawOffset: 0,
            dstOffset: 1,
          }),
      } as Response);

      // Mock reverse geocoding response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "London, England, UK",
            address: {
              city: "London",
              country: "UK",
            },
          }),
      } as Response);

      // Act: Set location
      await background.handleSetLocation(londonLocation);

      // Assert: Timezone data for UTC+0 with DST
      const savedSettings = getSavedSettings();

      expect(savedSettings.timezone!.identifier).toBe("Europe/London");
      expect(savedSettings.timezone!.offset).toBe(0); // UTC+0 = 0 minutes
      expect(savedSettings.timezone!.dstOffset).toBe(60); // 1 hour DST (BST)
    });
  });

  describe("Multiple Locations and Timezones", () => {
    test("should handle switching between different timezones", async () => {
      // Step 1: Set location to Sydney
      const sydneyLocation = {
        latitude: -33.8688,
        longitude: 151.2093,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Australia/Sydney",
            rawOffset: 10,
            dstOffset: 1,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Sydney, Australia",
            address: {
              city: "Sydney",
              country: "Australia",
            },
          }),
      } as Response);

      await background.handleSetLocation(sydneyLocation);

      const sydneySettings = getSavedSettings();
      expect(sydneySettings.timezone!.identifier).toBe("Australia/Sydney");
      expect(sydneySettings.timezone!.offset).toBe(600); // UTC+10 = 600 minutes

      // Step 2: Switch to New York
      const nyLocation = {
        latitude: 40.7128,
        longitude: -74.006,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/New_York",
            rawOffset: -5,
            dstOffset: 1,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "New York, NY, USA",
            address: {
              city: "New York",
              country: "USA",
            },
          }),
      } as Response);

      await background.handleSetLocation(nyLocation);

      const nySettings = getSavedSettings(undefined, 1);
      expect(nySettings.timezone!.identifier).toBe("America/New_York");
      expect(nySettings.timezone!.offset).toBe(-300); // UTC-5 = -300 minutes

      // Step 3: Switch to Dubai (no DST)
      const dubaiLocation = {
        latitude: 25.2048,
        longitude: 55.2708,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Asia/Dubai",
            rawOffset: 4,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Dubai, UAE",
            address: {
              city: "Dubai",
              country: "UAE",
            },
          }),
      } as Response);

      await background.handleSetLocation(dubaiLocation);

      const dubaiSettings = getSavedSettings(undefined, 2);
      expect(dubaiSettings.timezone!.identifier).toBe("Asia/Dubai");
      expect(dubaiSettings.timezone!.offset).toBe(240); // UTC+4 = 240 minutes
      expect(dubaiSettings.timezone!.dstOffset).toBe(0); // No DST
    });

    test("should handle extreme timezone offsets", async () => {
      // Test UTC+14 (Kiribati - easternmost timezone)
      const kiribatiLocation = {
        latitude: 1.8709,
        longitude: -157.3629,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Pacific/Kiritimati",
            rawOffset: 14,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Kiritimati, Kiribati",
            address: {
              country: "Kiribati",
            },
          }),
      } as Response);

      await background.handleSetLocation(kiribatiLocation);

      const kiribatiSettings = getSavedSettings();
      expect(kiribatiSettings.timezone!.identifier).toBe("Pacific/Kiritimati");
      expect(kiribatiSettings.timezone!.offset).toBe(840); // UTC+14 = 840 minutes

      // Test UTC-11 (American Samoa - far west timezone)
      const samoaLocation = {
        latitude: -14.271,
        longitude: -170.1322,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Pacific/Pago_Pago",
            rawOffset: -11,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Pago Pago, American Samoa",
            address: {
              country: "American Samoa",
            },
          }),
      } as Response);

      await background.handleSetLocation(samoaLocation);

      const samoaSettings = getSavedSettings(undefined, 1);
      expect(samoaSettings.timezone!.identifier).toBe("Pacific/Pago_Pago");
      expect(samoaSettings.timezone!.offset).toBe(-660); // UTC-11 = -660 minutes
    });

    test("should handle timezone with 30-minute offset", async () => {
      // Test India (UTC+5:30)
      const indiaLocation = {
        latitude: 28.6139,
        longitude: 77.209,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Asia/Kolkata",
            rawOffset: 5.5,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "New Delhi, India",
            address: {
              city: "New Delhi",
              country: "India",
            },
          }),
      } as Response);

      await background.handleSetLocation(indiaLocation);

      const indiaSettings = getSavedSettings();
      expect(indiaSettings.timezone!.identifier).toBe("Asia/Kolkata");
      expect(indiaSettings.timezone!.offset).toBe(330); // UTC+5:30 = 330 minutes
    });

    test("should handle timezone with 45-minute offset", async () => {
      // Test Nepal (UTC+5:45)
      const nepalLocation = {
        latitude: 27.7172,
        longitude: 85.324,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Asia/Kathmandu",
            rawOffset: 5.75,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Kathmandu, Nepal",
            address: {
              city: "Kathmandu",
              country: "Nepal",
            },
          }),
      } as Response);

      await background.handleSetLocation(nepalLocation);

      const nepalSettings = getSavedSettings();
      expect(nepalSettings.timezone!.identifier).toBe("Asia/Kathmandu");
      expect(nepalSettings.timezone!.offset).toBe(345); // UTC+5:45 = 345 minutes
    });
  });

  describe("Data Transmission Verification", () => {
    test("should transmit complete timezone data structure to content script", async () => {
      // Set location
      const location = {
        latitude: 48.8566,
        longitude: 2.3522,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/Paris",
            rawOffset: 1,
            dstOffset: 1,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Paris, France",
            address: {
              city: "Paris",
              country: "France",
            },
          }),
      } as Response);

      await background.handleSetLocation(location);

      // Enable protection
      const savedSettings = getSavedSettings();
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Verify transmitted data structure
      const lastBroadcast = getLastBroadcastMessage();
      const payload = lastBroadcast.payload;

      // Verify all required fields are present
      expect(payload).toHaveProperty("enabled");
      expect(payload).toHaveProperty("location");
      expect(payload).toHaveProperty("timezone");

      // Verify timezone structure
      expect(payload?.timezone).toHaveProperty("identifier");
      expect(payload?.timezone).toHaveProperty("offset");
      expect(payload?.timezone).toHaveProperty("dstOffset");

      // Verify types
      expect(typeof payload?.timezone?.identifier).toBe("string");
      expect(typeof payload?.timezone?.offset).toBe("number");
      expect(typeof payload?.timezone?.dstOffset).toBe("number");

      // Verify values
      expect(payload?.timezone?.identifier).toBe("Europe/Paris");
      expect(payload?.timezone?.offset).toBe(60); // UTC+1 = 60 minutes
      expect(payload?.timezone?.dstOffset).toBe(60);
    });

    test("should transmit timezone data to multiple tabs", async () => {
      // Mock multiple tabs
      browser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://example.com" },
        { id: 2, url: "https://test.com" },
        { id: 3, url: "https://demo.com" },
      ]);

      // Set location
      const location = {
        latitude: 52.52,
        longitude: 13.405,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/Berlin",
            rawOffset: 1,
            dstOffset: 1,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Berlin, Germany",
            address: {
              city: "Berlin",
              country: "Germany",
            },
          }),
      } as Response);

      await background.handleSetLocation(location);

      // Enable protection
      const savedSettings = getSavedSettings();
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Clear previous calls and verify only the broadcast to tabs
      vi.clearAllMocks();

      // Mock tabs again after clearing
      browser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://example.com" },
        { id: 2, url: "https://test.com" },
        { id: 3, url: "https://demo.com" },
      ]);

      // Trigger a settings update that will broadcast to all tabs
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: true,
        },
      });

      await background.broadcastSettingsToTabs(savedSettings);

      // Verify all tabs received the message
      expectTabsSendMessage().toHaveBeenCalledTimes(3);

      // Verify each tab received timezone data
      for (let i = 0; i < tabsSendMessageCallCount(); i++) {
        const message = getBroadcastMessage(undefined, i);
        expect(message.type).toBe("UPDATE_SETTINGS");
        expect(message.payload?.timezone).toBeDefined();
        expect(message.payload?.timezone?.identifier).toBe("Europe/Berlin");
      }
    });
  });

  describe("Integration with Existing Features", () => {
    test("should maintain geolocation spoofing when timezone data is added", async () => {
      // Set location
      const location = {
        latitude: -22.9068,
        longitude: -43.1729,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/Sao_Paulo",
            rawOffset: -3,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Rio de Janeiro, Brazil",
            address: {
              city: "Rio de Janeiro",
              country: "Brazil",
            },
          }),
      } as Response);

      await background.handleSetLocation(location);

      // Enable protection
      const savedSettings = getSavedSettings();
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Verify both geolocation and timezone data are transmitted
      const lastBroadcast = getLastBroadcastMessage();
      const payload = lastBroadcast.payload;

      // Verify geolocation data
      expect(payload?.location).toBeDefined();
      expect(payload?.location?.latitude).toBe(-22.9068);
      expect(payload?.location?.longitude).toBe(-43.1729);

      // Verify timezone data
      expect(payload?.timezone).toBeDefined();
      expect(payload?.timezone?.identifier).toBe("America/Sao_Paulo");
      expect(payload?.timezone?.offset).toBe(-180); // UTC-3 = -180 minutes
    });

    test("should work with WebRTC protection enabled", async () => {
      // Set location
      const location = {
        latitude: 55.7558,
        longitude: 37.6173,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/Moscow",
            rawOffset: 3,
            dstOffset: 0,
          }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Moscow, Russia",
            address: {
              city: "Moscow",
              country: "Russia",
            },
          }),
      } as Response);

      await background.handleSetLocation(location);

      // Enable protection
      const savedSettings = getSavedSettings();
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Enable WebRTC protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...getLastSavedSettings(),
          webrtcProtection: false,
        },
      });

      await background.handleSetWebRTCProtection({ enabled: true });

      // Verify all protections are active
      const finalSettings = getLastSavedSettings();

      expect(finalSettings.enabled).toBe(true);
      expect(finalSettings.webrtcProtection).toBe(true);
      expect(finalSettings.location).toBeDefined();
      expect(finalSettings.timezone).toBeDefined();
      expect(finalSettings.timezone?.identifier).toBe("Europe/Moscow");

      // Verify WebRTC privacy settings configured
      expectWebRTCPolicySet().toHaveBeenCalled();
    });
  });
});
