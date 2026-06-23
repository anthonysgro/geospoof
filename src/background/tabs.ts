/**
 * Tab Management
 * Broadcasting settings to tabs, content script injection, and URL checks.
 */

import type { Settings } from "@/shared/types/settings";
import type { UpdateSettingsPayload, InjectionStatus } from "@/shared/types/messages";
import { createLogger } from "@/shared/utils/debug-logger";
import { computeEffectiveEnabled } from "@/shared/utils/scope";
import { computeEffectiveAccuracySetting } from "@/shared/accuracy/resolver";
import { updateWorkerFilterSettings } from "./worker-request-filter";

const logger = createLogger("BG");

/**
 * Broadcast settings to all tabs via content scripts.
 *
 * The background is the sole gatekeeper for the per-tab spoofing decision: the
 * `enabled` field delivered to a tab is that tab's `Effective_Enabled` value,
 * computed from its top-level URL via the shared `computeEffectiveEnabled`
 * source of truth (Req 8.1, 8.2). The non-scope fields (location, timezone,
 * debug logging, verbosity, WebRTC protection) are identical across tabs and
 * equal to the persisted Settings (Req 8.3). The allowlist/denylist arrays are
 * never included in any page-bound payload — the payload type structurally has
 * no list keys, so the lists cannot leak (privacy invariant). A single value
 * per tab is sent; `tabs.sendMessage` fans it out to every frame (Req 7.2).
 */
export async function broadcastSettingsToTabs(settings: Settings): Promise<void> {
  // Refresh the webRequest listener's cached settings snapshot. The
  // listener reads this synchronously on every request (Firefox doesn't
  // allow async listeners when using blocking / filterResponseData), so
  // keeping it fresh here covers every settings-change code path —
  // every mutation flows through broadcastSettingsToTabs.
  updateWorkerFilterSettings(settings);

  const {
    location,
    timezone,
    debugLogging,
    verbosityLevel,
    webrtcProtection,
    accuracySetting,
    accuracySeed,
  } = settings;
  const tabs = await browser.tabs.query({});

  logger.info("Broadcasting settings to tabs:", { tabCount: tabs.length });

  let failCount = 0;
  const promises: Promise<void>[] = [];
  for (const tab of tabs) {
    // Resolve Effective_Enabled separately for each open tab against that
    // tab's top-level URL (Req 8.1, 8.2). Restricted or undeterminable URLs
    // resolve to false inside computeEffectiveEnabled (Req 8.6).
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
      location,
      timezone: debuggerActive ? null : timezone,
      debugLogging,
      verbosityLevel,
      webrtcProtection,
      // Custom accuracy is Pro-gated on iOS Safari: force Realistic ("auto")
      // for a free user so the page can't receive a pinned accuracy. Fail-open
      // + Safari-only (no effect on macOS / Chrome / Firefox).
      accuracySetting: computeEffectiveAccuracySetting(
        accuracySetting,
        settings.proFeaturesBlocked
      ),
      accuracySeed,
    };

    const promise = browser.tabs
      .sendMessage(tab.id!, {
        type: "UPDATE_SETTINGS",
        payload,
      })
      .catch((error: Error) => {
        failCount++;
        logger.warn(`Failed to send to tab ${tab.id} (${tab.url}):`, error.message);
        console.debug(`Could not send message to tab ${tab.id} (${tab.url}):`, error.message);
      });

    promises.push(promise as Promise<void>);
  }

  await Promise.all(promises);
  if (failCount > 0) {
    logger.debug("Broadcast complete:", { sent: tabs.length - failCount, failed: failCount });
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
