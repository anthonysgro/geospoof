/**
 * Browser-level TIMEZONE spoofing via the Chrome DevTools Protocol
 * (`chrome.debugger`).
 *
 * This is the Chromium-only alternative to the page-world content-script
 * timezone overrides. Instead of patching Date/Intl from inside each page, it
 * attaches the `chrome.debugger` client to every in-scope http/https tab and
 * drives `Emulation.setTimezoneOverride`, which spoofs the timezone for Date and
 * Intl across every frame *and* worker (incl. module/service workers) — which
 * the Chromium content-script path cannot fully cover (no
 * `webRequest.filterResponseData` on Chromium MV3). Applied via
 * `webNavigation.onBeforeNavigate`, before the page's first script runs, so it
 * also closes the cold-start race.
 *
 * SCOPE: geolocation is deliberately NOT handled here. CDP can only spoof
 * geolocation by setting an override behind the normal permission flow, which
 * races the page's first `getCurrentPosition` (a grant has to land before the
 * call) — so it can't guarantee the prompt-free behaviour users expect. The
 * content-script injection *replaces* `getCurrentPosition`, so it's reliably
 * prompt-free, race-free, and already per-tab scope-aware. Therefore, even in
 * debugger mode, geolocation stays on the injected path and only the injected
 * *timezone* overrides are suppressed (the broadcast withholds `timezone` so
 * the page-world timezone overrides no-op while CDP owns the timezone). The
 * cost is Chrome's persistent "GeoSpoof started debugging this browser" bar, so
 * the feature is strictly opt-in (`Settings.debuggerModeEnabled`).
 *
 * MV3 design notes:
 *   - STATELESS. The service worker is torn down when idle, so we keep no
 *     authoritative attachment state in memory. `chrome.debugger.getTargets()`
 *     is the source of truth for what's attached; settings are read fresh from
 *     storage in every event handler.
 *   - Listeners are registered at the top level (see `installDebuggerWatchers`,
 *     called from `index.ts` alongside `installResyncWatchers`) so they
 *     re-bind on every SW respawn.
 *
 * Entirely guarded by `__CHROMIUM__` (compiled out of Firefox/Safari) and by
 * the presence of `chrome.debugger` (the `debugger` permission is declared
 * required on the Chromium build, so it's present there).
 */

import type { Tabs } from "webextension-polyfill";
import type { Settings } from "@/shared/types/settings";
import { computeEffectiveEnabled } from "@/shared/utils/scope";
import { loadSettings } from "./settings";
import { isRestrictedUrl } from "./tabs";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/** CDP version string passed to chrome.debugger.attach. */
const PROTOCOL_VERSION = "1.3";

/** Resolved override values for a single apply pass. */
interface Overrides {
  timezoneId: string | null;
}

/** Top-level listeners installed once per service-worker lifetime. */
let watchersInstalled = false;

/**
 * Whether the `webNavigation.onBeforeNavigate` listener is actually bound. This
 * is NOT the same as `chrome.webNavigation` merely existing: the permission can
 * be granted at runtime *after* the SW started (so the namespace appears but
 * our listener was never added). The `tabs.onUpdated` fallback gates on this
 * flag so exactly one early-attach path is ever live.
 */
let webNavRegistered = false;

/**
 * Browser-level timezone spoofing runs only with the mode on, protection on,
 * and a timezone to apply. (Geolocation is handled by the injected path, so it
 * doesn't gate this.)
 */
function shouldSpoof(settings: Settings): boolean {
  return (
    __CHROMIUM__ && settings.debuggerModeEnabled && settings.enabled && settings.timezone != null
  );
}

function isSpoofableTabUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith("http://") || url.startsWith("https://"));
}

/**
 * Whether a specific tab URL should be spoofed, honouring the same per-site
 * scope (all / allowlist / denylist) the content-script broadcast uses. Keeps
 * debugger mode consistent with injection mode — a denylisted site is never
 * attached, an allowlisted-only site is the only one attached, etc.
 */
function tabInScope(settings: Settings, url: string | undefined): boolean {
  if (!isSpoofableTabUrl(url)) return false;
  return computeEffectiveEnabled({
    masterEnabled: settings.enabled,
    scopeMode: settings.scopeMode,
    allowlist: settings.allowlist,
    denylist: settings.denylist,
    proFeaturesBlocked: settings.proFeaturesBlocked,
    topLevelUrl: url,
    isRestricted: isRestrictedUrl,
  });
}

function buildOverrides(settings: Settings): Overrides {
  return { timezoneId: settings.timezone?.identifier ?? null };
}

