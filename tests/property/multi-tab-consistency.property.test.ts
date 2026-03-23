/**
 * Property-Based Tests for Multi-Tab Consistency
 *
 * Feature: geolocation-spoof-extension-mvp
 * Property 23: Multi-Tab Consistency
 *
 * **Validates: Requirements 8.3**
 *
 * For any set of open tabs, when protection is enabled, all tabs should have
 * the same spoofing settings applied consistently.
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import type { Message } from "@/shared/types/messages";

// Import after mocking
const background = await import("@/background");

/** Build a complete Settings object from partial test data. */
function makeSettings(partial: Partial<Settings>): Settings {
  return {
    enabled: false,
    location: null,
    timezone: null,
    locationName: null,
    webrtcProtection: false,
    onboardingCompleted: true,
    version: "1.0",
    lastUpdated: Date.now(),
    vpnSyncEnabled: false,
    debugLogging: false,
    verbosityLevel: "INFO",
    ...partial,
  };
}

describe("Property 23: Multi-Tab Consistency", () => {
  test("all tabs receive the same settings when broadcasting", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of tabs (1-20)
        fc.integer({ min: 1, max: 20 }),
        // Generate random location
        fc.record({
          latitude: fc.double({ min: -90, max: 90 }),
          longitude: fc.double({ min: -180, max: 180 }),
          accuracy: fc.double({ min: 1, max: 100 }),
        }),
        // Generate random enabled state
        fc.boolean(),
        async (numTabs, location, enabled) => {
          // Create mock tabs
          const tabs = Array.from({ length: numTabs }, (_, i) => ({
            id: i + 1,
            url: `https://example${i}.com`,
          }));

          // Mock tabs.query to return our tabs
          browser.tabs.query.mockResolvedValue(tabs);

          // Track messages sent to each tab
          const messagesSent = new Map<number, Message<Settings>>();
          browser.tabs.sendMessage.mockImplementation(
            (tabId: number, message: Message<Settings>) => {
              messagesSent.set(tabId, message);
              return Promise.resolve();
            }
          );

          // Create settings to broadcast
          const settings = makeSettings({
            enabled,
            location,
            timezone: {
              identifier: "America/Los_Angeles",
              offset: 480,
              dstOffset: 60,
            },
            locationName: {
              city: "Test City",
              country: "Test Country",
              displayName: "Test City, Test Country",
            },
          });

          // Broadcast settings
          await background.broadcastSettingsToTabs(settings);

          // Verify all tabs received a message
          expect(messagesSent.size).toBe(numTabs);

          // Verify all tabs received the same settings
          const allMessages = Array.from(messagesSent.values());
          for (let i = 1; i < allMessages.length; i++) {
            expect(allMessages[i]).toEqual(allMessages[0]);
          }

          // Verify the message structure
          const firstMessage = allMessages[0];
          expect(firstMessage.type).toBe("UPDATE_SETTINGS");
          expect(firstMessage.payload).toEqual({
            enabled: settings.enabled,
            location: settings.location,
            timezone: settings.timezone,
            debugLogging: settings.debugLogging,
            verbosityLevel: settings.verbosityLevel,
          });
          expect(firstMessage.payload!.enabled).toBe(enabled);
          expect(firstMessage.payload!.location).toEqual(location);
        }
      ),
      {
        numRuns: 50,
        examples: [
          // Regression: payload must include debugLogging and verbosityLevel
          [1, { latitude: 0, longitude: 0, accuracy: 1 }, false],
        ],
      }
    );
  });

  test("settings remain consistent across multiple broadcast operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        fc.array(
          fc.record({
            latitude: fc.double({ min: -90, max: 90 }),
            longitude: fc.double({ min: -180, max: 180 }),
            accuracy: fc.double({ min: 1, max: 100 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (numTabs, locations) => {
          // Create mock tabs
          const tabs = Array.from({ length: numTabs }, (_, i) => ({
            id: i + 1,
            url: `https://example${i}.com`,
          }));

          browser.tabs.query.mockResolvedValue(tabs);

          // Track all messages sent to each tab
          const tabMessages = new Map<number, Message<Settings>[]>();
          browser.tabs.sendMessage.mockImplementation(
            (tabId: number, message: Message<Settings>) => {
              if (!tabMessages.has(tabId)) {
                tabMessages.set(tabId, []);
              }
              tabMessages.get(tabId)!.push(message);
              return Promise.resolve();
            }
          );

          // Broadcast multiple location updates
          for (const location of locations) {
            const settings = makeSettings({
              enabled: true,
              location,
              timezone: {
                identifier: "Asia/Tokyo",
                offset: 540,
                dstOffset: 0,
              },
            });

            await background.broadcastSettingsToTabs(settings);

            // Verify all tabs received the same settings for this broadcast
            const currentMessages = Array.from(tabMessages.values()).map(
              (messages) => messages[messages.length - 1]
            );

            for (let i = 1; i < currentMessages.length; i++) {
              expect(currentMessages[i]).toEqual(currentMessages[0]);
            }
          }

          // Verify each tab received the same number of updates
          const messageCounts = Array.from(tabMessages.values()).map((messages) => messages.length);
          const firstCount = messageCounts[0];
          for (const count of messageCounts) {
            expect(count).toBe(firstCount);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
