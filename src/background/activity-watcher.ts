/**
 * Activity-Driven Re-sync Watcher.
 *
 * There is no browser push event for "the public exit IP changed" — this was
 * verified empirically against every candidate (proxy.settings.onChange only
 * fires for proxy-API VPNs; networkStatus is privileged and unshippable;
 * captivePortal fired ~1-in-9 switches; online/offline and a webRequest
 * reset-burst detector fired ~never for transparently-rerouting desktop and
 * Firefox onRequest VPNs). The only reliable detector is actually checking the
 * IP.
 *
 * So rather than blind interval polling, we drive that cheap check off real
 * browser activity:
 *   - `tabs.onUpdated` (navigation) — if the exit IP moved, the user's next
 *     page load goes through the new node, which is exactly the moment an
 *     accurate spoofed location matters.
 *   - `idle.onStateChanged` → active — the laptop woke up, possibly on a new
 *     network / VPN exit.
 *
 * A stale spoofed location only matters while a page is actively reading
 * geolocation, which only happens while the browser is active — so triggering
 * on activity covers exactly the moments that matter and does zero work while
 * idle.
 *
 * Both triggers funnel into the shared re-sync gate (resync-core.ts), which
 * debounces, enforces the steady-state minimum-interval floor (so frantic
 * navigation can't hammer the IP-detection service), and only geolocates +
 * re-applies on a genuine exit-IP change. It coexists with the proxy-watcher:
 * on Chromium + a proxy-API VPN, `proxy.settings.onChange` does the resync
 * first and the activity triggers that follow just hit the IP-diff check and
 * no-op. Self-gates on `vpnSyncEnabled` at check time (in the shared gate).
 *
 * Engine support:
 *   - `tabs.onUpdated`: all engines.
 *   - `idle.onStateChanged`: Chromium + Firefox (the `idle` permission is
 *     filtered out of the Safari build); feature-detected to a no-op elsewhere.
 */

import type { Tabs, Idle } from "webextension-polyfill";
import { createLogger } from "@/shared/utils/debug-logger";
import { triggerResyncCheck } from "./resync-core";

const logger = createLogger("BG");

let _listenersInstalled = false;

function onTabUpdated(
  _tabId: number,
  changeInfo: Tabs.OnUpdatedChangeInfoType,
  _tab: Tabs.Tab
): void {
  // "loading" is the earliest signal that a navigation has started.
  if (changeInfo.status === "loading") {
    triggerResyncCheck("tab-navigation");
  }
}

function onIdleStateChanged(state: Idle.IdleState): void {
  if (state === "active") {
    triggerResyncCheck("idle-active");
  }
}

/**
 * True when this engine exposes at least one activity trigger.
 */
export function isActivityWatcherSupported(): boolean {
  return Boolean(browser.tabs?.onUpdated || browser.idle?.onStateChanged);
}

/**
 * Install the activity triggers. Safe to call multiple times — only the first
 * call registers listeners. Each trigger is feature-detected independently so
 * the watcher degrades gracefully on engines missing one of them.
 */
export function installActivityWatcher(): void {
  if (_listenersInstalled) return;

  let installedTab = false;
  let installedIdle = false;

  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener(onTabUpdated);
    installedTab = true;
  }

  if (browser.idle?.onStateChanged) {
    browser.idle.onStateChanged.addListener(onIdleStateChanged);
    installedIdle = true;
  }

  _listenersInstalled = true;
  logger.info(
    "[ACTIVITY-WATCH] Installed activity triggers (tabs:",
    installedTab + ", idle:",
    installedIdle + ")"
  );
}

/**
 * Reset internal watcher state (for testing only).
 */
export function _resetActivityWatcherState(): void {
  _listenersInstalled = false;
}