/**
 * Apply the timezone override to one tab we hold (or are about to hold) a
 * session on. Never throws.
 */
async function applyOverridesToTab(tabId: number, overrides: Overrides): Promise<void> {
  const dbg = chrome.debugger;
  if (!dbg || !overrides.timezoneId) return;
  try {
    await dbg.sendCommand({ tabId }, "Emulation.setTimezoneOverride", {
      timezoneId: overrides.timezoneId,
    });
  } catch (error) {
    logger.debug(`setTimezoneOverride failed for tab ${tabId}:`, error);
  }
}

/**
 * Ensure we're attached to `tabId`, then apply the override. We attempt the
 * attach unconditionally and tolerate failure: if we're already attached (by
 * us) the apply still succeeds; if another client (DevTools) holds the tab the
 * apply fails harmlessly and the tab keeps its real timezone. Never throws.
 */
async function attachAndApplyTab(tabId: number, overrides: Overrides): Promise<void> {
  const dbg = chrome.debugger;
  if (!dbg) return;
  try {
    await dbg.attach({ tabId }, PROTOCOL_VERSION);
  } catch (error) {
    // Expected when already attached (re-applies are still wanted) or when the
    // tab can't be attached (DevTools open, restricted target). Proceed to
    // apply regardless; it only takes effect if we actually hold a session.
    logger.debug(`attach tab ${tabId}:`, error);
  }
  await applyOverridesToTab(tabId, overrides);
}

/** Read settings fresh and reconcile a single tab: attach+apply if in scope, else detach. */
async function ensureTabSpoofed(tabId: number, url: string | undefined): Promise<void> {
  const settings = await loadSettings();
  if (!shouldSpoof(settings) || !tabInScope(settings, url)) {
    // Out of scope (or spoofing off) — make sure we're not holding a stale
    // session on this tab (e.g. it navigated from an allowlisted page away).
    await detachTab(tabId);
    return;
  }
  await attachAndApplyTab(tabId, buildOverrides(settings));
}

/**
 * Revert our timezone override on one tab so it reads the real zone live, then
 * detach. We clear explicitly (empty timezoneId disables the override) rather
 * than relying on detach's implicit teardown, which doesn't reliably revert
 * `Emulation.setTimezoneOverride` on the already-loaded document. Best-effort;
 * never throws.
 */
async function detachTab(tabId: number): Promise<void> {
  const dbg = chrome.debugger;
  if (!dbg) return;
  const target = { tabId };

  try {
    await dbg.sendCommand(target, "Emulation.setTimezoneOverride", { timezoneId: "" });
  } catch {
    /* not attached / no override — fine */
  }
  try {
    await dbg.detach(target);
  } catch {
    // Wasn't attached (the common case) — nothing to do.
  }
}

/** Clear the timezone override on, and detach from, every page target we hold. */
async function detachAll(): Promise<void> {
  const dbg = chrome.debugger;
  if (!dbg) return;

  let targets: ChromeDebugger.TargetInfo[] = [];
  try {
    targets = await dbg.getTargets();
  } catch (error) {
    logger.debug("getTargets failed during detachAll:", error);
    return;
  }

  const attached = targets.filter((t) => t.type === "page" && t.tabId != null && t.attached);
  await Promise.allSettled(attached.map((t) => detachTab(t.tabId!)));
}

/**
 * Reconcile the live debugger state with the current settings. Idempotent — the
 * single entry point to call after any settings change that could affect
 * browser-level spoofing (mode toggle, protection toggle, location/timezone
 * change, VPN sync) and on background startup.
 *
 * Active → attach to every in-scope open tab and (re)apply the timezone
 * override. Inactive → detach everything. No-op on non-Chromium builds.
 */
export async function syncDebuggerSpoofing(settings: Settings): Promise<void> {
  if (!__CHROMIUM__) return;

  const dbg = chrome.debugger;
  if (!dbg) {
    if (shouldSpoof(settings)) {
      // Mode is on but the `debugger` API isn't available (permission revoked
      // from chrome://extensions, or a non-Chromium engine reaching here).
      logger.warn("[debugger] mode enabled but chrome.debugger is unavailable; skipping");
    }
    return;
  }

  if (!shouldSpoof(settings)) {
    await detachAll();
    return;
  }

  const overrides = buildOverrides(settings);

  let targets: ChromeDebugger.TargetInfo[] = [];
  try {
    targets = await dbg.getTargets();
  } catch (error) {
    logger.warn("[debugger] getTargets failed; cannot apply debugger spoofing:", error);
    return;
  }

  const pageTargets = targets.filter((t) => t.type === "page" && t.tabId != null);
  const inScope = pageTargets.filter((t) => tabInScope(settings, t.url));
  // Tabs we currently hold that fell out of scope (e.g. scope just changed) must
  // be released so an excluded site isn't left spoofed.
  const staleAttached = pageTargets.filter((t) => t.attached && !tabInScope(settings, t.url));

  logger.info("[debugger] applying browser-level timezone spoofing", {
    apply: inScope.length,
    detach: staleAttached.length,
    timezone: overrides.timezoneId,
  });

  await Promise.allSettled([
    ...inScope.map((t) => attachAndApplyTab(t.tabId!, overrides)),
    ...staleAttached.map((t) => detachTab(t.tabId!)),
  ]);
}

