/**
 * Unit tests for onboarding functionality
 * Tests onboarding display on first install and completion flag persistence
 * Requirements: 7.1
 */

// Mock browser API BEFORE requiring background.js
global.browser = {
  storage: {
    local: {
      data: {},
      get: jest.fn(async (key) => {
        if (key === "settings") {
          return { settings: global.browser.storage.local.data.settings };
        }
        return {};
      }),
      set: jest.fn(async (obj) => {
        if (obj.settings) {
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      }),
    },
  },
  action: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {}),
  },
  browserAction: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {}),
  },
  tabs: {
    query: jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    onCreated: {
      addListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
    },
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
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
      },
    },
  },
};

// Mock fetch for geocoding
global.fetch = jest.fn();

const {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  handleCompleteOnboarding,
} = require("../../../background/background.js");

describe("Onboarding Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.browser.storage.local.data = {};
  });

  describe("First Installation", () => {
    test("should have onboardingCompleted set to false in DEFAULT_SETTINGS", () => {
      expect(DEFAULT_SETTINGS.onboardingCompleted).toBe(false);
    });

    test("should return onboardingCompleted as false when settings are empty", async () => {
      global.browser.storage.local.data = {};

      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(false);
    });

    test("should return onboardingCompleted as false on first load", async () => {
      global.browser.storage.local.data.settings = {
        enabled: false,
        location: null,
        timezone: null,
        locationName: null,
        webrtcProtection: false,
        version: "1.0",
        lastUpdated: Date.now(),
        // onboardingCompleted not present
      };

      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(false);
    });
  });

  describe("Onboarding Completion", () => {
    test("should set onboardingCompleted to true when completed", async () => {
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: false,
      };

      await handleCompleteOnboarding();

      const savedSettings = global.browser.storage.local.data.settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
    });

    test("should persist onboardingCompleted flag in storage", async () => {
      const settingsWithOnboarding = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      await saveSettings(settingsWithOnboarding);

      const savedSettings = global.browser.storage.local.data.settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
      expect(savedSettings.lastUpdated).toBeDefined();
    });

    test("should load onboardingCompleted flag from storage", async () => {
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(true);
    });

    test("should validate onboardingCompleted as boolean", async () => {
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: "true", // Invalid type
      };

      const settings = await loadSettings();

      // Should default to false when invalid type
      expect(settings.onboardingCompleted).toBe(false);
    });
  });

  describe("Onboarding State Transitions", () => {
    test("should transition from not completed to completed", async () => {
      // Initial state: not completed
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: false,
      };

      const initialSettings = await loadSettings();
      expect(initialSettings.onboardingCompleted).toBe(false);

      // Complete onboarding
      await handleCompleteOnboarding();

      // Verify state changed
      const updatedSettings = await loadSettings();
      expect(updatedSettings.onboardingCompleted).toBe(true);
    });

    test("should remain completed after being set", async () => {
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      // Load multiple times
      const settings1 = await loadSettings();
      const settings2 = await loadSettings();
      const settings3 = await loadSettings();

      expect(settings1.onboardingCompleted).toBe(true);
      expect(settings2.onboardingCompleted).toBe(true);
      expect(settings3.onboardingCompleted).toBe(true);
    });
  });

  describe("Onboarding with Other Settings", () => {
    test("should preserve other settings when completing onboarding", async () => {
      global.browser.storage.local.data.settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        onboardingCompleted: false,
      };

      await handleCompleteOnboarding();

      const savedSettings = global.browser.storage.local.data.settings;
      expect(savedSettings.enabled).toBe(true);
      expect(savedSettings.location).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
      });
      expect(savedSettings.onboardingCompleted).toBe(true);
    });

    test("should not affect onboarding flag when updating other settings", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
        enabled: false,
      };

      await saveSettings(settings);

      const savedSettings = global.browser.storage.local.data.settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
      expect(savedSettings.enabled).toBe(false);
    });
  });
});
