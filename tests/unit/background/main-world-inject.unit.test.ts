/**
 * Unit tests for the Safari MAIN-world injection registration.
 *
 * ## Why this module exists at all
 *
 * Safari only honours the `content_scripts[].world` manifest key from Safari 18.
 * On Safari 17 and earlier it is ignored, so `content/injected.js` never reaches
 * the page's MAIN world and every override (geolocation, Date, Intl, WebRTC)
 * silently does nothing while the extension still reports itself as installed
 * and enabled. The Safari manifest therefore omits the static entry entirely and
 * the background registers the script at runtime via
 * `scripting.registerContentScripts({ world: "MAIN" })`, supported since
 * Safari 16.4.
 *
 * Because this registration is the ONLY thing that gets page overrides into the
 * page on Safari, its failure modes are the product's failure modes. These tests
 * pin the properties that matter:
 *
 *   - the registration requests MAIN world at document_start in all frames, and
 *     persists across sessions (so it does not depend on the background running)
 *   - it is idempotent, so calling it on every background spawn is cheap and
 *     cannot create duplicate registrations (which would double-install every
 *     override)
 *   - a config drift persisted by an older version is repaired, not left stale
 *   - a concurrent-spawn duplicate-id race is treated as success
 *   - every failure path is non-throwing, so it can never wedge the background
 *     before `onMessage` is registered
 *
 * `ensureMainWorldRegistration()` is deliberately engine-agnostic (the
 * `__SAFARI__` policy gate lives in `installMainWorldInjection()`), which is what
 * makes it testable here — `__SAFARI__` is a build-time literal `false` under the
 * test harness.
 */

import {
  ensureMainWorldRegistration,
  removeMainWorldRegistration,
  isMainWorldInjectionSupported,
  MAIN_WORLD_SCRIPT_ID,
} from "@/background/main-world-inject";

interface RegisteredScript extends Record<string, unknown> {
  id: string;
}

interface ScriptingMock {
  registerContentScripts: ReturnType<typeof vi.fn>;
  unregisterContentScripts: ReturnType<typeof vi.fn>;
  getRegisteredContentScripts: ReturnType<typeof vi.fn>;
  /** Current in-memory registry, as the browser would report it. */
  registry: RegisteredScript[];
}

/**
 * Install a stateful fake `browser.scripting` that behaves like the real API:
 * registrations accumulate, duplicate ids are rejected, and reads are filtered.
 */
function installScriptingMock(): ScriptingMock {
  const registry: RegisteredScript[] = [];

  const registerContentScripts = vi.fn((scripts: RegisteredScript[]) => {
    for (const script of scripts) {
      if (registry.some((existing) => existing.id === script.id)) {
        return Promise.reject(
          new Error(`Duplicate script ID '${script.id}' -- script already registered`)
        );
      }
    }
    registry.push(...scripts);
    return Promise.resolve();
  });

  const unregisterContentScripts = vi.fn((filter?: { ids?: string[] }) => {
    const ids = filter?.ids;
    if (!ids) {
      registry.length = 0;
      return Promise.resolve();
    }
    for (const id of ids) {
      const index = registry.findIndex((existing) => existing.id === id);
      if (index === -1) {
        return Promise.reject(new Error(`Nonexistent script ID '${id}'`));
      }
      registry.splice(index, 1);
    }
    return Promise.resolve();
  });

  const getRegisteredContentScripts = vi.fn((filter?: { ids?: string[] }) => {
    const ids = filter?.ids;
    return Promise.resolve(ids ? registry.filter((s) => ids.includes(s.id)) : [...registry]);
  });

  (browser as unknown as Record<string, unknown>).scripting = {
    registerContentScripts,
    unregisterContentScripts,
    getRegisteredContentScripts,
  };

  return {
    registerContentScripts,
    unregisterContentScripts,
    getRegisteredContentScripts,
    registry,
  };
}

function removeScriptingApi(): void {
  delete (browser as unknown as Record<string, unknown>).scripting;
}

