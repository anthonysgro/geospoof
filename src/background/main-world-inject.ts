/**
 * MAIN-world injection registration (Safari only).
 *
 * ## Why this module exists
 *
 * All of GeoSpoof's actual overrides (`navigator.geolocation`, `Date`, `Intl`,
 * `RTCPeerConnection`, …) live in `content/injected.js`, which MUST run in the
 * page's MAIN world — the isolated content-script world cannot reach the
 * globals a page reads. `content/content.js` runs isolated and only relays
 * settings over a CustomEvent.
 *
 * On Firefox and Chromium we get the MAIN world declaratively, via a
 * `content_scripts` entry with `world: "MAIN"` in the manifest. Safari only
 * added support for that manifest key in **Safari 18** — on Safari 17 and
 * earlier the key is not honoured, so `injected.js` never reaches the page and
 * spoofing silently does nothing. That is the entire bug behind "the popup
 * won't hold its settings on iPadOS 17": the extension looked installed and
 * enabled but could not actually spoof anything.
 *
 * The `scripting` API's MAIN world has a much longer history on Safari:
 *
 *   | Entry point                                        | Safari |
 *   | -------------------------------------------------- | ------ |
 *   | manifest `content_scripts[].world`                 | 18     |
 *   | `scripting.registerContentScripts({world:"MAIN"})` | 16.4   |
 *   | `scripting.executeScript({world:"MAIN"})`          | 15.4   |
 *
 * So we register the MAIN-world script at runtime instead.
 *
 * ## Why runtime registration is the ONLY Safari path
 *
 * The Safari manifest deliberately does NOT declare a `world: "MAIN"` content
 * script (see `src/build/manifest.ts`). Keeping both would mean Safari 18+
 * injects `injected.js` twice per frame — once statically, once dynamically —
 * which would double-install every override and double-parse a 67 kB bundle on
 * every page load. Avoiding that by sniffing `Version/(\d+)` out of the user
 * agent would put an untestable version branch on the critical path of the
 * product's core feature.
 *
 * Registering dynamically on *every* Safari version instead gives us one code
 * path with no version detection, which means the configuration we test on a
 * current Safari is bit-for-bit the configuration that runs on Safari 17.
 * That property is worth more than the declarative manifest entry.
 *
 * `persistAcrossSessions: true` (Safari 16.4+) means the registration survives
 * browser relaunch, so after the first successful call the browser injects the
 * script with no dependency on the background being alive — exactly the same
 * guarantee the static manifest entry provides on Chromium/Firefox.
 *
 * ## Semantics deliberately matched to the static entry
 *
 * Like a manifest-declared content script (and like Chromium/Firefox today),
 * this registration does not apply to tabs that were already open when it was
 * created; those pick it up on their next navigation. We intentionally do NOT
 * "catch up" open tabs with `scripting.executeScript`, because a catch-up
 * injection can race the newly-registered content script on a tab that
 * navigates at the same moment and double-install the overrides. Matching the
 * existing cross-engine behaviour is both safer and less surprising.
 *
 * Everything here is best-effort and never throws. On failure we log loudly and
 * retry on the next background spawn (which happens on essentially any browser
 * event), so a transient failure is self-healing.
 */

import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/**
 * Stable id for the dynamically registered MAIN-world script.
 *
 * Must not change across releases: `persistAcrossSessions` registrations are
 * keyed by id, and `ensureMainWorldRegistration()` uses the id to recognise its
 * own prior registration instead of creating a duplicate.
 */
export const MAIN_WORLD_SCRIPT_ID = "gs-main-world";

/** The script file to inject. Shipped in the bundle; NOT web-accessible. */
const INJECTED_SCRIPT = "content/injected.js";

/**
 * Desired registration. Mirrors the `world: "MAIN"` manifest entry that
 * Firefox/Chromium use, translated to the dynamic API's camelCase keys.
 */
interface DesiredScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: "document_start";
  allFrames: boolean;
  world: "MAIN";
  persistAcrossSessions: boolean;
}

function desiredScript(): DesiredScript {
  return {
    id: MAIN_WORLD_SCRIPT_ID,
    matches: ["<all_urls>"],
    js: [INJECTED_SCRIPT],
    runAt: "document_start",
    allFrames: true,
    world: "MAIN",
    persistAcrossSessions: true,
  };
}

/**
 * Minimal structural type for the slice of `browser.scripting` we use.
 *
 * Typed locally rather than via `webextension-polyfill` /
 * `@types/firefox-webext-browser`, neither of which models `world` on the
 * dynamic content-script registration shape. Same approach as the
 * `UserScriptsApi` interface in `bootstrap-register.ts`.
 */
interface ScriptingApi {
  registerContentScripts: (scripts: DesiredScript[]) => Promise<void>;
  unregisterContentScripts: (filter?: { ids?: string[] }) => Promise<void>;
  getRegisteredContentScripts: (filter?: {
    ids?: string[];
  }) => Promise<Array<Record<string, unknown>>>;
}

/**
 * Feature-detect the dynamic content-script registration API, including the
 * three calls we need. Returns null when unavailable (Safari < 16.4), in which
 * case there is no MAIN-world primitive we can use and spoofing cannot work on
 * that engine — see `isMainWorldInjectionSupported()`.
 */
