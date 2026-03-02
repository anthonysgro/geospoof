/**
 * Unit Tests for WebRTC Configuration
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
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      }),
    },
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
  action: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {}),
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
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
      },
    },
  },
};

const backgroundPath = require("path").join(process.cwd(), "background/background.js");

beforeEach(() => {
  // Clear storage before each test
  global.browser.storage.local.data = {};
  jest.clearAllMocks();

  // Clear require cache to get fresh module
  delete require.cache[backgroundPath];
});

describe("WebRTC Configuration", () => {
  /**
   * Test privacy API calls with correct parameters
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  test("should call privacy API with correct parameters when enabling WebRTC protection", async () => {
    const { setWebRTCProtection } = require(backgroundPath);

    await setWebRTCProtection(true);

    // Verify privacy API was called with correct value
    expect(global.browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledWith({
      value: "disable_non_proxied_udp",
    });
    expect(global.browser.privacy.network.webRTCIPHandlingPolicy.set).toHaveBeenCalledTimes(1);
  });

  test("should call privacy API to clear settings when disabling WebRTC protection", async () => {
    const { setWebRTCProtection } = require(backgroundPath);

    await setWebRTCProtection(false);

    // Verify privacy API clear was called
    expect(global.browser.privacy.network.webRTCIPHandlingPolicy.clear).toHaveBeenCalledWith({});
    expect(global.browser.privacy.network.webRTCIPHandlingPolicy.clear).toHaveBeenCalledTimes(1);
  });

  /**
   * Test permission denied handling
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  test("should handle permission denied error when setting WebRTC protection", async () => {
    const { setWebRTCProtection } = require(backgroundPath);

    // Mock privacy API to throw permission error
    global.browser.privacy.network.webRTCIPHandlingPolicy.set = jest.fn(async () => {
      throw new Error("Permission denied");
    });

    await expect(setWebRTCProtection(true)).rejects.toThrow("Permission denied");
  });

  test("should handle permission denied error when clearing WebRTC protection", async () => {
    const { setWebRTCProtection } = require(backgroundPath);

    // Mock privacy API to throw permission error
    global.browser.privacy.network.webRTCIPHandlingPolicy.clear = jest.fn(async () => {
      throw new Error("Permission denied");
    });

    await expect(setWebRTCProtection(false)).rejects.toThrow("Permission denied");
  });

  test("should handle generic errors from privacy API", async () => {
    const { setWebRTCProtection } = require(backgroundPath);

    // Mock privacy API to throw generic error
    global.browser.privacy.network.webRTCIPHandlingPolicy.set = jest.fn(async () => {
      throw new Error("Unknown error");
    });

    await expect(setWebRTCProtection(true)).rejects.toThrow("Unknown error");
  });

  test("should not throw when privacy API succeeds", async () => {
    // Clear require cache to get fresh module
    delete require.cache[backgroundPath];
    const { setWebRTCProtection } = require(backgroundPath);

    // Reset mocks to default behavior (success)
    global.browser.privacy.network.webRTCIPHandlingPolicy.set = jest.fn(async () => {});
    global.browser.privacy.network.webRTCIPHandlingPolicy.clear = jest.fn(async () => {});

    // Should not throw
    await expect(setWebRTCProtection(true)).resolves.not.toThrow();
    await expect(setWebRTCProtection(false)).resolves.not.toThrow();
  });
});
