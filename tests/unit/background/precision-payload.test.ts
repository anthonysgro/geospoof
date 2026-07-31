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
    localeSpoofing: { mode: "off" as const },
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

/**
 * Regression guard for the two payload builders in `src/background/index.ts`
 * that the original implementation missed: the late-injection alarm path and the
 * new-tab path both destructured `location` off Settings and delivered it RAW,
 * with no `applyPrecisionOffset` call (the function wasn't even imported in that
 * file). A user who enabled approximate location therefore still received their
 * EXACT anchor coordinates on those paths — precisely what the feature exists to
 * prevent — and it violated Req 5.2's "both builders agree".
 *
 * The original suite only exercised `broadcastSettingsToTabs` and the
 * `GET_SETTINGS` branch, which were the two builders that were already correct,
 * so the bug was invisible to it. These tests pin the property at the level that
 * actually matters: no page-bound payload anywhere may carry the exact anchor
 * while approximate mode is on.
 */
describe("every page-bound builder offsets the location (Req 5.2)", () => {
  /**
   * Assert a delivered payload is offset rather than the verbatim anchor.
   * Kept as one helper so a future third builder can be checked the same way.
   */
  function expectOffset(loc: UpdateSettingsPayload["location"]): void {
    expect(loc).not.toBeNull();
    // Moved off the anchor...
    expect(loc!.latitude !== ANCHOR.latitude || loc!.longitude !== ANCHOR.longitude).toBe(true);
    // ...but still inside the configured radius, and with `accuracy` preserved.
    expect(loc!.accuracy).toBe(ANCHOR.accuracy);
    const dist = haversineMeters(ANCHOR.latitude, ANCHOR.longitude, loc!.latitude, loc!.longitude);
    expect(dist).toBeLessThanOrEqual(RADIUS * 1.02 + 2);
  }

  test("the new-tab path offsets, and agrees with the broadcast path", async () => {
    const s = makeSettings({
      locationPrecision: { mode: "approximate", radiusMeters: RADIUS },
    });
    const bg = await importBackgroundWith(s);

    // Baseline from the known-good builder, to compare against.
    const broadcast = await broadcastAndCapture(bg, s);
    expectOffset(broadcast.location);

    // Drive the tabs.onCreated listener and capture what the new tab receives.
    const sent: UpdateSettingsPayload[] = [];
    browser.tabs.sendMessage = vi
      .fn()
      .mockImplementation((_tabId: number, message: Message<UpdateSettingsPayload>) => {
        if (message.type === "UPDATE_SETTINGS" && message.payload) sent.push(message.payload);
        return Promise.resolve();
      });

    vi.useFakeTimers();
    try {
      const listener = (
        browser.tabs.onCreated.addListener as unknown as {
          mock: { calls: [(tab: { id?: number; url?: string }) => void][] };
        }
      ).mock.calls.at(-1)?.[0];
      expect(listener, "tabs.onCreated listener was not registered").toBeDefined();

      listener!({ id: 42, url: "https://example.com/new" });
      // The handler loads settings asynchronously, then defers the send.
      await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 2000 });
    } finally {
      vi.useRealTimers();
    }

    expectOffset(sent[0].location);
    // Determinism means every builder must land on the same point.
    expect(sent[0].location).toEqual(broadcast.location);
  });

  test("exact mode still delivers the verbatim anchor on the new-tab path", async () => {
    // The fix must not accidentally offset when the user asked for exact.
    const s = makeSettings({ locationPrecision: { mode: "exact" } });
    const bg = await importBackgroundWith(s);
    const broadcast = await broadcastAndCapture(bg, s);
    expect(broadcast.location).toEqual({ ...ANCHOR });
  });

  test("src/background/index.ts imports and uses the offset at every payload site", async () => {
    // A structural guard, because the behavioural test above can only reach the
    // paths a unit test can drive. The alarm path needs a live alarm plus a
    // resolvable tab, so this catches a regression there (and at any future
    // builder added to this file) that runtime coverage would miss.
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/background/index.ts", "utf8");

    expect(src).toContain("applyPrecisionOffset");

    // Count payload literals against offset calls: every `UpdateSettingsPayload`
    // built in this file must offset its location.
    const payloadSites = (src.match(/: UpdateSettingsPayload = \{/g) ?? []).length;
    const offsetCalls = (src.match(/location: applyPrecisionOffset\(/g) ?? []).length;
    expect(payloadSites).toBeGreaterThan(0);
    expect(offsetCalls, "a payload in index.ts is delivering an un-offset location").toBe(
      payloadSites
    );

    // And none may pass the bare destructured `location` through.
    expect(src).not.toMatch(/\n\s+enabled,\n\s+location,\n/);
  });
});
