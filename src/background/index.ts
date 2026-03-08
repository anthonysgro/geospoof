/**
 * Background Script — Entry Point
 * Wires up initialization, event listeners, and re-exports all modules.
 */

import type { Message, UpdateSettingsPayload } from "@/shared/types/messages";
import { loadSettings } from "./settings";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge } from "./badge";
import { broadcastSettingsToTabs, isRestrictedUrl } from "./tabs";
import { handleMessage } from "./messages";

// Re-export everything so `import("@/background")` keeps working for tests
export { DEFAULT_SETTINGS } from "@/shared/types/settings";
export { isValidIANATimezone } from "@/shared/utils/type-guards";
export {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  validateSettings,
} from "./settings";
export {
  geocodeQuery,
  reverseGeocode,
  fetchWithRetry,
  getCacheKey,
  GEOCODING_TIMEOUT,
  MAX_RETRIES,
} from "./geocoding";
export { getTimezoneForCoordinates, clearTimezoneCache, computeOffsets } from "./timezone";
export { setWebRTCProtection } from "./webrtc";
export { updateBadge } from "./badge";
export { broadcastSettingsToTabs, isRestrictedUrl, checkTabInjection } from "./tabs";
export {
  handleMessage,
  handleSetLocation,
  handleSetProtectionStatus,
  handleSetWebRTCProtection,
  handleCompleteOnboarding,
} from "./messages";

// --- Initialization ---

async function initialize(): Promise<void> {
  const settings = await loadSettings();

  if (settings.webrtcProtection) {
    try {
      await setWebRTCProtection(true);
    } catch (error) {
      console.error("Failed to apply WebRTC protection on startup:", error);
    }
  }

  if (settings.enabled && settings.location) {
    await broadcastSettingsToTabs(settings);
  }

  await updateBadge(settings.enabled);
}

export { initialize };

// --- Event Listeners ---

browser.runtime.onMessage.addListener((message: Message, sender: browser.runtime.MessageSender) => {
  return handleMessage(message, sender);
});

browser.runtime.onInstalled.addListener((details: browser.runtime._OnInstalledDetails) => {
  if (details.reason === "install") {
    console.log("Extension installed - onboarding will be displayed");
  }
  void initialize();
});

void initialize();

if (browser.tabs && browser.tabs.onCreated) {
  browser.tabs.onCreated.addListener((tab: browser.tabs.Tab) => {
    void (async () => {
      const settings = await loadSettings();
      const { enabled, location, timezone } = settings;
      const scopedPayload: UpdateSettingsPayload = { enabled, location, timezone };

      setTimeout(() => {
        void (async () => {
          try {
            await browser.tabs.sendMessage(tab.id!, {
              type: "UPDATE_SETTINGS",
              payload: scopedPayload,
            });
          } catch (error) {
            console.debug(`Could not send settings to new tab ${tab.id}:`, error);
          }
        })();
      }, 100);
    })();
  });
}

if (browser.tabs && browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: browser.tabs._OnUpdatedChangeInfo, tab: browser.tabs.Tab) => {
      if (changeInfo.status === "loading") {
        void (async () => {
          const settings = await loadSettings();
          const { enabled, location, timezone } = settings;
          const scopedPayload: UpdateSettingsPayload = { enabled, location, timezone };

          const isRestricted = isRestrictedUrl(tab.url!);

          if (!settings.enabled) {
            void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.browserAction.setBadgeText({ text: "", tabId });
            return;
          }

          if (isRestricted) {
            void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.browserAction.setBadgeText({ text: "", tabId });
            return;
          }

          try {
            await browser.tabs.sendMessage(tabId, {
              type: "UPDATE_SETTINGS",
              payload: scopedPayload,
            });

            void browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId });
            void browser.browserAction.setBadgeText({ text: "✓", tabId });
          } catch (error) {
            console.debug(`Could not send settings to updated tab ${tabId}:`, error);

            if (settings.enabled && changeInfo.status === "loading") {
              console.error(
                `Content script injection may have failed for tab ${tabId} (${tab.url}):`,
                error
              );

              void browser.browserAction.setBadgeBackgroundColor({ color: "orange", tabId });
              void browser.browserAction.setBadgeText({ text: "!", tabId });
            }
          }
        })();
      }
    }
  );
}