// --- Top-level listeners (MV3: registered synchronously, re-bind on respawn) ---

/** A debug session ended (tab closed, DevTools opened, user dismissed the bar). */
function onDebuggerDetach(
  source: ChromeDebugger.Debuggee,
  reason: ChromeDebugger.DetachReason
): void {
  // Stateless: nothing to clean up. We deliberately do NOT re-attach on
  // "canceled_by_user" — re-spawning the debugging bar the user just dismissed
  // would be hostile; that tab falls back to no browser-level spoofing.
  logger.debug(`debugger detached from tab ${source.tabId ?? "?"} (${reason})`);
}

/**
 * Fired before a navigation's network request — the earliest hook, so the
 * override is in place before the document's first script. Top-level frames
 * only. Requires the optional `webNavigation` permission (the popup requests it
 * when the mode is enabled); absent that, `onTabUpdated` is the fallback.
 */
function onBeforeNavigate(details: ChromeWebNavigation.OnBeforeNavigateDetails): void {
  if (details.frameId !== 0) return;
  void ensureTabSpoofed(details.tabId, details.url);
}

/**
 * Fallback attach path used only when `onBeforeNavigate` isn't bound (i.e. the
 * `webNavigation` permission hasn't been granted). Later than onBeforeNavigate,
 * so a brand-new tab's first page can briefly race, but once attached the
 * override persists.
 */
function onTabUpdated(
  tabId: number,
  changeInfo: Tabs.OnUpdatedChangeInfoType,
  tab: Tabs.Tab
): void {
  if (webNavRegistered) return; // onBeforeNavigate is handling early attach
  if (changeInfo.status !== "loading") return;
  void ensureTabSpoofed(tabId, tab.url);
}

/**
 * Bind `onBeforeNavigate` if the `webNavigation` permission is held and we
 * haven't already. Idempotent. Called at install time AND from
 * `permissions.onAdded`, because the permission is optional and is typically
 * granted at runtime (when the user enables debugger mode) — after the SW has
 * already started. Without the runtime path the listener would stay unbound
 * until the next SW respawn, silently leaving the cold-start race open.
 */
function registerWebNavigationListener(): void {
  if (webNavRegistered) return;
  if (chrome.webNavigation?.onBeforeNavigate) {
    chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
    webNavRegistered = true;
    logger.debug("[debugger] onBeforeNavigate listener bound");
  }
}

/** Minimal shape of `browser.permissions.onAdded` (absent from the FF polyfill types we use). */
interface PermissionsOnAdded {
  onAdded?: { addListener: (cb: (p: { permissions?: string[] }) => void) => void };
}

/**
 * Register the debugger-spoofing listeners at the top level so they survive MV3
 * service-worker respawns. Idempotent within a worker lifetime; safe to call on
 * every (re)spawn. No-op on non-Chromium builds.
 */
export function installDebuggerWatchers(): void {
  if (!__CHROMIUM__) return;
  if (watchersInstalled) return;
  watchersInstalled = true;

  if (chrome.debugger) {
    chrome.debugger.onDetach.addListener(onDebuggerDetach);
  }

  // Bind onBeforeNavigate now if webNavigation is already granted (e.g. on a SW
  // respawn after the user opted in on a previous run).
  registerWebNavigationListener();

  // …and bind it the instant webNavigation is granted at runtime, so enabling
  // debugger mode takes full effect without waiting for a SW restart.
  const perms = (browser as unknown as { permissions?: PermissionsOnAdded }).permissions;
  perms?.onAdded?.addListener((p) => {
    if (p?.permissions?.includes("webNavigation")) registerWebNavigationListener();
  });

  // Always register the fallback; it self-gates via `webNavRegistered`.
  browser.tabs.onUpdated.addListener(onTabUpdated);
}
