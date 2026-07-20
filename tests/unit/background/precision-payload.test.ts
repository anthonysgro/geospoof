/**
 * Task 4 guard test: the location-precision offset is applied to page-bound
 * payloads (broadcast + content-script GET_SETTINGS), both builders agree, the
 * `accuracy` field is preserved, `exact` mode is a no-op, and the stored
 * `Settings.location` anchor is never mutated.
 *
 * Property 9: Payload builders agree and preserve the anchor.
 * Validates: Requirements 5.2, 5.3, 5.4.
 */

import { describe, test, expect, vi } from "vitest";
import type { Settings } from "@/shared/types/settings";
import type { Message, UpdateSettingsPayload } from "@/shared/types/messages";

const ANCHOR = { latitude: 37.7749, longitude: -122.4194, accuracy: 42 } as const;
const RADIUS = 5000;
const SEED = 123456789;

function makeSettings(overrides?: Partial<Settings>): Settings {
  return {
    enabled: true,
    location: { ...ANCHOR },
    timezone: { identifier: "America/Los_Angeles", offset: 480, dstOffset: 60 },
    locationName: { city: "San Francisco", country: "US", displayName: "San Francisco, US" },
    webrtcProtection: false,
    preserveGeolocationPrompt: false,
    onboardingCompleted: true,
    version: "1.2",
    lastUpdated: Date.now(),
    vpnSyncEnabled: false,
    debuggerModeEnabled: false,
    autoSyncBlocked: false,
    proFeaturesBlocked: false,
    debugLogging: false,
    verbosityLevel: "INFO",
    theme: "system",
    uiLanguage: "",
    favorites: [],
    scopeMode: "all",
    allowlist: [],
    denylist: [],
    accuracySetting: { mode: "auto" },
    accuracySeed: 777,
    locationPrecision: { mode: "exact" },
    precisionSeed: SEED,
    ...overrides,
  };
}

/** Great-circle distance in meters (reference impl). */
function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function importBackgroundWith(s: Settings) {
  vi.clearAllMocks();
  vi.resetModules();
  browser.storage.local.get = vi.fn().mockResolvedValue({ settings: s });
  browser.storage.local.set = vi.fn().mockResolvedValue(undefined);
  return import("@/background");
}

/** Broadcast to a single tab and return the delivered UpdateSettingsPayload. */
async function broadcastAndCapture(
  bg: { broadcastSettingsToTabs: (s: Settings) => Promise<void> },
  s: Settings
): Promise<UpdateSettingsPayload> {
  browser.tabs.query = vi.fn().mockResolvedValue([{ id: 1, url: "https://example.com" }]);
  const sent: UpdateSettingsPayload[] = [];
  browser.tabs.sendMessage = vi
    .fn()
    .mockImplementation((_tabId: number, message: Message<UpdateSettingsPayload>) => {
      if (message.type === "UPDATE_SETTINGS" && message.payload) sent.push(message.payload);
      return Promise.resolve();
    });
  await bg.broadcastSettingsToTabs(s);
  expect(sent).toHaveLength(1);
  return sent[0];
}

describe("Property 9: precision offset in page-bound payloads", () => {
  test("approximate: broadcast location differs from anchor, stays within radius, preserves accuracy", async () => {
    const s = makeSettings({
      locationPrecision: { mode: "approximate", radiusMeters: RADIUS },
    });
    const bg = await importBackgroundWith(s);
    const payload = await broadcastAndCapture(bg, s);

    const loc = payload.location;
    expect(loc).not.toBeNull();
    // Offset actually moved the point.
    expect(loc!.latitude !== ANCHOR.latitude || loc!.longitude !== ANCHOR.longitude).toBe(true);
    // Non-coordinate fields preserved (Req 5.4).
    expect(loc!.accuracy).toBe(ANCHOR.accuracy);
    // Within the configured radius (Req 3.1).
    const dist = haversineMeters(ANCHOR.latitude, ANCHOR.longitude, loc!.latitude, loc!.longitude);
    expect(dist).toBeLessThanOrEqual(RADIUS * 1.02 + 2);
  });

  test("exact: broadcast location equals the anchor verbatim", async () => {
    const s = makeSettings({ locationPrecision: { mode: "exact" } });
    const bg = await importBackgroundWith(s);
    const payload = await broadcastAndCapture(bg, s);
    expect(payload.location).toEqual({ ...ANCHOR });
  });

  test("both builders agree: content-script GET_SETTINGS location === broadcast location", async () => {
    const s = makeSettings({
      locationPrecision: { mode: "approximate", radiusMeters: RADIUS },
    });
    const bg = await importBackgroundWith(s);

    const broadcastPayload = await broadcastAndCapture(bg, s);

    const response = (await bg.handleMessage(
      { type: "GET_SETTINGS" },
      { tab: { id: 2, url: "https://example.com/page" } as browser.tabs.Tab }
    )) as Record<string, unknown>;

    expect(response.location).toEqual(broadcastPayload.location);
  });

  test("stored Settings.location (anchor) is never mutated by the offset", async () => {
    const anchorObj = { ...ANCHOR };
    const s = makeSettings({
      location: anchorObj,
      locationPrecision: { mode: "approximate", radiusMeters: RADIUS },
    });
    const bg = await importBackgroundWith(s);
    await broadcastAndCapture(bg, s);
    // The offset builds a new object; the anchor in storage is untouched.
    expect(anchorObj).toEqual({ ...ANCHOR });
    expect(s.location).toEqual({ ...ANCHOR });
  });
});
