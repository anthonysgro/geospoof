/**
 * Unit Tests for Settings Management
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, expect, describe, beforeEach } = require("@jest/globals");

// Mock browser API
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
          // Simulate quota exceeded error if data is too large
          const dataSize = JSON.stringify(obj.settings).length;
          if (dataSize > 100000) {
            throw new Error("QuotaExceededError: Storage quota exceeded");
          }
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      })
    }
  },
  tabs: {
    query: jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    onCreated: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {})
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
    }
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: {
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {})
      }
    }
  }
};

const backgroundPath = require("path").join(process.cwd(), "background/background.js");

beforeEach(() => {
  // Clear storage before each test
  global.browser.storage.local.data = {};
  jest.clearAllMocks();
  
  // Clear require cache to get fresh module
  delete require.cache[backgroundPath];
});

describe("Settings Edge Cases", () => {
  /**
   * Test corrupted settings data recovery
   * Validates: Requirements 6.7
   */
  test("should recover from corrupted settings data", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = require(backgroundPath);
    
    // Set corrupted data in storage
    global.browser.storage.local.data.settings = {
      enabled: "not a boolean", // Invalid type
      location: {
        latitude: 200, // Out of range
        longitude: -500, // Out of range
        accuracy: "invalid"
      },
      timezone: "not an object", // Invalid type
      webrtcProtection: null, // Invalid type
      version: 123 // Invalid type
    };
    
    // Load settings should return defaults for invalid fields
    const settings = await loadSettings();
    
    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.location).toBeNull(); // Invalid coordinates should be reset
    expect(settings.timezone).toBeNull(); // Invalid timezone should be reset
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });
  
  /**
   * Test storage quota exceeded handling
   * Validates: Requirements 6.7
   */
  test("should handle storage quota exceeded error", async () => {
    const { saveSettings } = require(backgroundPath);
    
    // Create settings with very large data that will exceed quota
    const largeSettings = {
      enabled: true,
      location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      timezone: { identifier: "America/Los_Angeles", offset: 480, dstOffset: 60 },
      locationName: {
        city: "A".repeat(50000), // Very large string
        country: "B".repeat(50000),
        displayName: "C".repeat(50000)
      },
      webrtcProtection: false,
      version: "1.0"
    };
    
    // Attempt to save should throw error
    await expect(saveSettings(largeSettings)).rejects.toThrow(
      "Storage quota exceeded and unable to save settings"
    );
  });
  
  /**
   * Test default values when storage is empty
   * Validates: Requirements 6.7
   */
  test("should return default values when storage is empty", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = require(backgroundPath);
    
    // Ensure storage is empty
    await global.browser.storage.local.clear();
    
    const settings = await loadSettings();
    
    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.location).toBeNull();
    expect(settings.timezone).toBeNull();
    expect(settings.locationName).toBeNull();
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });
  
  /**
   * Test partial corruption recovery
   */
  test("should recover valid fields from partially corrupted settings", async () => {
    const { loadSettings } = require(backgroundPath);
    
    // Set partially corrupted data
    global.browser.storage.local.data.settings = {
      enabled: true, // Valid
      location: {
        latitude: 37.7749, // Valid
        longitude: -122.4194, // Valid
        accuracy: 10 // Valid
      },
      timezone: "invalid", // Invalid - should be reset
      locationName: {
        city: "San Francisco", // Valid
        country: "USA", // Valid
        displayName: "San Francisco, CA, USA" // Valid
      },
      webrtcProtection: "yes", // Invalid - should be reset
      version: "1.0" // Valid
    };
    
    const settings = await loadSettings();
    
    // Valid fields should be preserved
    expect(settings.enabled).toBe(true);
    expect(settings.location.latitude).toBe(37.7749);
    expect(settings.location.longitude).toBe(-122.4194);
    expect(settings.locationName.city).toBe("San Francisco");
    expect(settings.version).toBe("1.0");
    
    // Invalid fields should be reset to defaults
    expect(settings.timezone).toBeNull();
    expect(settings.webrtcProtection).toBe(false);
  });
  
  /**
   * Test coordinate boundary validation
   */
  test("should reject coordinates outside valid ranges", async () => {
    const { loadSettings } = require(backgroundPath);
    
    // Test latitude out of range
    global.browser.storage.local.data.settings = {
      enabled: true,
      location: {
        latitude: 91, // Out of range
        longitude: 0,
        accuracy: 10
      }
    };
    
    let settings = await loadSettings();
    expect(settings.location).toBeNull();
    
    // Test longitude out of range
    global.browser.storage.local.data.settings = {
      enabled: true,
      location: {
        latitude: 0,
        longitude: -181, // Out of range
        accuracy: 10
      }
    };
    
    settings = await loadSettings();
    expect(settings.location).toBeNull();
  });
  
  /**
   * Test settings with missing required fields
   */
  test("should handle settings with missing fields", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = require(backgroundPath);
    
    // Set incomplete settings
    global.browser.storage.local.data.settings = {
      enabled: true
      // Missing all other fields
    };
    
    const settings = await loadSettings();
    
    expect(settings.enabled).toBe(true);
    expect(settings.location).toBeNull();
    expect(settings.timezone).toBeNull();
    expect(settings.locationName).toBeNull();
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });
});
