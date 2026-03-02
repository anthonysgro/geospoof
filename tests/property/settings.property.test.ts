/**
 * Property-Based Tests for Settings and Protection Status
 * Feature: geolocation-spoof-extension-mvp
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import { tabsSendMessageCallCount, getBroadcastMessage } from "../helpers/mock-types";
import { storageData } from "../setup";
import { importBackground } from "../helpers/import-background";

beforeEach(() => {
  // Provide mock tabs so broadcastSettingsToTabs has tabs to send to
  browser.tabs.query.mockResolvedValue([
    { id: 1, url: "https://example.com" },
    { id: 2, url: "https://test.com" },
  ]);
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
    fc.asyncProperty(fc.boolean(), async (enabled) => {
      // Initialize storage with default settings before loading module
      storageData.settings = {
        enabled: false,
        location: null,
        timezone: null,
        locationName: null,
        webrtcProtection: false,
        version: "1.0",
        lastUpdated: Date.now(),
      };

      const { updateSettings, broadcastSettingsToTabs } = await importBackground();

      // Clear mock calls from module initialization
      vi.clearAllMocks();

      // Update protection status
      const settings = await updateSettings({ enabled });

      // Broadcast to tabs
      await broadcastSettingsToTabs(settings);

      // Verify tabs.query was called to get all tabs
      if (browser.tabs.query.mock.calls.length === 0) {
        return false;
      }

      // Verify sendMessage was called for each tab
      const tabCount = (await browser.tabs.query({})).length;
      const messageCount = tabsSendMessageCallCount();

      // Should attempt to send message to all tabs
      if (messageCount !== tabCount) {
        return false;
      }

      // Verify each message contains the updated settings
      for (let i = 0; i < messageCount; i++) {
        const message = getBroadcastMessage(undefined, i);

        if (message.type !== "UPDATE_SETTINGS") return false;
        if (message.payload?.enabled !== enabled) return false;
      }

      return true;
    }),
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
            accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
          }),
          { nil: null }
        ),
      }),
      async (settingsUpdate) => {
        const { saveSettings, loadSettings, DEFAULT_SETTINGS } = await importBackground();

        const startTime = Date.now();

        // Save settings
        const fullSettings: Settings = {
          ...DEFAULT_SETTINGS,
          ...settingsUpdate,
        };
        await saveSettings(fullSettings);

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
          if (Math.abs(loaded.location.latitude - settingsUpdate.location.latitude) > 0.0001)
            return false;
          if (Math.abs(loaded.location.longitude - settingsUpdate.location.longitude) > 0.0001)
            return false;
        }

        return true;
      }
    ),
    { numRuns: 100 }
  );
});
