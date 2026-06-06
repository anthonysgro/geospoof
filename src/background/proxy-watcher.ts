/**
 * Proxy-Change Watcher — event-driven VPN re-sync trigger.
 *
 * A browser-extension VPN (e.g. the Proton VPN browser extension, or the
 * NordVPN extension on Chromium) routes the browser's traffic by setting the
 * browser proxy configuration. When such an extension connects or switches exit
 * nodes, it mutates `proxy.settings`, and the browser fires
 * `proxy.settings.onChange` to every extension holding the `proxy` permission —
 * including ours, even though the change was made by a *different* extension
 * (the change details carry `levelOfControl: "controlled_by_other_extensions"`).
 *
 * We use that as a precise, push-style signal that the browser's VPN routing
 * just changed, and hand it to the shared re-sync gate (see resync-core.ts),
 * which makes exactly one cheap public-IP lookup and only geolocates +
 * re-applies the location when the exit IP has actually moved.
 *
 * This is the best signal where it exists, but it only fires for VPNs that
 * drive `proxy.settings`. VPNs that route via `proxy.onRequest` (e.g. the
 * Firefox NordVPN / Mozilla VPN extensions) and OS/desktop VPNs never touch
 * `proxy.settings`, so this watcher stays silent for them — the
 * activity-watcher covers those cases.
 *
 * Engine support:
 *   - Chromium (Chrome/Brave/Edge/Opera): `chrome.proxy.settings` ChromeSetting
 *     exposes `onChange`. Supported.
 *   - Firefox desktop: `browser.proxy.settings` BrowserSetting exposes
 *     `onChange`. Supported.
 *   - Firefox for Android: `proxy.settings` not supported. Feature-detect no-op.
 *   - Safari (macOS/iOS/iPadOS): no proxy WebExtensions API. Feature-detect
 *     no-op (the `proxy` permission is also filtered out of the Safari build).
 *
 * This watcher is observe-only: it reads `onChange` notifications and never
 * calls `proxy.settings.set()`, so it can't interfere with the VPN extension's
 * own proxy control.
 */

import { createLogger } from "@/shared/utils/debug-logger";
import {
  triggerResyncCheck,
  RESYNC_DEBOUNCE_MS,
  MIN_CHECK_INTERVAL_MS,
  _resetResyncCoreState,
} from "./resync-core";

const logger = createLogger("BG");

let _listenerInstalled = false;

/**
 * Feature-detect the proxy settings `onChange` event for the current engine.
 * Returns the event object when available, else null.
 *
 * Typed loosely because `@types/firefox-webext-browser` models this as a
 * Firefox `BrowserSetting`, while the Chromium runtime provides the
 * shape-compatible `ChromeSetting`; both expose `onChange.addListener`.
 */
function getProxyOnChange(): {
  addListener: (cb: (details: unknown) => void) => void;
  removeListener: (cb: (details: unknown) => void) => void;
} | null {
  const settings = (
    browser as unknown as {
      proxy?: { settings?: { onChange?: unknown } };
    }
  ).proxy?.settings;
  const onChange = settings?.onChange as
    | {
        addListener: (cb: (details: unknown) => void) => void;
        removeListener: (cb: (details: unknown) => void) => void;
      }
    | undefined;
  if (onChange && typeof onChange.addListener === "function") {
    return onChange;
  }
  return null;
}

/**
 * True when this engine exposes the proxy-change signal the watcher needs.
 */
export function isProxyWatcherSupported(): boolean {
  return getProxyOnChange() !== null;
}

/**
 * Install the proxy-change listener. Safe to call multiple times — only the
 * first call registers a listener. No-ops on engines without the proxy API.
 *
 * The listener itself is registered unconditionally (so it survives MV3
 * service-worker restarts); the shared gate re-checks `vpnSyncEnabled` at fire
 * time so toggling sync off doesn't require tearing the listener down.
 */
export function installProxyWatcher(): void {
  if (_listenerInstalled) return;
  const onChange = getProxyOnChange();
  if (!onChange) {
    logger.debug(
      "[PROXY-WATCH] proxy.settings.onChange unavailable on this engine; not installing"
    );
    return;
  }

  onChange.addListener(onProxyChanged);
  _listenerInstalled = true;
  logger.info("[PROXY-WATCH] Installed proxy.settings.onChange listener");
}

/**
 * `proxy.settings.onChange` handler. Hands off to the shared re-sync gate,
 * which debounces, rate-limits, and only re-syncs on a genuine exit-IP change.
 */
function onProxyChanged(details: unknown): void {
  const levelOfControl =
    details && typeof details === "object" && "levelOfControl" in details
      ? String((details as { levelOfControl?: unknown }).levelOfControl)
      : "unknown";
  logger.debug("[PROXY-WATCH] proxy.settings changed (levelOfControl:", levelOfControl + ")");
  triggerResyncCheck("proxy-change");
}

// Re-exported from the shared gate for backwards compatibility with existing
// imports/tests. `PROXY_CHANGE_DEBOUNCE_MS` is the gate's debounce window.
export { MIN_CHECK_INTERVAL_MS };
export { RESYNC_DEBOUNCE_MS as PROXY_CHANGE_DEBOUNCE_MS };

/**
 * Reset internal watcher state (for testing only). Also resets the shared gate.
 */
export function _resetProxyWatcherState(): void {
  _listenerInstalled = false;
  _resetResyncCoreState();
}
