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

import fc from "fast-check";
import {
  expectWebRTCPolicySet,
  getBroadcastMessage,
  tabsSendMessageCallCount,
} from "../helpers/mock-types";

const { initialize, saveSettings, DEFAULT_SETTINGS } = await import("@/background");

describe("Property 20: Settings Initialization Responsiveness", () => {
  beforeEach(() => {
    // Provide mock tabs so updateBadge sets per-tab badges
    browser.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://test.com" },
    ]);
  });

  test("should load and apply settings within 1 second", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enabled: fc.boolean(),
          location: fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
            accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
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
            dstOffset: fc.integer({ min: 0, max: 60 }),
          }),
          webrtcProtection: fc.boolean(),
        }),
        async (settingsData) => {
          // Save settings to storage
          const settings = {
            ...DEFAULT_SETTINGS,
            ...settingsData,
          };

          await saveSettings(settings);

          // Clear mocks to track initialization calls
          vi.clearAllMocks();

          // Measure initialization time
          const startTime = Date.now();

          await initialize();

          const endTime = Date.now();
          const duration = endTime - startTime;

          // Verify initialization completed within 1 second (1000ms)
          expect(duration).toBeLessThan(1000);

          // Verify badge was updated
          expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalled();
          expect(browser.browserAction.setBadgeText).toHaveBeenCalled();

          // Verify settings were broadcast to tabs if protection enabled
          if (settingsData.enabled && settingsData.location) {
            expect(browser.tabs.query).toHaveBeenCalled();
            expect(browser.tabs.sendMessage).toHaveBeenCalled();
          }

          // Verify WebRTC protection was applied if enabled
          if (settingsData.webrtcProtection) {
            expectWebRTCPolicySet().toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should apply protection status to badge within 1 second", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (enabled) => {
        // Save settings with protection status
        const settings = {
          ...DEFAULT_SETTINGS,
          enabled,
          location: enabled ? { latitude: 37.7749, longitude: -122.4194, accuracy: 10 } : null,
        };

        await saveSettings(settings);

        // Clear mocks
        vi.clearAllMocks();

        // Measure initialization time
        const startTime = Date.now();

        await initialize();

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Verify initialization completed within 1 second
        expect(duration).toBeLessThan(1000);

        // Verify badge reflects protection status
        expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith(
          expect.objectContaining({
            color: enabled ? "green" : "gray",
          })
        );

        expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith(
          expect.objectContaining({
            text: enabled ? "✓" : "",
          })
        );
      }),
      { numRuns: 100 }
    );
  });

  test("should broadcast settings to all tabs within 1 second when protection enabled", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
        }),
        async (location) => {
          // Save settings with protection enabled
          const settings = {
            ...DEFAULT_SETTINGS,
            enabled: true,
            location,
          };

          await saveSettings(settings);

          // Clear mocks
          vi.clearAllMocks();

          // Measure initialization time
          const startTime = Date.now();

          await initialize();

          const endTime = Date.now();
          const duration = endTime - startTime;

          // Verify initialization completed within 1 second
          expect(duration).toBeLessThan(1000);

          // Verify settings were broadcast to tabs
          expect(browser.tabs.query).toHaveBeenCalled();
          expect(browser.tabs.sendMessage).toHaveBeenCalled();

          // Verify the message payload contains the location
          const callCount = tabsSendMessageCallCount();
          expect(callCount).toBeGreaterThan(0);

          // Check that at least one call has the correct message structure
          let hasCorrectMessage = false;
          for (let i = 0; i < callCount; i++) {
            const message = getBroadcastMessage(undefined, i);
            if (
              message.type === "UPDATE_SETTINGS" &&
              message.payload?.enabled === true &&
              message.payload?.location !== null
            ) {
              hasCorrectMessage = true;
              break;
            }
          }

          expect(hasCorrectMessage).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should handle empty storage gracefully within 1 second", async () => {
    // Storage is already empty from setup.ts beforeEach

    const startTime = Date.now();

    await initialize();

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify initialization completed within 1 second
    expect(duration).toBeLessThan(1000);

    // Verify badge was updated with default state (disabled)
    expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "gray",
      })
    );

    expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "",
      })
    );
  });

  test("should not broadcast settings when protection is disabled", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true }),
        }),
        async (location) => {
          // Save settings with protection disabled
          const settings = {
            ...DEFAULT_SETTINGS,
            enabled: false,
            location,
          };

          await saveSettings(settings);

          // Clear mocks
          vi.clearAllMocks();

          await initialize();

          // Verify settings were NOT broadcast to tabs
          expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
