/**
 * Property-Based Tests for Settings and Protection Status
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, beforeEach } = require("@jest/globals");
const fc = require("fast-check");

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
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      })
    }
  },
  tabs: {
    query: jest.fn(async () => [
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://test.com" }
    ]),
    sendMessage: jest.fn(async () => {})
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
  
  // Reset fetch mock
  global.fetch = jest.fn();
});

/**
 * Property 17: Protection Status Propagation
 * 
 * Validates: Requirements 5.3, 5.4
 * 
 * For any protection status change (enabled or disabled), all active tabs
 * should receive the updated settings and apply or remove spoofing overrides accordingly.
 */
test("Property 17: Protection Status Propagation", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.boolean(),
      async (enabled) => {
        // Clear require cache to get fresh module
        delete require.cache[backgroundPath];
        
        // Initialize storage with default settings before loading module
        global.browser.storage.local.data.settings = {
          enabled: false,
          location: null,
          timezone: null,
          locationName: null,
          webrtcProtection: false,
          version: "1.0",
          lastUpdated: Date.now()
        };
        
        const { updateSettings, broadcastSettingsToTabs } = require(backgroundPath);
        
        // Clear mock calls from module initialization
        jest.clearAllMocks();
        
        // Update protection status
        const settings = await updateSettings({ enabled });
        
        // Broadcast to tabs
        await broadcastSettingsToTabs(settings);
        
        // Verify tabs.query was called to get all tabs
        if (global.browser.tabs.query.mock.calls.length === 0) {
          return false;
        }
        
        // Verify sendMessage was called for each tab
        const tabCount = (await global.browser.tabs.query()).length;
        const messageCount = global.browser.tabs.sendMessage.mock.calls.length;
        
        // Should attempt to send message to all tabs
        if (messageCount !== tabCount) {
          return false;
        }
        
        // Verify each message contains the updated settings
        for (const call of global.browser.tabs.sendMessage.mock.calls) {
          const [tabId, message] = call;
          
          if (message.type !== "UPDATE_SETTINGS") return false;
          if (message.payload.enabled !== enabled) return false;
        }
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 19: Settings Persistence Round-Trip
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * 
 * For any settings change (spoofed location, protection status, or WebRTC protection),
 * the settings should be saved to storage within 500ms, and reloading the extension
 * should restore the same settings.
 */
test("Property 19: Settings Persistence Round-Trip", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        enabled: fc.boolean(),
        webrtcProtection: fc.boolean(),
        location: fc.option(
          fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
            accuracy: fc.double({ min: 1, max: 100, noNaN: true })
          }),
          { nil: null }
        )
      }),
      async (settingsUpdate) => {
        // Clear require cache to get fresh module
        delete require.cache[backgroundPath];
        const { saveSettings, loadSettings } = require(backgroundPath);
        
        const startTime = Date.now();
        
        // Save settings
        await saveSettings(settingsUpdate);
        
        const saveTime = Date.now() - startTime;
        
        // Should save within 500ms
        if (saveTime > 500) return false;
        
        // Load settings
        const loaded = await loadSettings();
        
        // Verify settings match
        if (loaded.enabled !== settingsUpdate.enabled) return false;
        if (loaded.webrtcProtection !== settingsUpdate.webrtcProtection) return false;
        
        // Verify location if provided
        if (settingsUpdate.location) {
          if (!loaded.location) return false;
          if (Math.abs(loaded.location.latitude - settingsUpdate.location.latitude) > 0.0001) return false;
          if (Math.abs(loaded.location.longitude - settingsUpdate.location.longitude) > 0.0001) return false;
        }
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});
