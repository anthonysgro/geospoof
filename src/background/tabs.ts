/**
 * Tab Management
 * Broadcasting settings to tabs, content script injection, and URL checks.
 */

import type { Settings } from "@/shared/types/settings";
import type { UpdateSettingsPayload, InjectionStatus } from "@/shared/types/messages";
import { createLogger } from "@/shared/utils/debug-logger";
import { computeEffectiveEnabled, computeEffectivePreserveGeoPrompt } from "@/shared/utils/scope";
import { computeEffectiveAccuracySetting } from "@/shared/accuracy/resolver";
import { updateWorkerFilterSettings } from "./worker-request-filter";

const logger = createLogger("BG");

/**
 * Build and deliver the per-tab `UPDATE_SETTINGS` payload for a single tab.
 *
 * The background is the sole gatekeeper for the per-tab spoofing decision: the
 * `enabled` field is that tab's `Effective_Enabled` value, computed from its
 * top-level URL via the shared `computeEffectiveEnabled` source of truth (Req
 * 8.1, 8.2). The non-scope fields are equal to the persisted Settings (Req
 * 8.3). The allowlist/denylist arrays are never included — `UpdateSettingsPayload`
 * has no list keys, so the lists cannot leak (privacy invariant). One value per
 * tab is sent; `tabs.sendMessage` fans it out to every frame (Req 7.2).
 *
 * Shared by `broadcastSettingsToTabs` (settings/list/mode changes) and the
 * navigation re-evaluation path in `index.ts` (full and same-document/SPA
 * navigations), so both build an identical payload (Req 9.1, 9.2). Returns
 * `true` when the message was delivered, `false` on a send failure (e.g. no
 * content script in the tab yet) or a missing tab id.
 */
export async function sendSettingsToTab(
  tab: { id?: number; url?: string },
  settings: Settings
): Promise<boolean> {
  if (tab.id == null) {
    return false;
  }

  // Resolve Effective_Enabled for this tab against its top-level URL (Req 8.1,
  // 8.2). Restricted or undeterminable URLs resolve to false (Req 8.6).
  const enabled = computeEffectiveEnabled({
    masterEnabled: settings.enabled,
    scopeMode: settings.scopeMode,
    allowlist: settings.allowlist,
    denylist: settings.denylist,
    proFeaturesBlocked: settings.proFeaturesBlocked,
    topLevelUrl: tab.url,
    isRestricted: isRestrictedUrl,
  });

  // When browser-level (chrome.debugger) spoofing is active on Chromium, CDP
  // owns the TIMEZONE (it covers every frame/worker before first script).
  // Withhold the timezone from the injected path so its Date/Intl overrides
  // no-op (they gate on having timezone data) — but keep `enabled` and
  // `location` so the injected GEOLOCATION override still runs (CDP can't make
  // geolocation reliably prompt-free). WebRTC is independent. Compiled out on
  // Firefox/Safari.
  const debuggerActive = __CHROMIUM__ && settings.debuggerModeEnabled;

  const payload: UpdateSettingsPayload = {
    enabled,
    location: settings.location,
    timezone: debuggerActive ? null : settings.timezone,
    debugLogging: settings.debugLogging,
    verbosityLevel: settings.verbosityLevel,
    webrtcProtection: settings.webrtcProtection,
    preserveGeolocationPrompt: computeEffectivePreserveGeoPrompt(
      settings.preserveGeolocationPrompt,
      settings.proFeaturesBlocked
    ),
    // Custom accuracy is Pro-gated on iOS Safari: force Realistic ("auto") for a
    // free user so the page can't receive a pinned accuracy. Fail-open +
    // Safari-only (no effect on macOS / Chrome / Firefox).
    accuracySetting: computeEffectiveAccuracySetting(
      settings.accuracySetting,
      settings.proFeaturesBlocked
    ),
    accuracySeed: settings.accuracySeed,
  };

  try {
    await browser.tabs.sendMessage(tab.id, { type: "UPDATE_SETTINGS", payload });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to send to tab ${tab.id} (${tab.url}):`, message);
    console.debug(`Could not send message to tab ${tab.id} (${tab.url}):`, message);
    return false;
  }
}

/**
 * Broadcast settings to all open tabs via content scripts, computing each tab's
 * per-tab decision through {@link sendSettingsToTab}.
 */
export async function broadcastSettingsToTabs(settings: Settings): Promise<void> {
  // Refresh the webRequest listener's cached settings snapshot. The
  // listener reads this synchronously on every request (Firefox doesn't
  // allow async listeners when using blocking / filterResponseData), so
  // keeping it fresh here covers every settings-change code path —
  // every mutation flows through broadcastSettingsToTabs.
  updateWorkerFilterSettings(settings);

  const tabs = await browser.tabs.query({});
  logger.info("Broadcasting settings to tabs:", { tabCount: tabs.length });

  const results = await Promise.all(tabs.map((tab) => sendSettingsToTab(tab, settings)));
  const failCount = results.filter((delivered) => !delivered).length;
  if (failCount > 0) {
    logger.debug("Broadcast complete:", { sent: results.length - failCount, failed: failCount });
  }
}

/**
 * Inject content script into all existing tabs that don't already have it.
 */
export async function injectContentScriptIntoExistingTabs(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});
    logger.info("Injecting content scripts into existing tabs:", { tabCount: tabs.length });

    for (const tab of tabs) {
      if (tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
        try {
          const response: unknown = await browser.tabs.sendMessage(tab.id!, { type: "PING" });
          if (response && (response as { pong?: boolean }).pong) {
            console.debug(`Content script already injected in tab ${tab.id}`);
            continue;
          }
        } catch {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              files: ["content/content.js"],
            });
            logger.debug(`Injected content script into tab ${tab.id}`);
          } catch (error) {
            logger.warn(
              `Could not inject into tab ${tab.id}:`,
              error instanceof Error ? error.message : String(error)
            );
            console.debug(
              `Could not inject into tab ${tab.id}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error("Failed to inject content scripts:", error);
  }
}

/**
 * Check if content script is injected in a specific tab.
 */
export async function checkTabInjection(tabId: number): Promise<InjectionStatus> {
  try {
    await browser.tabs.sendMessage(tabId, { type: "PING" });
    return { injected: true, error: null };
  } catch (error) {
    logger.error(`Content script not responding in tab ${tabId}:`, error);
    return { injected: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Check if a URL is a restricted page where extensions cannot run.
 */
export function isRestrictedUrl(url: string): boolean {
  if (!url) return true;

  const restrictedPrefixes = [
    "about:",
    "moz-extension:",
    "chrome:",
    "chrome-extension:",
    "edge:",
    "resource:",
    "view-source:",
    "data:",
    "blob:",
    "file:",
  ];

  const restrictedDomains = [
    "addons.mozilla.org",
    "accounts.firefox.com",
    "testpilot.firefox.com",
    "chrome.google.com",
  ];

  for (const prefix of restrictedPrefixes) {
    if (url.startsWith(prefix)) {
      return true;
    }
  }

  try {
    const urlObj = new URL(url);
    for (const domain of restrictedDomains) {
      if (urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}
