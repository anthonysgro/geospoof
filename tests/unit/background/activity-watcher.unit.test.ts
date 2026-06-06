/**
 * Unit tests for the activity-driven re-sync watcher.
 * Feature: vpn-region-sync / activity-driven auto-resync
 *
 * The watcher hooks `tabs.onUpdated` (navigation) and `idle.onStateChanged`
 * (return to active) and hands each to the shared re-sync gate. These tests
 * mock the shared gate (`triggerResyncCheck`) and assert the watcher feeds it
 * the right events, feature-detects per engine, and installs idempotently.
 */

// --- Mock the shared gate ---------------------------------------------------

const triggerResyncCheck = vi.fn<(reason: string) => void>();
vi.mock("@/background/resync-core", () => ({
  triggerResyncCheck: (reason: string): void => triggerResyncCheck(reason),
}));

type TabListener = (
  tabId: number,
  changeInfo: { status?: string },
  tab: Record<string, unknown>
) => void;
type IdleListener = (state: string) => void;

function installTabsMock(): {
  fire: (status: string) => void;
  addListener: ReturnType<typeof vi.fn>;
} {
  const listeners: TabListener[] = [];
  const addListener = vi.fn((cb: TabListener) => listeners.push(cb));
  const existing = (browser as unknown as Record<string, unknown>).tabs ?? {};
  (browser as unknown as Record<string, unknown>).tabs = {
    ...existing,
    onUpdated: { addListener, removeListener: vi.fn() },
  };
  return {
    addListener,
    fire: (status: string) => listeners.forEach((l) => l(1, { status }, { id: 1 })),
  };
}

function installIdleMock(): {
  fire: (state: string) => void;
  addListener: ReturnType<typeof vi.fn>;
} {
  const listeners: IdleListener[] = [];
  const addListener = vi.fn((cb: IdleListener) => listeners.push(cb));
  (browser as unknown as Record<string, unknown>).idle = {
    onStateChanged: { addListener, removeListener: vi.fn() },
  };
  return {
    addListener,
    fire: (state: string) => listeners.forEach((l) => l(state)),
  };
}

async function freshWatcher() {
  vi.resetModules();
  const mod = await import("@/background/activity-watcher");
  mod._resetActivityWatcherState();
  return mod;
}

beforeEach(() => {
  triggerResyncCheck.mockReset();
  delete (browser as unknown as Record<string, unknown>).tabs;
  delete (browser as unknown as Record<string, unknown>).idle;
});

describe("isActivityWatcherSupported", () => {
  test("false when neither tabs.onUpdated nor idle.onStateChanged exist", async () => {
    const { isActivityWatcherSupported } = await freshWatcher();
    expect(isActivityWatcherSupported()).toBe(false);
  });

  test("true when tabs.onUpdated is present", async () => {
    installTabsMock();
    const { isActivityWatcherSupported } = await freshWatcher();
    expect(isActivityWatcherSupported()).toBe(true);
  });
});

describe("installActivityWatcher", () => {
  test("registers listeners once even if called twice", async () => {
    const tabs = installTabsMock();
    const idle = installIdleMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();
    installActivityWatcher();
    expect(tabs.addListener).toHaveBeenCalledTimes(1);
    expect(idle.addListener).toHaveBeenCalledTimes(1);
  });

  test("no-ops gracefully when no activity APIs are available (e.g. minimal engine)", async () => {
    const { installActivityWatcher } = await freshWatcher();
    expect(() => installActivityWatcher()).not.toThrow();
  });

  test("installs the tab trigger even when idle is unavailable (Safari)", async () => {
    const tabs = installTabsMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();
    expect(tabs.addListener).toHaveBeenCalledTimes(1);
  });
});

describe("activity triggers", () => {
  test("a navigation (status=loading) triggers a re-sync check", async () => {
    const tabs = installTabsMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();

    tabs.fire("loading");
    expect(triggerResyncCheck).toHaveBeenCalledWith("tab-navigation");
  });

  test("a non-loading tab update does NOT trigger a check", async () => {
    const tabs = installTabsMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();

    tabs.fire("complete");
    expect(triggerResyncCheck).not.toHaveBeenCalled();
  });

  test("returning to active (idle→active) triggers a re-sync check", async () => {
    const idle = installIdleMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();

    idle.fire("active");
    expect(triggerResyncCheck).toHaveBeenCalledWith("idle-active");
  });

  test("going idle or locked does NOT trigger a check", async () => {
    const idle = installIdleMock();
    const { installActivityWatcher } = await freshWatcher();
    installActivityWatcher();

    idle.fire("idle");
    idle.fire("locked");
    expect(triggerResyncCheck).not.toHaveBeenCalled();
  });
});
