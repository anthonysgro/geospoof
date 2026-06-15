/**
 * Property-Based Tests for Settings and Protection Status
 * Feature: geolocation-spoof-extension-mvp
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import type { UpdateSettingsPayload } from "@/shared/types/messages";
import {
  expectWebRTCPolicySet,
  getBroadcastMessage,
  tabsSendMessageCallCount,
} from "../helpers/mock-types";
import { importBackground } from "../helpers/import-background";
import { computeEffectiveEnabled } from "@/shared/utils/scope";

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
  onboardingCompleted: fc.boolean(),
  version: fc.constant("1.0"),
  lastUpdated: fc.integer({ min: 0 }),
  vpnSyncEnabled: fc.boolean(),
  debugLogging: fc.boolean(),
  verbosityLevel: fc.constantFrom("ERROR", "WARN", "INFO", "DEBUG", "TRACE"),
  theme: fc.constantFrom("system", "light", "dark"),
  favorites: fc.constant([]),
  scopeMode: fc.constantFrom("all", "allowlist", "denylist"),
  allowlist: fc.constant([]),
  denylist: fc.constant([]),
});

/** The keys that MUST NOT appear in the broadcast payload. */
const FORBIDDEN_KEYS: (keyof Settings)[] = [
  "onboardingCompleted",
  "locationName",
  "version",
  "lastUpdated",
  "vpnSyncEnabled",
];

/** The keys that MUST appear in the broadcast payload. */
const REQUIRED_KEYS: (keyof UpdateSettingsPayload)[] = [
  "enabled",
  "location",
  "timezone",
  "debugLogging",
  "verbosityLevel",
  // webrtcProtection is forwarded to the injected script via the
  // CustomEvent so its RTCPeerConnection wrapper can flip without a
  // reload. Added as part of moving WebRTC IP-leak protection into
  // the content-script layer (closes the gap where Firefox's
  // `disable_non_proxied_udp` policy only works behind a proxy).
  "webrtcProtection",
];

/**
 * Property 4: Broadcast Payload Contains Only Scoped Fields
 *
 * Validates: Requirements 3.1, 3.2, 3.3
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

      // Payload must have exactly 6 scoped keys.
      expect(Object.keys(payload)).toHaveLength(6);

      // `enabled` is now resolved per tab via the shared source of truth
      // (background-authoritative per-tab scoping), not the raw master flag.
      const { isRestrictedUrl } = bg;
      const expectedEnabled = computeEffectiveEnabled({
        masterEnabled: settings.enabled,
        scopeMode: settings.scopeMode,
        allowlist: settings.allowlist,
        denylist: settings.denylist,
        topLevelUrl: "https://example.com",
        isRestricted: isRestrictedUrl,
      });
      expect(payload.enabled).toBe(expectedEnabled);
      expect(payload.location).toEqual(settings.location);
      expect(payload.timezone).toEqual(settings.timezone);
      expect(payload.debugLogging).toBe(settings.debugLogging);
      expect(payload.webrtcProtection).toBe(settings.webrtcProtection);
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

/**
 * Property 20: Settings Initialization Responsiveness
 *
 * Validates: Requirements 6.5, 6.6
 *
 * For any saved settings, when the extension initializes, the settings should be
 * loaded and applied (spoofed location and protection status active) within 1 second.
 */
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
          const { initialize, saveSettings, DEFAULT_SETTINGS } = await importBackground();

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
          expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalled();
          expect(browser.action.setBadgeText).toHaveBeenCalled();

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
        const { initialize, saveSettings, DEFAULT_SETTINGS } = await importBackground();

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
        expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith(
          expect.objectContaining({
            color: enabled ? "green" : "gray",
          })
        );

        expect(browser.action.setBadgeText).toHaveBeenCalledWith(
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
          const { initialize, saveSettings, DEFAULT_SETTINGS } = await importBackground();

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
    const { initialize } = await importBackground();

    // Storage is already empty from setup.ts beforeEach
    const startTime = Date.now();

    await initialize();

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify initialization completed within 1 second
    expect(duration).toBeLessThan(1000);

    // Verify badge was updated with default state (disabled)
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "gray",
      })
    );

    expect(browser.action.setBadgeText).toHaveBeenCalledWith(
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
          const { initialize, saveSettings, DEFAULT_SETTINGS } = await importBackground();

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

/**
 * Property: List Sanitization Invariants
 *
 * Validates: Requirements 2.3, 2.5, 2.6, 15.4
 *
 * For any array of arbitrary entries (strings, non-strings, URLs, mixed case),
 * validateSettings must produce an allowlist/denylist where:
 *   - every entry is the normalized output of normalizeDomain (idempotent),
 *   - no duplicate normalized domains exist,
 *   - entries appear in first-occurrence order of their normalized form,
 *   - all retained entries derive from a valid input entry.
 */
test("Property: list sanitization normalizes, dedupes keep-first, and is deterministic", async () => {
  const { validateSettings } = await importBackground();
  const { normalizeDomain } = await import("@/shared/utils/scope");

  // A generator that yields a mix of valid-ish domain strings, URL-ish strings,
  // invalid strings, and non-string junk so the sanitizer is exercised broadly.
  const entryArb = fc.oneof(
    fc.constantFrom(
      "example.com",
      "WWW.Example.COM",
      "https://test.org/path?q=1",
      "  sub.domain.io  ",
      "HTTP://WWW.Site.NET:8080/x#frag"
    ),
    fc.constantFrom("localhost", "bad_domain.com", "*.example.com", "", "no-dot"),
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.record({ foo: fc.string() })
  );

  fc.assert(
    fc.property(fc.array(entryArb, { maxLength: 30 }), (rawList: unknown[]) => {
      const validated = validateSettings({
        allowlist: rawList as unknown as string[],
      });

      const list = validated.allowlist;

      // Compute the expected sanitized list independently.
      const expected: string[] = [];
      const seen = new Set<string>();
      for (const entry of rawList) {
        if (typeof entry !== "string") continue;
        const normalized = normalizeDomain(entry);
        if (normalized === null) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        expected.push(normalized);
      }

      // Deterministic, normalized, deduped, first-occurrence order.
      expect(list).toEqual(expected);

      // Each retained entry is idempotent under normalizeDomain.
      for (const entry of list) {
        expect(normalizeDomain(entry)).toBe(entry);
      }

      // No duplicates remain.
      expect(new Set(list).size).toBe(list.length);

      return true;
    }),
    { numRuns: 100 }
  );
});
