/**
 * Property-Based Tests for Settings Broadcast Scoping
 * Feature: extension-hardening, Property 4: Broadcast Payload Contains Only Scoped Fields
 *
 * For any Settings object, the payload sent via browser.tabs.sendMessage
 * contains exactly `enabled`, `location`, `timezone` and no internal fields.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import type { UpdateSettingsPayload } from "@/shared/types/messages";
import { importBackground } from "../helpers/import-background";
import { getBroadcastMessage } from "../helpers/mock-types";

/** Arbitrary for a full Settings object with all internal fields populated. */
const settingsArb: fc.Arbitrary<Settings> = fc.record({
  enabled: fc.boolean(),
  location: fc.option(
    fc.record({
      latitude: fc.double({ min: -90, max: 90, noNaN: true }),
      longitude: fc.double({ min: -180, max: 180, noNaN: true }),
      accuracy: fc.integer({ min: 1, max: 1000 }),
    }),
    { nil: null }
  ),
  timezone: fc.option(
    fc.record({
      identifier: fc.constantFrom(
        "America/Los_Angeles",
        "America/New_York",
        "Europe/London",
        "Asia/Tokyo",
        "Australia/Sydney"
      ),
      offset: fc.integer({ min: -720, max: 840 }),
      dstOffset: fc.integer({ min: 0, max: 60 }),
    }),
    { nil: null }
  ),
  locationName: fc.option(
    fc.record({
      city: fc.string({ minLength: 1, maxLength: 50 }),
      country: fc.string({ minLength: 1, maxLength: 50 }),
      displayName: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    { nil: null }
  ),
  webrtcProtection: fc.boolean(),
  geonamesUsername: fc.string({ minLength: 1, maxLength: 30 }),
  onboardingCompleted: fc.boolean(),
  version: fc.constant("1.0"),
  lastUpdated: fc.integer({ min: 0 }),
});

/** The keys that MUST NOT appear in the broadcast payload. */
const FORBIDDEN_KEYS: (keyof Settings)[] = [
  "geonamesUsername",
  "onboardingCompleted",
  "webrtcProtection",
  "locationName",
  "version",
  "lastUpdated",
];

/** The keys that MUST appear in the broadcast payload. */
const REQUIRED_KEYS: (keyof UpdateSettingsPayload)[] = ["enabled", "location", "timezone"];

describe("Settings Broadcast Scope Properties", () => {
  /**
   * Property 4: Broadcast Payload Contains Only Scoped Fields
   *
   * For any Settings object, when broadcastSettingsToTabs is called,
   * the payload sent via browser.tabs.sendMessage contains exactly
   * `enabled`, `location`, `timezone` and no internal fields.
   */
  test("Property 4: Broadcast Payload Contains Only Scoped Fields", async () => {
    await fc.assert(
      fc.asyncProperty(settingsArb, async (settings: Settings) => {
        vi.clearAllMocks();

        // Set up a tab so sendMessage gets called
        const tabsQueryMock = browser.tabs.query as unknown as ReturnType<typeof vi.fn>;
        tabsQueryMock.mockResolvedValue([{ id: 1, url: "https://example.com" }]);

        const tabsSendMock = browser.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
        tabsSendMock.mockResolvedValue(undefined);

        // Import fresh module and call broadcastSettingsToTabs directly
        const bg = await importBackground();
        await bg.broadcastSettingsToTabs(settings);

        // Verify sendMessage was called exactly once (one tab)
        expect(tabsSendMock).toHaveBeenCalledTimes(1);

        // Check the broadcast message
        const message = getBroadcastMessage();
        expect(message.type).toBe("UPDATE_SETTINGS");

        const payload = message.payload as unknown as Record<string, unknown>;

        // REQUIRED keys must be present
        for (const key of REQUIRED_KEYS) {
          expect(payload).toHaveProperty(key);
        }

        // FORBIDDEN keys must NOT be present
        for (const key of FORBIDDEN_KEYS) {
          expect(payload).not.toHaveProperty(key);
        }

        // Payload must have exactly 3 keys
        expect(Object.keys(payload)).toHaveLength(3);

        // Values must match the original settings
        expect(payload.enabled).toBe(settings.enabled);
        expect(payload.location).toEqual(settings.location);
        expect(payload.timezone).toEqual(settings.timezone);
      }),
      { numRuns: 100 }
    );
  });
});
