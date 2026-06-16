/**
 * Unit Tests for the proxy-change watcher (event-driven VPN re-sync).
 * Feature: vpn-region-sync / proxy-change auto-resync
 *
 * The watcher observes `proxy.settings.onChange` (fired cross-extension when a
 * browser-based VPN like the Proton / Chromium-Nord extension switches exit
 * nodes) and hands off to the shared re-sync gate. These tests cover the
 * proxy-specific concerns: engine support detection, idempotent install, and
 * that a proxy change drives the shared gate through to a re-sync. The detailed
 * gate decision logic (debounce, IP-diff, min-interval, switch-gap guard) is
 * covered in resync-core.unit.test.ts.
 */

import { DEFAULT_SETTINGS } from "@/shared/types/settings";

// --- Mock the gate's downstream dependencies (shared with resync-core) ------

const detectPublicIp = vi.fn<() => Promise<string>>();
const getLastSyncedIp = vi.fn<() => Promise<string | undefined>>();
const syncVpnLocation = vi.fn<(force: boolean) => Promise<unknown>>();
const clearEndpointCooldowns = vi.fn<() => void>();
vi.mock("@/background/vpn-sync", () => ({
  detectPublicIp: (): Promise<string> => detectPublicIp(),
  getLastSyncedIp: (): Promise<string | undefined> => getLastSyncedIp(),
  syncVpnLocation: (force: boolean): Promise<unknown> => syncVpnLocation(force),
  clearEndpointCooldowns: (): void => clearEndpointCooldowns(),
}));

const handleSetLocation = vi
  .fn<(...args: unknown[]) => Promise<void>>()
  .mockResolvedValue(undefined);
vi.mock("@/background/messages", () => ({
  handleSetLocation: (...args: unknown[]): Promise<void> => handleSetLocation(...args),
}));

const loadSettings = vi.fn<() => Promise<unknown>>();
vi.mock("@/background/settings", () => ({
  loadSettings: (): Promise<unknown> => loadSettings(),
}));

/**
 * Install a fake `proxy.settings.onChange` on the global browser mock and
 * return a trigger that invokes every registered listener.
 */
function installProxyApiMock(): {
  fire: (details?: unknown) => void;
  addListener: ReturnType<typeof vi.fn>;
} {
  const listeners: Array<(d: unknown) => void> = [];
  const addListener = vi.fn((cb: (d: unknown) => void) => listeners.push(cb));
  (browser as unknown as Record<string, unknown>).proxy = {
    settings: {
      onChange: { addListener, removeListener: vi.fn() },
    },
  };
  return {
    addListener,
    fire: (details: unknown = { levelOfControl: "controlled_by_other_extensions" }) =>
      listeners.forEach((l) => l(details)),
  };
}

async function freshWatcher() {
  vi.resetModules();
  const mod = await import("@/background/proxy-watcher");
  mod._resetProxyWatcherState();
  return mod;
}

beforeEach(() => {
  vi.useFakeTimers();
  detectPublicIp.mockReset();
  getLastSyncedIp.mockReset();
  syncVpnLocation.mockReset();
  handleSetLocation.mockClear();
  loadSettings.mockReset();
  loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, vpnSyncEnabled: true });
  delete (browser as unknown as Record<string, unknown>).proxy;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isProxyWatcherSupported", () => {
  test("false when the engine has no proxy.settings.onChange (Safari / FF Android)", async () => {
    const { isProxyWatcherSupported } = await freshWatcher();
    expect(isProxyWatcherSupported()).toBe(false);
  });

  test("true when proxy.settings.onChange is present (Chromium / FF desktop)", async () => {
    installProxyApiMock();
    const { isProxyWatcherSupported } = await freshWatcher();
    expect(isProxyWatcherSupported()).toBe(true);
  });
});

describe("installProxyWatcher", () => {
  test("registers a single onChange listener even if called twice", async () => {
    const { addListener } = installProxyApiMock();
    const { installProxyWatcher } = await freshWatcher();
    installProxyWatcher();
    installProxyWatcher();
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  test("no-ops gracefully when the proxy API is unavailable", async () => {
    const { installProxyWatcher, isProxyWatcherSupported } = await freshWatcher();
    expect(() => installProxyWatcher()).not.toThrow();
    expect(isProxyWatcherSupported()).toBe(false);
  });
});

describe("proxy change → shared gate", () => {
  test("a proxy change drives a re-sync when the exit IP changed", async () => {
    const proxy = installProxyApiMock();
    detectPublicIp.mockResolvedValue("198.51.100.7");
    getLastSyncedIp.mockResolvedValue("203.0.113.10");
    syncVpnLocation.mockResolvedValue({
      latitude: -33.8688,
      longitude: 151.2093,
      city: "Sydney",
      country: "Australia",
      ip: "198.51.100.7",
    });

    const { installProxyWatcher, PROXY_CHANGE_DEBOUNCE_MS } = await freshWatcher();
    const { SWITCH_SETTLE_MS } = await import("@/background/resync-core");
    installProxyWatcher();

    proxy.fire();
    await vi.advanceTimersByTimeAsync(PROXY_CHANGE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(SWITCH_SETTLE_MS);

    expect(syncVpnLocation).toHaveBeenCalledWith(true);
    expect(handleSetLocation).toHaveBeenCalledTimes(1);
  });

  test("a proxy change does not re-sync when the exit IP is unchanged", async () => {
    const proxy = installProxyApiMock();
    detectPublicIp.mockResolvedValue("203.0.113.10");
    getLastSyncedIp.mockResolvedValue("203.0.113.10");

    const { installProxyWatcher, PROXY_CHANGE_DEBOUNCE_MS } = await freshWatcher();
    installProxyWatcher();

    proxy.fire();
    await vi.advanceTimersByTimeAsync(PROXY_CHANGE_DEBOUNCE_MS);

    expect(detectPublicIp).toHaveBeenCalledTimes(1);
    expect(syncVpnLocation).not.toHaveBeenCalled();
  });

  test("ignores proxy changes when VPN sync mode is disabled", async () => {
    const proxy = installProxyApiMock();
    loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, vpnSyncEnabled: false });

    const { installProxyWatcher, PROXY_CHANGE_DEBOUNCE_MS } = await freshWatcher();
    installProxyWatcher();

    proxy.fire();
    await vi.advanceTimersByTimeAsync(PROXY_CHANGE_DEBOUNCE_MS);

    expect(detectPublicIp).not.toHaveBeenCalled();
    expect(syncVpnLocation).not.toHaveBeenCalled();
  });
});
