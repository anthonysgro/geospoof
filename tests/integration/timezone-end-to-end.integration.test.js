/**
 * End-to-End Integration Tests for Timezone Spoofing
 * 
 * Tests complete flow: set location → fetch timezone → transmit data → override APIs → display status
 * 
 * Requirements: 4.1, 4.2, 4.3, 9.4, 9.5
 */

// Mock browser API
global.browser = {
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    onCreated: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  action: {
    setBadgeBackgroundColor: jest.fn(),
    setBadgeText: jest.fn()
  },
  browserAction: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {})
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn()
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: {
        set: jest.fn(),
        clear: jest.fn()
      }
    }
  }
};

// Mock fetch for geocoding and timezone APIs
global.fetch = jest.fn();

// Mock DOM for content script testing
global.document = {
  addEventListener: jest.fn(),
  dispatchEvent: jest.fn()
};

global.window = {
  addEventListener: jest.fn(),
  dispatchEvent: jest.fn()
};

global.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};

const background = require("../../background/background.js");

describe("Timezone Spoofing End-to-End Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
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
        lastUpdated: Date.now()
      }
    });
    
    browser.storage.local.set.mockResolvedValue();
    
    // Default tabs mock
    browser.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com" }
    ]);
    
    browser.tabs.sendMessage.mockResolvedValue();
  });

  describe("Complete Flow: Set Location → Fetch Timezone → Transmit Data → Override APIs", () => {
    test("should complete full timezone spoofing flow for Tokyo", async () => {
      // Step 1: User sets location to Tokyo
      const tokyoLocation = {
        latitude: 35.6762,
        longitude: 139.6503
      };
      
      // Mock timezone API response for Tokyo
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Tokyo",
          rawOffset: 9,
          dstOffset: 0
        })
      });
      
      // Mock reverse geocoding response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Tokyo, Japan",
          address: {
            city: "Tokyo",
            country: "Japan"
          }
        })
      });
      
      // Act: Set location (background script fetches timezone)
      await background.handleSetLocation(tokyoLocation);
      
      // Assert: Timezone data fetched and stored
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      
      expect(savedSettings.location.latitude).toBe(35.6762);
      expect(savedSettings.location.longitude).toBe(139.6503);
      expect(savedSettings.timezone).toBeDefined();
      expect(savedSettings.timezone.identifier).toBe("Asia/Tokyo");
      expect(savedSettings.timezone.offset).toBe(540); // UTC+9 = 540 minutes (positive for east)
      expect(savedSettings.timezone.dstOffset).toBe(0);
      
      // Step 2: Enable protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Assert: Settings broadcast to tabs with timezone data
      expect(browser.tabs.sendMessage).toHaveBeenCalled();
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];
      
      expect(lastBroadcast[1].type).toBe("UPDATE_SETTINGS");
      expect(lastBroadcast[1].payload.enabled).toBe(true);
      expect(lastBroadcast[1].payload.location).toBeDefined();
      expect(lastBroadcast[1].payload.timezone).toBeDefined();
      expect(lastBroadcast[1].payload.timezone.identifier).toBe("Asia/Tokyo");
      expect(lastBroadcast[1].payload.timezone.offset).toBe(540);
      
      // Step 3: Verify content script would receive and transmit data
      // (Content script receives via browser.runtime.sendMessage and dispatches CustomEvent)
      // This is tested in the content script unit tests, but we verify the payload structure here
      const transmittedData = lastBroadcast[1].payload;
      
      expect(transmittedData).toHaveProperty("enabled", true);
      expect(transmittedData).toHaveProperty("location");
      expect(transmittedData).toHaveProperty("timezone");
      expect(transmittedData.timezone).toHaveProperty("identifier");
      expect(transmittedData.timezone).toHaveProperty("offset");
      expect(transmittedData.timezone).toHaveProperty("dstOffset");
    });

    test("should complete full timezone spoofing flow for Los Angeles", async () => {
      // Step 1: User sets location to Los Angeles
      const laLocation = {
        latitude: 34.0522,
        longitude: -118.2437
      };
      
      // Mock timezone API response for Los Angeles
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Los_Angeles",
          rawOffset: -8,
          dstOffset: 1
        })
      });
      
      // Mock reverse geocoding response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Los Angeles, CA, USA",
          address: {
            city: "Los Angeles",
            country: "USA"
          }
        })
      });
      
      // Act: Set location
      await background.handleSetLocation(laLocation);
      
      // Assert: Timezone data includes DST offset
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      
      expect(savedSettings.timezone.identifier).toBe("America/Los_Angeles");
      expect(savedSettings.timezone.offset).toBe(-480); // UTC-8 = -480 minutes (negative for west)
      expect(savedSettings.timezone.dstOffset).toBe(60); // 1 hour DST
      
      // Step 2: Enable protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Assert: DST offset transmitted to content script
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];
      
      expect(lastBroadcast[1].payload.timezone.dstOffset).toBe(60);
    });

    test("should complete full timezone spoofing flow for London", async () => {
      // Step 1: User sets location to London
      const londonLocation = {
        latitude: 51.5074,
        longitude: -0.1278
      };
      
      // Mock timezone API response for London
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/London",
          rawOffset: 0,
          dstOffset: 1
        })
      });
      
      // Mock reverse geocoding response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "London, England, UK",
          address: {
            city: "London",
            country: "UK"
          }
        })
      });
      
      // Act: Set location
      await background.handleSetLocation(londonLocation);
      
      // Assert: Timezone data for UTC+0 with DST
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      
      expect(savedSettings.timezone.identifier).toBe("Europe/London");
      expect(savedSettings.timezone.offset).toBe(0); // UTC+0 = 0 minutes
      expect(savedSettings.timezone.dstOffset).toBe(60); // 1 hour DST (BST)
    });
  });

  describe("Multiple Locations and Timezones", () => {
    test("should handle switching between different timezones", async () => {
      // Step 1: Set location to Sydney
      const sydneyLocation = {
        latitude: -33.8688,
        longitude: 151.2093
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Australia/Sydney",
          rawOffset: 10,
          dstOffset: 1
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Sydney, Australia",
          address: {
            city: "Sydney",
            country: "Australia"
          }
        })
      });
      
      await background.handleSetLocation(sydneyLocation);
      
      const sydneySettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(sydneySettings.timezone.identifier).toBe("Australia/Sydney");
      expect(sydneySettings.timezone.offset).toBe(600); // UTC+10 = 600 minutes
      
      // Step 2: Switch to New York
      const nyLocation = {
        latitude: 40.7128,
        longitude: -74.0060
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/New_York",
          rawOffset: -5,
          dstOffset: 1
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "New York, NY, USA",
          address: {
            city: "New York",
            country: "USA"
          }
        })
      });
      
      await background.handleSetLocation(nyLocation);
      
      const nySettings = browser.storage.local.set.mock.calls[1][0].settings;
      expect(nySettings.timezone.identifier).toBe("America/New_York");
      expect(nySettings.timezone.offset).toBe(-300); // UTC-5 = -300 minutes
      
      // Step 3: Switch to Dubai (no DST)
      const dubaiLocation = {
        latitude: 25.2048,
        longitude: 55.2708
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Dubai",
          rawOffset: 4,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Dubai, UAE",
          address: {
            city: "Dubai",
            country: "UAE"
          }
        })
      });
      
      await background.handleSetLocation(dubaiLocation);
      
      const dubaiSettings = browser.storage.local.set.mock.calls[2][0].settings;
      expect(dubaiSettings.timezone.identifier).toBe("Asia/Dubai");
      expect(dubaiSettings.timezone.offset).toBe(240); // UTC+4 = 240 minutes
      expect(dubaiSettings.timezone.dstOffset).toBe(0); // No DST
    });

    test("should handle extreme timezone offsets", async () => {
      // Test UTC+14 (Kiribati - easternmost timezone)
      const kiribatiLocation = {
        latitude: 1.8709,
        longitude: -157.3629
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Pacific/Kiritimati",
          rawOffset: 14,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Kiritimati, Kiribati",
          address: {
            country: "Kiribati"
          }
        })
      });
      
      await background.handleSetLocation(kiribatiLocation);
      
      const kiribatiSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(kiribatiSettings.timezone.identifier).toBe("Pacific/Kiritimati");
      expect(kiribatiSettings.timezone.offset).toBe(840); // UTC+14 = 840 minutes
      
      // Test UTC-11 (American Samoa - far west timezone)
      const samoaLocation = {
        latitude: -14.2710,
        longitude: -170.1322
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Pacific/Pago_Pago",
          rawOffset: -11,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Pago Pago, American Samoa",
          address: {
            country: "American Samoa"
          }
        })
      });
      
      await background.handleSetLocation(samoaLocation);
      
      const samoaSettings = browser.storage.local.set.mock.calls[1][0].settings;
      expect(samoaSettings.timezone.identifier).toBe("Pacific/Pago_Pago");
      expect(samoaSettings.timezone.offset).toBe(-660); // UTC-11 = -660 minutes
    });

    test("should handle timezone with 30-minute offset", async () => {
      // Test India (UTC+5:30)
      const indiaLocation = {
        latitude: 28.6139,
        longitude: 77.2090
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Kolkata",
          rawOffset: 5.5,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "New Delhi, India",
          address: {
            city: "New Delhi",
            country: "India"
          }
        })
      });
      
      await background.handleSetLocation(indiaLocation);
      
      const indiaSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(indiaSettings.timezone.identifier).toBe("Asia/Kolkata");
      expect(indiaSettings.timezone.offset).toBe(330); // UTC+5:30 = 330 minutes
    });

    test("should handle timezone with 45-minute offset", async () => {
      // Test Nepal (UTC+5:45)
      const nepalLocation = {
        latitude: 27.7172,
        longitude: 85.3240
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Kathmandu",
          rawOffset: 5.75,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Kathmandu, Nepal",
          address: {
            city: "Kathmandu",
            country: "Nepal"
          }
        })
      });
      
      await background.handleSetLocation(nepalLocation);
      
      const nepalSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(nepalSettings.timezone.identifier).toBe("Asia/Kathmandu");
      expect(nepalSettings.timezone.offset).toBe(345); // UTC+5:45 = 345 minutes
    });
  });

  describe("Data Transmission Verification", () => {
    test("should transmit complete timezone data structure to content script", async () => {
      // Set location
      const location = {
        latitude: 48.8566,
        longitude: 2.3522
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Paris",
          rawOffset: 1,
          dstOffset: 1
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Paris, France",
          address: {
            city: "Paris",
            country: "France"
          }
        })
      });
      
      await background.handleSetLocation(location);
      
      // Enable protection
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Verify transmitted data structure
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];
      const payload = lastBroadcast[1].payload;
      
      // Verify all required fields are present
      expect(payload).toHaveProperty("enabled");
      expect(payload).toHaveProperty("location");
      expect(payload).toHaveProperty("timezone");
      
      // Verify timezone structure
      expect(payload.timezone).toHaveProperty("identifier");
      expect(payload.timezone).toHaveProperty("offset");
      expect(payload.timezone).toHaveProperty("dstOffset");
      
      // Verify types
      expect(typeof payload.timezone.identifier).toBe("string");
      expect(typeof payload.timezone.offset).toBe("number");
      expect(typeof payload.timezone.dstOffset).toBe("number");
      
      // Verify values
      expect(payload.timezone.identifier).toBe("Europe/Paris");
      expect(payload.timezone.offset).toBe(60); // UTC+1 = 60 minutes
      expect(payload.timezone.dstOffset).toBe(60);
    });

    test("should transmit timezone data to multiple tabs", async () => {
      // Mock multiple tabs
      browser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://example.com" },
        { id: 2, url: "https://test.com" },
        { id: 3, url: "https://demo.com" }
      ]);
      
      // Set location
      const location = {
        latitude: 52.5200,
        longitude: 13.4050
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Berlin",
          rawOffset: 1,
          dstOffset: 1
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Berlin, Germany",
          address: {
            city: "Berlin",
            country: "Germany"
          }
        })
      });
      
      await background.handleSetLocation(location);
      
      // Enable protection
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Clear previous calls and verify only the broadcast to tabs
      const callsBeforeEnable = browser.tabs.sendMessage.mock.calls.length;
      jest.clearAllMocks();
      
      // Mock tabs again after clearing
      browser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://example.com" },
        { id: 2, url: "https://test.com" },
        { id: 3, url: "https://demo.com" }
      ]);
      
      // Trigger a settings update that will broadcast to all tabs
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: true
        }
      });
      
      await background.broadcastSettingsToTabs(savedSettings);
      
      // Verify all tabs received the message
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(3);
      
      // Verify each tab received timezone data
      const calls = browser.tabs.sendMessage.mock.calls;
      calls.forEach(call => {
        const [tabId, message] = call;
        expect(message.type).toBe("UPDATE_SETTINGS");
        expect(message.payload.timezone).toBeDefined();
        expect(message.payload.timezone.identifier).toBe("Europe/Berlin");
      });
    });
  });

  describe("Integration with Existing Features", () => {
    test("should maintain geolocation spoofing when timezone data is added", async () => {
      // Set location
      const location = {
        latitude: -22.9068,
        longitude: -43.1729
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Sao_Paulo",
          rawOffset: -3,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Rio de Janeiro, Brazil",
          address: {
            city: "Rio de Janeiro",
            country: "Brazil"
          }
        })
      });
      
      await background.handleSetLocation(location);
      
      // Enable protection
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Verify both geolocation and timezone data are transmitted
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];
      const payload = lastBroadcast[1].payload;
      
      // Verify geolocation data
      expect(payload.location).toBeDefined();
      expect(payload.location.latitude).toBe(-22.9068);
      expect(payload.location.longitude).toBe(-43.1729);
      
      // Verify timezone data
      expect(payload.timezone).toBeDefined();
      expect(payload.timezone.identifier).toBe("America/Sao_Paulo");
      expect(payload.timezone.offset).toBe(-180); // UTC-3 = -180 minutes
    });

    test("should work with WebRTC protection enabled", async () => {
      // Set location
      const location = {
        latitude: 55.7558,
        longitude: 37.6173
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Moscow",
          rawOffset: 3,
          dstOffset: 0
        })
      });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Moscow, Russia",
          address: {
            city: "Moscow",
            country: "Russia"
          }
        })
      });
      
      await background.handleSetLocation(location);
      
      // Enable protection
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...savedSettings,
          enabled: false
        }
      });
      
      await background.handleSetProtectionStatus({ enabled: true });
      
      // Enable WebRTC protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0].settings,
          webrtcProtection: false
        }
      });
      
      await background.handleSetWebRTCProtection({ enabled: true });
      
      // Verify all protections are active
      const finalSettings = browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0].settings;
      
      expect(finalSettings.enabled).toBe(true);
      expect(finalSettings.webrtcProtection).toBe(true);
      expect(finalSettings.location).toBeDefined();
      expect(finalSettings.timezone).toBeDefined();
      expect(finalSettings.timezone.identifier).toBe("Europe/Moscow");
      
      // Verify WebRTC privacy settings configured
      expect(browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalled();
    });
  });
});