describe("Safari MAIN-world injection registration", () => {
  afterEach(() => {
    removeScriptingApi();
    vi.restoreAllMocks();
  });

  describe("engine support detection", () => {
    it("reports supported when the dynamic registration API is complete", () => {
      installScriptingMock();
      expect(isMainWorldInjectionSupported()).toBe(true);
    });

    it("reports unsupported when browser.scripting is absent (Safari < 15.4)", () => {
      removeScriptingApi();
      expect(isMainWorldInjectionSupported()).toBe(false);
    });

    it("reports unsupported when registerContentScripts is missing (Safari 15.4–16.3)", () => {
      // scripting.executeScript shipped in 15.4 but the dynamic content-script
      // registration we depend on only arrived in 16.4, so a partial namespace
      // must not be treated as usable.
      (browser as unknown as Record<string, unknown>).scripting = {
        executeScript: vi.fn(),
        insertCSS: vi.fn(),
      };
      expect(isMainWorldInjectionSupported()).toBe(false);
    });
  });

  describe("registration shape", () => {
    it("registers injected.js in the MAIN world at document_start, all frames, persisted", async () => {
      const api = installScriptingMock();

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);

      expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
      const [[scripts]] = api.registerContentScripts.mock.calls as [[RegisteredScript[]]];
      expect(scripts).toHaveLength(1);
      expect(scripts[0]).toEqual({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        runAt: "document_start",
        allFrames: true,
        world: "MAIN",
        persistAcrossSessions: true,
      });
    });

    it("uses the dynamic API's camelCase keys, not the manifest's snake_case", async () => {
      // A silent mismatch here (run_at / all_frames) would be accepted as an
      // unknown key by some engines and leave the script injecting late, or in
      // the top frame only — a spoofing hole that is invisible from the popup.
      const api = installScriptingMock();
      await ensureMainWorldRegistration();

      const [[scripts]] = api.registerContentScripts.mock.calls as [[RegisteredScript[]]];
      expect(scripts[0]).not.toHaveProperty("run_at");
      expect(scripts[0]).not.toHaveProperty("all_frames");
      expect(scripts[0].runAt).toBe("document_start");
      expect(scripts[0].allFrames).toBe(true);
    });

    it("persists across sessions so injection does not depend on the background running", async () => {
      const api = installScriptingMock();
      await ensureMainWorldRegistration();

      const [[scripts]] = api.registerContentScripts.mock.calls as [[RegisteredScript[]]];
      expect(scripts[0].persistAcrossSessions).toBe(true);
    });
  });

  describe("idempotency across background spawns", () => {
    it("registers once and no-ops on subsequent calls", async () => {
      const api = installScriptingMock();

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      await expect(ensureMainWorldRegistration()).resolves.toBe(true);

      expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
      expect(api.registry).toHaveLength(1);
    });

    it("does not unregister anything on the steady-state path", async () => {
      const api = installScriptingMock();

      await ensureMainWorldRegistration();
      api.unregisterContentScripts.mockClear();
      await ensureMainWorldRegistration();

      expect(api.unregisterContentScripts).not.toHaveBeenCalled();
    });

    it("only reads its own id rather than enumerating every registration", async () => {
      const api = installScriptingMock();
      await ensureMainWorldRegistration();

      expect(api.getRegisteredContentScripts).toHaveBeenCalledWith({
        ids: [MAIN_WORLD_SCRIPT_ID],
      });
    });
  });

  describe("repairing a stale registration from an older version", () => {
    it("re-registers when the persisted script path has drifted", async () => {
      const api = installScriptingMock();
      api.registry.push({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["<all_urls>"],
        js: ["content/old-injected.js"],
        runAt: "document_start",
        allFrames: true,
        world: "MAIN",
      });

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);

      expect(api.unregisterContentScripts).toHaveBeenCalledWith({
        ids: [MAIN_WORLD_SCRIPT_ID],
      });
      expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
      expect(api.registry).toHaveLength(1);
      expect(api.registry[0].js).toEqual(["content/injected.js"]);
    });

    it("re-registers when a persisted registration lost MAIN world", async () => {
      // The failure this guards: an ISOLATED-world registration injects
      // successfully and reports as present, but cannot touch page globals — so
      // spoofing would be inert while everything looked healthy.
      const api = installScriptingMock();
      api.registry.push({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        runAt: "document_start",
        allFrames: true,
        world: "ISOLATED",
      });

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      expect(api.unregisterContentScripts).toHaveBeenCalled();
      expect(api.registry[0].world).toBe("MAIN");
    });

    it("re-registers when a persisted registration lost allFrames", async () => {
      const api = installScriptingMock();
      api.registry.push({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        runAt: "document_start",
        allFrames: false,
        world: "MAIN",
      });

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      expect(api.registry[0].allFrames).toBe(true);
    });

    it("re-registers when a persisted registration lost document_start timing", async () => {
      const api = installScriptingMock();
      api.registry.push({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        runAt: "document_end",
        allFrames: true,
        world: "MAIN",
      });

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      expect(api.registry[0].runAt).toBe("document_start");
    });

    it("re-registers when the match pattern has narrowed", async () => {
      const api = installScriptingMock();
      api.registry.push({
        id: MAIN_WORLD_SCRIPT_ID,
        matches: ["https://example.com/*"],
        js: ["content/injected.js"],
        runAt: "document_start",
        allFrames: true,
        world: "MAIN",
      });

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      expect(api.registry[0].matches).toEqual(["<all_urls>"]);
    });
  });

  describe("failure handling", () => {
    it("returns false without throwing when the API is unavailable", async () => {
      removeScriptingApi();
      await expect(ensureMainWorldRegistration()).resolves.toBe(false);
    });

    it("treats a concurrent-spawn duplicate-id rejection as success", async () => {
      // Two background spawns can race into registration. The loser's rejection
      // means the winner succeeded, so the desired end state holds.
      const api = installScriptingMock();
      api.getRegisteredContentScripts.mockResolvedValueOnce([]);
      api.registerContentScripts.mockRejectedValueOnce(
        new Error(`Duplicate script ID '${MAIN_WORLD_SCRIPT_ID}'`)
      );

      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
    });

    it("returns false without throwing when registration genuinely fails", async () => {
      const api = installScriptingMock();
      api.registerContentScripts.mockRejectedValueOnce(new Error("Invalid match pattern"));

      await expect(ensureMainWorldRegistration()).resolves.toBe(false);
    });

    it("returns false without throwing when the registry read fails", async () => {
      const api = installScriptingMock();
      api.getRegisteredContentScripts.mockRejectedValueOnce(new Error("internal error"));

      await expect(ensureMainWorldRegistration()).resolves.toBe(false);
    });

    it("retries successfully on the next spawn after a transient failure", async () => {
      const api = installScriptingMock();
      api.registerContentScripts.mockRejectedValueOnce(new Error("transient"));

      await expect(ensureMainWorldRegistration()).resolves.toBe(false);
      await expect(ensureMainWorldRegistration()).resolves.toBe(true);
      expect(api.registry).toHaveLength(1);
    });

    it("does not throw when a non-Error value is rejected", async () => {
      const api = installScriptingMock();
      api.registerContentScripts.mockRejectedValueOnce("string failure");

      await expect(ensureMainWorldRegistration()).resolves.toBe(false);
    });
  });

  describe("removeMainWorldRegistration", () => {
    it("removes an existing registration", async () => {
      const api = installScriptingMock();
      await ensureMainWorldRegistration();
      expect(api.registry).toHaveLength(1);

      await removeMainWorldRegistration();
      expect(api.registry).toHaveLength(0);
    });

    it("is a no-op when nothing is registered", async () => {
      installScriptingMock();
      await expect(removeMainWorldRegistration()).resolves.toBeUndefined();
    });

    it("is a no-op when the API is unavailable", async () => {
      removeScriptingApi();
      await expect(removeMainWorldRegistration()).resolves.toBeUndefined();
    });
  });
});
