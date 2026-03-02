/**
 * Unit Tests for Badge Icon Colors
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

// Mock fetch
global.fetch = jest.fn();

const backgroundPath = require("path").join(process.cwd(), "background/background.js");

beforeEach(() => {
  // Clear storage before each test
  global.browser.storage.local.data = {};
  jest.clearAllMocks();

  // Clear require cache to get fresh module
  delete require.cache[backgroundPath];
});

describe("Badge Icon Colors", () => {
  /**
   * Test green badge when protection enabled
   * Validates: Requirements 5.7, 5.8
   */
  test("should display green badge with checkmark when protection is enabled", () => {
    const { updateBadge } = require(backgroundPath);

    updateBadge(true);

    // Verify badge color is set to green
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "green",
    });

    // Verify badge text is set to checkmark
    expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledWith({
      text: "✓",
    });
  });

  /**
   * Test gray badge when protection disabled
   * Validates: Requirements 5.7, 5.8
   */
  test("should display gray badge with empty text when protection is disabled", () => {
    const { updateBadge } = require(backgroundPath);

    updateBadge(false);

    // Verify badge color is set to gray
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray",
    });

    // Verify badge text is empty
    expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledWith({
      text: "",
    });
  });

  test("should call both badge API methods when updating badge", () => {
    const { updateBadge } = require(backgroundPath);

    updateBadge(true);

    // Both methods should be called
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledTimes(1);
    expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledTimes(1);
  });

  test("should handle multiple badge updates", () => {
    const { updateBadge } = require(backgroundPath);

    // Enable
    updateBadge(true);
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "green",
    });

    // Disable
    updateBadge(false);
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "gray",
    });

    // Enable again
    updateBadge(true);
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "green",
    });

    // Should have been called 3 times total
    expect(global.browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledTimes(3);
    expect(global.browser.browserAction.setBadgeText).toHaveBeenCalledTimes(3);
  });
});