function getScriptingApi(): ScriptingApi | null {
  try {
    const api = browser.scripting as unknown as Partial<ScriptingApi> | undefined;
    if (
      api &&
      typeof api.registerContentScripts === "function" &&
      typeof api.unregisterContentScripts === "function" &&
      typeof api.getRegisteredContentScripts === "function"
    ) {
      return api as ScriptingApi;
    }
  } catch {
    /* namespace not present */
  }
  return null;
}

/**
 * True when this engine can register a MAIN-world content script at runtime.
 *
 * Exposed so callers (and tests) can distinguish "we chose not to register"
 * from "this engine cannot do MAIN-world injection at all".
 */
export function isMainWorldInjectionSupported(): boolean {
  return getScriptingApi() !== null;
}

/**
 * Does an existing registration match what we want?
 *
 * Guards the upgrade path: if a future release changes `matches`, `allFrames`,
 * or the script path, a registration persisted by an older version would
 * otherwise linger with stale config forever, because `persistAcrossSessions`
 * survives extension updates. Any drift triggers unregister + re-register.
 *
 * Deliberately compares only the fields that affect injection behaviour, and
 * NOT `persistAcrossSessions`. Engines are not consistent about echoing that
 * flag back from `getRegisteredContentScripts()`, so comparing it would read as
 * permanent drift on an engine that omits it — turning every background spawn
 * into an unregister + re-register cycle. The fields below are all reliably
 * reported, and none of them can differ without changing what gets injected.
 */
function matchesDesired(existing: Record<string, unknown>, want: DesiredScript): boolean {
  const js = existing.js;
  const matches = existing.matches;
  return (
    Array.isArray(js) &&
    js.length === want.js.length &&
    js.every((entry, i) => entry === want.js[i]) &&
    Array.isArray(matches) &&
    matches.length === want.matches.length &&
    matches.every((entry, i) => entry === want.matches[i]) &&
    existing.runAt === want.runAt &&
    existing.allFrames === want.allFrames &&
    existing.world === want.world
  );
}

/**
 * Ensure the MAIN-world script is registered, exactly once, with the current
 * desired configuration.
 *
 * Idempotent and safe to call on every background spawn: the common case is a
 * single `getRegisteredContentScripts()` read that finds a matching
 * registration and returns without writing anything.
 *
 * Engine-agnostic by design — this is the *mechanism*, and it is correct on any
 * engine exposing the dynamic registration API. The *policy* (only Safari needs
 * this, because Firefox/Chromium declare the MAIN world in the manifest) lives
 * in `installMainWorldInjection()` and in `initialize()`'s `__SAFARI__` gate.
 * Keeping the gate out of here is what lets the logic below be unit-tested,
 * since `__SAFARI__` is a build-time literal `false` under the test harness.
 *
 * Never throws.
 *
 * @returns true when a correct registration is in place afterwards.
 */
export async function ensureMainWorldRegistration(): Promise<boolean> {
  const api = getScriptingApi();
  if (!api) {
    // Safari < 16.4. There is no runtime MAIN-world primitive here and the
    // manifest key needs Safari 18, so page overrides cannot be installed on
    // this engine at all. Logged at error level because it means the core
    // feature is inert, not merely degraded.
    logger.error(
      "[main-world] scripting.registerContentScripts unavailable — " +
        "MAIN-world injection impossible on this Safari version; page spoofing will not work"
    );
    return false;
  }

  const want = desiredScript();

  try {
    const existing = await api.getRegisteredContentScripts({ ids: [want.id] });
    const current = existing.find((s) => s.id === want.id);

    if (current) {
      if (matchesDesired(current, want)) {
        logger.debug("[main-world] registration already present and current");
        return true;
      }
      // Stale config persisted by an older version — replace it.
      logger.info("[main-world] registration is stale, re-registering", { current });
      await api.unregisterContentScripts({ ids: [want.id] });
    }

    await api.registerContentScripts([want]);
    logger.info("[main-world] registered MAIN-world content script", {
      id: want.id,
      js: want.js,
    });
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Two background spawns can race into registration concurrently. The loser
    // gets a duplicate-id rejection, which means the winner succeeded — the
    // desired end state holds, so this is success, not failure.
    if (/duplicate|already registered|already exists/i.test(msg)) {
      logger.debug("[main-world] registration already claimed by a concurrent spawn");
      return true;
    }

    // Genuine failure. Loud, because it means no page overrides are installed.
    // Retried on the next background spawn.
    logger.error(
      "[main-world] failed to register MAIN-world content script — " +
        "page spoofing is inactive until this succeeds:",
      msg
    );
    return false;
  }
}

/**
 * Remove the registration (used by tests and available for teardown).
 * Never throws.
 */
export async function removeMainWorldRegistration(): Promise<void> {
  const api = getScriptingApi();
  if (!api) return;
  try {
    await api.unregisterContentScripts({ ids: [MAIN_WORLD_SCRIPT_ID] });
  } catch {
    /* wasn't registered — fine */
  }
}

/**
 * Fire-and-forget entry point for the background's synchronous top-level run.
 *
 * Registration is deliberately kicked off from module scope (not only from
 * `initialize()`): on a non-persistent background, `onStartup`/`onInstalled` do
 * NOT fire for the ordinary event-driven respawns, and on iOS Safari `onStartup`
 * is unreliable in general. Calling it here means every spawn re-asserts the
 * registration, which doubles as the retry path for a previously failed attempt.
 */
export function installMainWorldInjection(): void {
  if (!__SAFARI__) return;
  void ensureMainWorldRegistration();
}
