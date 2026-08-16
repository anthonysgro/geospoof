import {
  LEGACY_MAIN_WORLD_SCRIPT_ID,
  removeLegacyMainWorldRegistration,
} from "@/background/legacy-main-world-cleanup";

const originalScripting = browser.scripting;

describe("legacy Safari MAIN-world registration cleanup", () => {
  afterEach(() => {
    (browser as unknown as Record<string, unknown>).scripting = originalScripting;
    vi.restoreAllMocks();
  });

  it("removes the persisted registration when an upgraded install still has it", async () => {
    const getRegisteredContentScripts = vi
      .fn()
      .mockResolvedValue([{ id: LEGACY_MAIN_WORLD_SCRIPT_ID }]);
    const unregisterContentScripts = vi.fn().mockResolvedValue(undefined);
    (browser as unknown as Record<string, unknown>).scripting = {
      getRegisteredContentScripts,
      unregisterContentScripts,
    };

    await expect(removeLegacyMainWorldRegistration()).resolves.toBeUndefined();
    expect(unregisterContentScripts).toHaveBeenCalledOnce();
    expect(unregisterContentScripts).toHaveBeenCalledWith({
      ids: [LEGACY_MAIN_WORLD_SCRIPT_ID],
    });
  });

  it("does nothing when no legacy registration exists", async () => {
    const unregisterContentScripts = vi.fn();
    (browser as unknown as Record<string, unknown>).scripting = {
      getRegisteredContentScripts: vi.fn().mockResolvedValue([]),
      unregisterContentScripts,
    };

    await removeLegacyMainWorldRegistration();
    expect(unregisterContentScripts).not.toHaveBeenCalled();
  });

  it("never throws when Safari omits or rejects the cleanup API", async () => {
    delete (browser as unknown as Record<string, unknown>).scripting;
    await expect(removeLegacyMainWorldRegistration()).resolves.toBeUndefined();

    (browser as unknown as Record<string, unknown>).scripting = {
      getRegisteredContentScripts: vi.fn().mockRejectedValue(new Error("unavailable")),
      unregisterContentScripts: vi.fn(),
    };
    await expect(removeLegacyMainWorldRegistration()).resolves.toBeUndefined();
  });
});
