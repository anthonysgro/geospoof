/**
 * Tab Management
 * Broadcasting settings to tabs, content script injection, and URL checks.
 */

import type { Settings } from "@/shared/types/settings";
import type { UpdateSettingsPayload, InjectionStatus } from "@/shared/types/messages";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/**
 * Broadcast settings to all tabs via content scripts.
 */
export async function broadcastSettingsToTabs(settings: Settings): Promise<void> {
  const { enabled, location, timezone, debugLogging, verbosityLevel } = settings;
  const payload: UpdateSettingsPayload = {
    enabled,
    location,
    timezone,
    debugLogging,
    verbosityLevel,
  };
  const tabs = await browser.tabs.query({});

  logger.info("Broadcasting settings to tabs:", { tabCount: tabs.length, payload });

  let failCount = 0;
  const promises: Promise<void>[] = [];
  for (const tab of tabs) {
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
