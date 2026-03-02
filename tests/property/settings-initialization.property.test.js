/**
 * Property-Based Test: Settings Initialization Responsiveness
 * Feature: geolocation-spoof-extension-mvp
 * 
 * Property 20: Settings Initialization Responsiveness
 * For any saved settings, when the extension initializes, the settings should be 
 * loaded and applied (spoofed location and protection status active) within 1 second.
 * 
 * **Validates: Requirements 6.5, 6.6**
 */

const fc = require("fast-check");
const { test, expect, describe, beforeEach } = require("@jest/globals");

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
      })
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
  tabs: {
    query: jest.fn(async () => [
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://test.com" }
    ]),
    sendMessage: jest.fn(async () => {}),
    onCreated: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    }
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

// Mock fetch for geocoding
global.fetch = jest.fn();

const {
  initialize,
  saveSettings,
  DEFAULT_SETTINGS
} = require("../../background/background.js");

describe("Property 20: Settings Initialization Responsiveness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.browser.storage.local.data = {};
  });

  test("should load and apply settings within 1 second", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enabled: fc.boolean(),
          location: fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
            accuracy: fc.double({ min: 1, max: 100, noNaN: true })
          }),
          timezone: fc.record({
            identifier: fc.constantFrom(
              "America/Los_Angeles",
              "America/New_York",
              "Europe/London",
              "Asia/Tokyo",
              "Australia/Sydney"
            ),
            offset: fc.integer({ min: -720, max: 720 }),
            dstOffset: fc.integer({ min: 0, max: 60 })
          }),
          webrtcProtection: fc.boolean()
        }),
        async (settingsData) => {
          // Save settings to storage
          const settings = {
            ...DEFAULT_SETTINGS,
            ...settingsData
          };
          
          await saveSettings(settings);
          
          // Clear mocks to track initialization calls
          jest.clearAllMocks();
          
          // Measure initialization time
          const startTime = Date.now();
          
          await initialize();
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Verify initialization completed within 1 second (1000ms)
          expect(duration).toBeLessThan(1000);
          
          // Verify badge was updated
          expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalled();
          expect(global.browser.browserAction.setBadgeText).toHaveBeenCalled();
          
          // Verify settings were broadcast to tabs if protection enabled
          if (settingsData.enabled && settingsData.location) {
            expect(global.browser.tabs.query).toHaveBeenCalled();
            expect(global.browser.tabs.sendMessage).toHaveBeenCalled();
          }
          
          // Verify WebRTC protection was applied if enabled
          if (settingsData.webrtcProtection) {
            expect(global.browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should apply protection status to badge within 1 second", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (enabled) => {
          // Save settings with protection status
          const settings = {
            ...DEFAULT_SETTINGS,
            enabled,
            location: enabled ? { latitude: 37.7749, longitude: -122.4194, accuracy: 10 } : null
          };
          
          await saveSettings(settings);
          
          // Clear mocks
          jest.clearAllMocks();
          
          // Measure initialization time
          const startTime = Date.now();
          
          await initialize();
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Verify initialization completed within 1 second
          expect(duration).toBeLessThan(1000);
          
          // Verify badge reflects protection status
          expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
            color: enabled ? "green" : "gray"
          });
          
          expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledWith({
            text: enabled ? "✓" : ""
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should broadcast settings to all tabs within 1 second when protection enabled", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true })
        }),
        async (location) => {
          // Save settings with protection enabled
          const settings = {
            ...DEFAULT_SETTINGS,
            enabled: true,
            location
          };
          
          await saveSettings(settings);
          
          // Clear mocks
          jest.clearAllMocks();
          
          // Measure initialization time
          const startTime = Date.now();
          
          await initialize();
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Verify initialization completed within 1 second
          expect(duration).toBeLessThan(1000);
          
          // Verify settings were broadcast to tabs
          expect(global.browser.tabs.query).toHaveBeenCalled();
          expect(global.browser.tabs.sendMessage).toHaveBeenCalled();
          
          // Verify the message payload contains the location
          const sendMessageCalls = global.browser.tabs.sendMessage.mock.calls;
          expect(sendMessageCalls.length).toBeGreaterThan(0);
          
          // Check that at least one call has the correct message structure
          const hasCorrectMessage = sendMessageCalls.some(call => {
            const message = call[1];
            return message.type === "UPDATE_SETTINGS" &&
                   message.payload.enabled === true &&
                   message.payload.location !== null;
          });
          
          expect(hasCorrectMessage).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should handle empty storage gracefully within 1 second", async () => {
    // Don't save any settings - storage is empty
    global.browser.storage.local.data = {};
    
    const startTime = Date.now();
    
    await initialize();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify initialization completed within 1 second
    expect(duration).toBeLessThan(1000);
    
    // Verify badge was updated with default state (disabled)
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray"
    });
    
    expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledWith({
      text: ""
    });
  });

  test("should not broadcast settings when protection is disabled", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true })
        }),
        async (location) => {
          // Save settings with protection disabled
          const settings = {
            ...DEFAULT_SETTINGS,
            enabled: false,
            location
          };
          
          await saveSettings(settings);
          
          // Clear mocks
          jest.clearAllMocks();
          
          await initialize();
          
          // Verify settings were NOT broadcast to tabs
          expect(global.browser.tabs.sendMessage).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
