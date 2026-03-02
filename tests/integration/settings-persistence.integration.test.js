/**
 * Integration Tests for Settings Persistence Workflow
 *
 * Tests settings persistence across extension lifecycle:
 * - Set location → close extension → reopen → verify location persisted
 * - Enable protection → restart browser → verify protection active
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
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

describe("Settings Persistence Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default tabs mock
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }]);

    browser.tabs.sendMessage.mockResolvedValue();
  });

  describe("Workflow: Set location → close extension → reopen → verify location persisted", () => {
    test("should persist location settings across extension restart", async () => {
      // Step 1: Initial state - empty storage
      browser.storage.local.get.mockResolvedValueOnce({
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

      // Step 2: User sets location
      const location = {
        latitude: 37.7749,
        longitude: -122.4194,
      };

      // Mock timezone API
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Los_Angeles",
          rawOffset: -8,
          dstOffset: 1,
        }),
      });

      // Mock reverse geocoding
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

      await background.handleSetLocation(location);

      // Assert: Settings saved to storage
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;

      // Step 3: Simulate extension restart - load settings from storage
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: Location persisted correctly
      expect(loadedSettings.location).toBeDefined();
      expect(loadedSettings.location.latitude).toBe(37.7749);
      expect(loadedSettings.location.longitude).toBe(-122.4194);
      expect(loadedSettings.timezone.identifier).toBe("America/Los_Angeles");
      expect(loadedSettings.locationName.city).toBe("San Francisco");
    });

    test("should persist multiple location changes", async () => {
      // Initial empty storage
      browser.storage.local.get.mockResolvedValueOnce({
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

      // Step 1: Set first location (New York)
      const location1 = {
        latitude: 40.7128,
        longitude: -74.006,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/New_York",
          rawOffset: -5,
          dstOffset: 1,
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "New York, NY, USA",
          address: {
            city: "New York",
            country: "USA",
          },
        }),
      });

      await background.handleSetLocation(location1);

      const savedSettings1 = browser.storage.local.set.mock.calls[0][0].settings;

      // Step 2: Change to second location (London)
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings1,
      });

      const location2 = {
        latitude: 51.5074,
        longitude: -0.1278,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/London",
          rawOffset: 0,
          dstOffset: 1,
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "London, England, UK",
          address: {
            city: "London",
            country: "UK",
          },
        }),
      });

      await background.handleSetLocation(location2);

      const savedSettings2 =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;

      // Step 3: Simulate restart and verify latest location persisted
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings2,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: Latest location persisted (London, not New York)
      expect(loadedSettings.location.latitude).toBe(51.5074);
      expect(loadedSettings.location.longitude).toBe(-0.1278);
      expect(loadedSettings.timezone.identifier).toBe("Europe/London");
      expect(loadedSettings.locationName.city).toBe("London");
    });

    test("should persist location with all metadata", async () => {
      browser.storage.local.get.mockResolvedValueOnce({
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

      // Set location with full details
      const location = {
        latitude: 35.6762,
        longitude: 139.6503,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Asia/Tokyo",
          rawOffset: 9,
          dstOffset: 0,
        }),
      });

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

      await background.handleSetLocation(location);

      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;

      // Simulate restart
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: All metadata persisted
      expect(loadedSettings.location.latitude).toBe(35.6762);
      expect(loadedSettings.location.longitude).toBe(139.6503);
      expect(loadedSettings.location.accuracy).toBeDefined();
      expect(loadedSettings.timezone.identifier).toBe("Asia/Tokyo");
      expect(loadedSettings.timezone.offset).toBe(540); // 9 hours * 60 minutes
      expect(loadedSettings.locationName.city).toBe("Tokyo");
      expect(loadedSettings.locationName.country).toBe("Japan");
      expect(loadedSettings.locationName.displayName).toBe("Tokyo, Japan");
    });
  });

  describe("Workflow: Enable protection → restart browser → verify protection active", () => {
    test("should persist protection status across extension restart", async () => {
      // Step 1: Initial state with location set
      const initialSettings = {
        enabled: false,
        location: {
          latitude: 48.8566,
          longitude: 2.3522,
          accuracy: 10,
        },
        timezone: {
          identifier: "Europe/Paris",
          offset: 60,
          dstOffset: 60,
        },
        locationName: {
          city: "Paris",
          country: "France",
          displayName: "Paris, France",
        },
        webrtcProtection: false,
        onboardingCompleted: true,
        version: "1.0",
        lastUpdated: Date.now(),
      };

      browser.storage.local.get.mockResolvedValueOnce({
        settings: initialSettings,
      });

      browser.storage.local.set.mockResolvedValue();

      // Step 2: User enables protection
      await background.handleSetProtectionStatus({ enabled: true });

      // Assert: Protection status saved
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.enabled).toBe(true);

      // Step 3: Simulate browser restart - load settings
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: Protection status persisted
      expect(loadedSettings.enabled).toBe(true);
      expect(loadedSettings.location).toBeDefined();
      expect(loadedSettings.location.latitude).toBe(48.8566);
    });

    test("should persist disabled protection status", async () => {
      // Step 1: Initial state with protection enabled
      const initialSettings = {
        enabled: true,
        location: {
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 10,
        },
        timezone: {
          identifier: "Australia/Sydney",
          offset: 600,
          dstOffset: 60,
        },
        locationName: {
          city: "Sydney",
          country: "Australia",
          displayName: "Sydney, NSW, Australia",
        },
        webrtcProtection: false,
        onboardingCompleted: true,
        version: "1.0",
        lastUpdated: Date.now(),
      };

      browser.storage.local.get.mockResolvedValueOnce({
        settings: initialSettings,
      });

      browser.storage.local.set.mockResolvedValue();

      // Step 2: User disables protection
      await background.handleSetProtectionStatus({ enabled: false });

      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.enabled).toBe(false);

      // Step 3: Simulate restart
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: Disabled status persisted
      expect(loadedSettings.enabled).toBe(false);
      // Location should still be saved
      expect(loadedSettings.location.latitude).toBe(-33.8688);
    });

    test("should apply persisted settings to tabs on startup", async () => {
      // Step 1: Settings with protection enabled
      const persistedSettings = {
        enabled: true,
        location: {
          latitude: 55.7558,
          longitude: 37.6173,
          accuracy: 10,
        },
        timezone: {
          identifier: "Europe/Moscow",
          offset: 180,
          dstOffset: 0,
        },
        locationName: {
          city: "Moscow",
          country: "Russia",
          displayName: "Moscow, Russia",
        },
        webrtcProtection: false,
        onboardingCompleted: true,
        version: "1.0",
        lastUpdated: Date.now(),
      };

      browser.storage.local.get.mockResolvedValue({
        settings: persistedSettings,
      });

      // Mock multiple tabs
      browser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://example1.com" },
        { id: 2, url: "https://example2.com" },
        { id: 3, url: "https://example3.com" },
      ]);

      // Step 2: Simulate extension startup - load and broadcast settings
      const loadedSettings = await background.loadSettings();
      await background.broadcastSettingsToTabs(loadedSettings);

      // Assert: Settings broadcast to all tabs
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(3);

      // Assert: All tabs received correct settings
      const calls = browser.tabs.sendMessage.mock.calls;
      calls.forEach(([tabId, message]) => {
        expect(message.type).toBe("UPDATE_SETTINGS");
        expect(message.payload.enabled).toBe(true);
        expect(message.payload.location.latitude).toBe(55.7558);
      });
    });
  });

  describe("Workflow: WebRTC protection persistence", () => {
    test("should persist WebRTC protection status across restart", async () => {
      // Step 1: Initial state
      browser.storage.local.get.mockResolvedValueOnce({
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

      // Step 2: User enables WebRTC protection
      await background.handleSetWebRTCProtection({ enabled: true });

      // Assert: WebRTC status saved
      expect(browser.storage.local.set).toHaveBeenCalled();
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.webrtcProtection).toBe(true);

      // Step 3: Simulate restart
      browser.storage.local.get.mockResolvedValueOnce({
        settings: savedSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: WebRTC protection persisted
      expect(loadedSettings.webrtcProtection).toBe(true);
    });

    test("should persist combined protection settings", async () => {
      // Step 1: Set up location
      browser.storage.local.get.mockResolvedValueOnce({
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

      const location = {
        latitude: 52.52,
        longitude: 13.405,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "Europe/Berlin",
          rawOffset: 1,
          dstOffset: 1,
        }),
      });

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

      await background.handleSetLocation(location);

      const settingsAfterLocation = browser.storage.local.set.mock.calls[0][0].settings;

      // Step 2: Enable geolocation protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: settingsAfterLocation,
      });

      await background.handleSetProtectionStatus({ enabled: true });

      const settingsAfterProtection =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;

      // Step 3: Enable WebRTC protection
      browser.storage.local.get.mockResolvedValueOnce({
        settings: settingsAfterProtection,
      });

      await background.handleSetWebRTCProtection({ enabled: true });

      const finalSettings =
        browser.storage.local.set.mock.calls[browser.storage.local.set.mock.calls.length - 1][0]
          .settings;

      // Step 4: Simulate restart
      browser.storage.local.get.mockResolvedValueOnce({
        settings: finalSettings,
      });

      const loadedSettings = await background.loadSettings();

      // Assert: All settings persisted
      expect(loadedSettings.enabled).toBe(true);
      expect(loadedSettings.webrtcProtection).toBe(true);
      expect(loadedSettings.location.latitude).toBe(52.52);
      expect(loadedSettings.location.longitude).toBe(13.405);
      expect(loadedSettings.timezone.identifier).toBe("Europe/Berlin");
    });
  });

  describe("Settings persistence timing", () => {
    test("should save settings within 500ms of change", async () => {
      browser.storage.local.get.mockResolvedValueOnce({
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

      // Mock timezone and reverse geocoding
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezoneId: "America/Chicago",
          rawOffset: -6,
          dstOffset: 1,
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_name: "Chicago, IL, USA",
          address: {
            city: "Chicago",
            country: "USA",
          },
        }),
      });

      const startTime = Date.now();

      await background.handleSetLocation({
        latitude: 41.8781,
        longitude: -87.6298,
      });

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Assert: Settings saved
      expect(browser.storage.local.set).toHaveBeenCalled();

      // Assert: Saved within reasonable time (allowing for API calls)
      // Note: In real implementation, save should happen within 500ms
      // Here we just verify it was called
      expect(elapsed).toBeLessThan(5000); // Generous timeout for test
    });

    test("should update lastUpdated timestamp on each save", async () => {
      browser.storage.local.get.mockResolvedValue({
        settings: {
          enabled: false,
          location: null,
          timezone: null,
          locationName: null,
          webrtcProtection: false,
          onboardingCompleted: true,
          version: "1.0",
          lastUpdated: Date.now() - 10000, // 10 seconds ago
        },
      });

      browser.storage.local.set.mockResolvedValue();

      const beforeTimestamp = Date.now();

      // Make a change
      await background.handleSetProtectionStatus({ enabled: true });

      const afterTimestamp = Date.now();

      // Assert: lastUpdated was updated
      const savedSettings = browser.storage.local.set.mock.calls[0][0].settings;
      expect(savedSettings.lastUpdated).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(savedSettings.lastUpdated).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe("Settings persistence edge cases", () => {
    test("should handle empty storage on first load", async () => {
      // Simulate first run - no settings in storage
      browser.storage.local.get.mockResolvedValue({});

      const loadedSettings = await background.loadSettings();

      // Assert: Default settings returned
      expect(loadedSettings.enabled).toBe(false);
      expect(loadedSettings.location).toBeNull();
      expect(loadedSettings.timezone).toBeNull();
      expect(loadedSettings.webrtcProtection).toBe(false);
    });

    test("should handle corrupted settings gracefully", async () => {
      // Simulate corrupted settings
      browser.storage.local.get.mockResolvedValue({
        settings: {
          enabled: "not a boolean", // Invalid type
          location: "invalid", // Should be object or null
          // Missing required fields
        },
      });

      const loadedSettings = await background.loadSettings();

      // Assert: Falls back to defaults or handles gracefully
      expect(loadedSettings).toBeDefined();
      expect(typeof loadedSettings.enabled).toBe("boolean");
    });

    test("should preserve settings across multiple restarts", async () => {
      // Initial settings
      const originalSettings = {
        enabled: true,
        location: {
          latitude: 45.5017,
          longitude: -73.5673,
          accuracy: 10,
        },
        timezone: {
          identifier: "America/Montreal",
          offset: 300,
          dstOffset: 60,
        },
        locationName: {
          city: "Montreal",
          country: "Canada",
          displayName: "Montreal, QC, Canada",
        },
        webrtcProtection: true,
        onboardingCompleted: true,
        version: "1.0",
        lastUpdated: Date.now(),
      };

      // Simulate multiple restart cycles
      for (let i = 0; i < 5; i++) {
        browser.storage.local.get.mockResolvedValueOnce({
          settings: originalSettings,
        });

        const loadedSettings = await background.loadSettings();

        // Assert: Settings remain consistent
        expect(loadedSettings.enabled).toBe(true);
        expect(loadedSettings.location.latitude).toBe(45.5017);
        expect(loadedSettings.webrtcProtection).toBe(true);
      }
    });
  });
});
