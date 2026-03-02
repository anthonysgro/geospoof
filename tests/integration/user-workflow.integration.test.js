/**
 * Integration Tests for Complete User Workflows
 *
 * Tests end-to-end user workflows including:
 * - Search location → select result → enable protection → verify spoofing
 * - Manual coordinates → enable protection → verify spoofing
 * - Enable WebRTC protection → verify privacy settings
 *
 * Requirements: All core user workflows
 */

// Mock browser API
global.browser = {
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    onCreated: {
      addListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  action: {
    setBadgeBackgroundColor: jest.fn(),
    setBadgeText: jest.fn(),
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
        set: jest.fn(),
        clear: jest.fn(),
      },
    },
  },
};

// Mock fetch for geocoding
global.fetch = jest.fn();

const background = require("../../background/background.js");

describe("User Workflow Integration Tests", () => {
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
        lastUpdated: Date.now(),
      },
    });

    browser.storage.local.set.mockResolvedValue();

    // Default tabs mock
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }]);

    browser.tabs.sendMessage.mockResolvedValue();
  });

  describe("Workflow: Search location → select result → enable protection → verify spoofing", () => {
    test("should complete full workflow with location search", async () => {
      // Step 1: User searches for "San Francisco"
      const searchQuery = "San Francisco";

      // Mock geocoding API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            display_name: "San Francisco, CA, USA",
            lat: "37.7749",
            lon: "-122.4194",
            address: {
              city: "San Francisco",
              country: "USA",
            },
          },
          {
            display_name: "San Francisco, Philippines",
            lat: "10.3333",
            lon: "123.7833",
            address: {
              city: "San Francisco",
              country: "Philippines",
            },
          },
        ],
      });

      // Act: Geocode query
      const results = await background.geocodeQuery(searchQuery);

      // Assert: Results returned
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("San Francisco, CA, USA");
      expect(results[0].latitude).toBe(37.7749);
      expect(results[0].longitude).toBe(-122.4194);

      // Step 2: User selects first result
      const selectedLocation = {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };

      // Mock timezone API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Los_Angeles",
          rawOffset: -8,
          dstOffset: 1,
        }),
      });

      // Mock reverse geocoding response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "San Francisco, CA, USA",
          address: {
            city: "San Francisco",
            country: "USA",
          },
        }),
      });

      // Act: Set location
      await background.handleSetLocation(selectedLocation);

      // Assert: Location saved to storage
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.location.latitude).toBe(37.7749);
      expect(savedSettings.location.longitude).toBe(-122.4194);
      expect(savedSettings.timezone.identifier).toBe("America/Los_Angeles");

      // Assert: Settings broadcast to tabs
      expect(browser.tabs.sendMessage).toHaveBeenCalled();

      // Step 3: User enables protection
      // Mock storage to return settings with location set
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[0][0].settings,
          enabled: false, // Current state before enabling
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: Protection status saved
      expect(browser.storage.local.set).toHaveBeenCalled();
      const protectionSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;
      expect(protectionSettings.enabled).toBe(true);

      // Assert: Badge updated
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "green",
      });
      expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({
        text: "✓",
      });

      // Step 4: Verify spoofing would be active
      // Settings broadcast to all tabs with enabled=true and location set
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];

      expect(lastBroadcast[1].type).toBe("UPDATE_SETTINGS");
      expect(lastBroadcast[1].payload.enabled).toBe(true);
      expect(lastBroadcast[1].payload.location).toBeDefined();
      expect(lastBroadcast[1].payload.location.latitude).toBe(37.7749);
    });

    test("should handle workflow with multiple search results", async () => {
      // Step 1: Search for "London"
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            display_name: "London, England, UK",
            lat: "51.5074",
            lon: "-0.1278",
            address: {
              city: "London",
              country: "UK",
            },
          },
          {
            display_name: "London, Ontario, Canada",
            lat: "42.9849",
            lon: "-81.2453",
            address: {
              city: "London",
              country: "Canada",
            },
          },
          {
            display_name: "London, Kentucky, USA",
            lat: "37.1289",
            lon: "-84.0833",
            address: {
              city: "London",
              country: "USA",
            },
          },
        ],
      });

      const results = await background.geocodeQuery("London");

      // Assert: Multiple results returned
      expect(results.length).toBeGreaterThanOrEqual(3);

      // Step 2: User selects second result (London, Ontario)
      const selectedLocation = {
        latitude: results[1].latitude,
        longitude: results[1].longitude,
      };

      // Mock timezone API
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Toronto",
          rawOffset: -5,
          dstOffset: 1,
        }),
      });

      // Mock reverse geocoding
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "London, Ontario, Canada",
          address: {
            city: "London",
            country: "Canada",
          },
        }),
      });

      await background.handleSetLocation(selectedLocation);

      // Assert: Correct location saved
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.location.latitude).toBe(42.9849);
      expect(savedSettings.location.longitude).toBe(-81.2453);
      expect(savedSettings.timezone.identifier).toBe("America/Toronto");
    });
  });

  describe("Workflow: Manual coordinates → enable protection → verify spoofing", () => {
    test("should complete full workflow with manual coordinates", async () => {
      // Step 1: User enters manual coordinates (Tokyo)
      const manualLocation = {
        latitude: 35.6762,
        longitude: 139.6503,
      };

      // Mock timezone API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Tokyo",
          rawOffset: 9,
          dstOffset: 0,
        }),
      });

      // Mock reverse geocoding response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Tokyo, Japan",
          address: {
            city: "Tokyo",
            country: "Japan",
          },
        }),
      });

      // Act: Set location
      await background.handleSetLocation(manualLocation);

      // Assert: Location saved with correct coordinates
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.location.latitude).toBe(35.6762);
      expect(savedSettings.location.longitude).toBe(139.6503);
      expect(savedSettings.timezone.identifier).toBe("Asia/Tokyo");
      expect(savedSettings.locationName.city).toBe("Tokyo");

      // Step 2: User enables protection
      // Mock storage to return settings with location set
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[0][0].settings,
          enabled: false, // Current state before enabling
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: Protection enabled
      const protectionSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;
      expect(protectionSettings.enabled).toBe(true);

      // Assert: Badge updated to show protection active
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "green",
      });

      // Step 3: Verify settings broadcast to tabs
      const broadcastCalls = browser.tabs.sendMessage.mock.calls;
      expect(broadcastCalls.length).toBeGreaterThan(0);

      const lastBroadcast = broadcastCalls[broadcastCalls.length - 1];
      expect(lastBroadcast[1].type).toBe("UPDATE_SETTINGS");
      expect(lastBroadcast[1].payload.enabled).toBe(true);
      expect(lastBroadcast[1].payload.location.latitude).toBe(35.6762);
      expect(lastBroadcast[1].payload.location.longitude).toBe(139.6503);
    });

    test("should handle edge case coordinates (near poles)", async () => {
      // Step 1: User enters coordinates near North Pole
      const polarLocation = {
        latitude: 89.5,
        longitude: 45.0,
      };

      // Mock timezone API (Arctic)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "UTC",
          rawOffset: 0,
          dstOffset: 0,
        }),
      });

      // Mock reverse geocoding (may fail for polar regions)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Arctic Ocean",
          address: {},
        }),
      });

      // Act: Set location
      await background.handleSetLocation(polarLocation);

      // Assert: Location saved correctly
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.location.latitude).toBe(89.5);
      expect(savedSettings.location.longitude).toBe(45.0);

      // Step 2: Enable protection
      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: Protection works even with unusual coordinates
      const protectionSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;
      expect(protectionSettings.enabled).toBe(true);
    });

    test("should handle boundary coordinates", async () => {
      // Test coordinates at valid boundaries
      const boundaryLocations = [
        { latitude: -90, longitude: -180 }, // South Pole, Date Line
        { latitude: 90, longitude: 180 }, // North Pole, Date Line
        { latitude: 0, longitude: 0 }, // Null Island
      ];

      for (const location of boundaryLocations) {
        // Mock timezone API
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            timezoneId: "UTC",
            rawOffset: 0,
            dstOffset: 0,
          }),
        });

        // Mock reverse geocoding
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            display_name: "Ocean",
            address: {},
          }),
        });

        // Act: Set location
        await background.handleSetLocation(location);

        // Assert: Location accepted
        const savedSettings =
          browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
            .settings;
        expect(savedSettings.location.latitude).toBe(location.latitude);
        expect(savedSettings.location.longitude).toBe(location.longitude);
      }
    });
  });

  describe("Workflow: Enable WebRTC protection → verify privacy settings", () => {
    test("should enable WebRTC protection and configure privacy settings", async () => {
      // Step 1: User enables WebRTC protection
      await background.handleSetWebRTCProtection({ enabled: true });

      // Assert: Privacy API called with correct settings
      expect(browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledWith({
        value: "disable_non_proxied_udp",
      });

      // Assert: Settings saved to storage
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.webrtcProtection).toBe(true);
    });

    test("should disable WebRTC protection and restore settings", async () => {
      // Step 1: Enable WebRTC protection first
      await background.handleSetWebRTCProtection({ enabled: true });

      jest.clearAllMocks();

      // Step 2: User disables WebRTC protection
      await background.handleSetWebRTCProtection({ enabled: false });

      // Assert: Privacy API called to clear settings
      expect(browser.privacy.network.webRTCIPHandlingPolicy.clear).toHaveBeenCalled();

      // Assert: Settings saved to storage
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.webrtcProtection).toBe(false);
    });

    test("should combine location spoofing with WebRTC protection", async () => {
      // Step 1: Set location
      const location = {
        latitude: 48.8566,
        longitude: 2.3522,
      };

      // Mock timezone API
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Paris",
          rawOffset: 1,
          dstOffset: 1,
        }),
      });

      // Mock reverse geocoding
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Paris, France",
          address: {
            city: "Paris",
            country: "France",
          },
        }),
      });

      await background.handleSetLocation(location);

      // Step 2: Enable protection
      // Mock storage to return settings with location set
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[0][0].settings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Step 3: Enable WebRTC protection
      // Mock storage to return settings with protection enabled
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[
            browser.storage.local.set.mock.calls.length - 1
          ][0].settings,
          webrtcProtection: false,
        },
      });

      await background.handleSetWebRTCProtection({ enabled: true });

      // Assert: Both protections active
      const savedSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;
      expect(savedSettings.enabled).toBe(true);
      expect(savedSettings.webrtcProtection).toBe(true);
      expect(savedSettings.location.latitude).toBe(48.8566);

      // Assert: Privacy API configured
      expect(browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledWith({
        value: "disable_non_proxied_udp",
      });

      // Assert: Badge shows protection active
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "green",
      });
    });
  });

  describe("Complete workflow with all features", () => {
    test("should handle full workflow: search → select → enable all protections → verify", async () => {
      // Step 1: Search for location
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            display_name: "Berlin, Germany",
            lat: "52.5200",
            lon: "13.4050",
            address: {
              city: "Berlin",
              country: "Germany",
            },
          },
        ],
      });

      const results = await background.geocodeQuery("Berlin");
      expect(results).toHaveLength(1);

      // Step 2: Select location
      const selectedLocation = {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };

      // Mock timezone API
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Berlin",
          rawOffset: 1,
          dstOffset: 1,
        }),
      });

      // Mock reverse geocoding
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Berlin, Germany",
          address: {
            city: "Berlin",
            country: "Germany",
          },
        }),
      });

      await background.handleSetLocation(selectedLocation);

      // Step 3: Enable geolocation protection
      // Mock storage to return settings with location set
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[0][0].settings,
          enabled: false,
        },
      });

      await background.handleSetProtectionStatus({ enabled: true });

      // Step 4: Enable WebRTC protection
      // Mock storage to return settings with protection enabled
      browser.storage.local.get.mockResolvedValueOnce({
        settings: {
          ...browser.storage.local.set.mock.calls[
            browser.storage.local.set.mock.calls.length - 1
          ][0].settings,
          webrtcProtection: false,
        },
      });

      await background.handleSetWebRTCProtection({ enabled: true });

      // Assert: All settings configured correctly
      const finalSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;

      expect(finalSettings.enabled).toBe(true);
      expect(finalSettings.webrtcProtection).toBe(true);
      expect(finalSettings.location.latitude).toBe(52.52);
      expect(finalSettings.location.longitude).toBe(13.405);
      expect(finalSettings.timezone.identifier).toBe("Europe/Berlin");
      expect(finalSettings.locationName.city).toBe("Berlin");

      // Assert: Privacy settings configured
      expect(browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalled();

      // Assert: Badge shows active protection
      expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "green",
      });

      // Assert: Settings broadcast to all tabs
      expect(browser.tabs.sendMessage).toHaveBeenCalled();
      const lastBroadcast =
        browser.tabs.sendMessage.mock.calls[browser.tabs.sendMessage.mock.calls.length - 1];
      expect(lastBroadcast[1].type).toBe("UPDATE_SETTINGS");
      expect(lastBroadcast[1].payload.enabled).toBe(true);
    });
  });
});
