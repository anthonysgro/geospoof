/**
 * Background Script — Entry Point
 * Wires up initialization, event listeners, and re-exports all modules.
 */

import type { Message, UpdateSettingsPayload } from "@/shared/types/messages";
import { loadSettings } from "./settings";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge } from "./badge";
import { broadcastSettingsToTabs, isRestrictedUrl, checkTabInjection } from "./tabs";
import { handleMessage, handleSetLocation } from "./messages";
import { syncVpnLocation } from "./vpn-sync";

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
export {
  isValidIpAddress,
  detectPublicIp,
  geolocateIp,
  syncVpnLocation,
  clearIpGeoCache,
  resetRateLimiter,
  ipGeoCache,
  MIN_REQUEST_INTERVAL,
  REQUEST_TIMEOUT,
} from "./vpn-sync";
export type { IpGeolocationResult, VpnSyncError, VpnSyncResponse } from "./vpn-sync";

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

  // Auto-sync VPN location on startup if enabled
  if (settings.vpnSyncEnabled) {
    try {
      const result = await syncVpnLocation(false);
      if (!("error" in result)) {
        await handleSetLocation({ latitude: result.latitude, longitude: result.longitude });
      }
    } catch (error) {
      console.warn("VPN auto-sync on startup failed:", error);
    }
  }
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

// Track pending injection checks per tab so we can cancel stale ones on re-navigation
const pendingChecks = new Map<number, number[]>();

export { pendingChecks };

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

          // Cancel any pending checks for this tab (re-navigation)
          const existing = pendingChecks.get(tabId);
          if (existing) {
            for (const tid of existing) {
              clearTimeout(tid);
            }
          }
          pendingChecks.delete(tabId);

          // Deferred retry with backoff: 500ms, 1000ms, 2000ms
          const delays = [500, 1000, 2000];
          const timeoutIds: number[] = [];
          let settled = false;

          for (let i = 0; i < delays.length; i++) {
            const cumulativeDelay = delays.slice(0, i + 1).reduce((a, b) => a + b, 0);
            const tid = setTimeout(() => {
              void (async () => {
                if (settled) return;

                try {
                  const result = await checkTabInjection(tabId);
                  if (result.injected) {
                    settled = true;
                    pendingChecks.delete(tabId);

                    try {
                      await browser.tabs.sendMessage(tabId, {
                        type: "UPDATE_SETTINGS",
                        payload: scopedPayload,
                      });
                    } catch {
                      // Tab may have closed; ignore
                    }

                    void browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId });
                    void browser.browserAction.setBadgeText({ text: "✓", tabId });
                  } else if (i === delays.length - 1) {
                    // Last attempt failed
                    if (!settled) {
                      settled = true;
                      pendingChecks.delete(tabId);
                      void browser.browserAction.setBadgeBackgroundColor({
                        color: "orange",
                        tabId,
                      });
                      void browser.browserAction.setBadgeText({ text: "!", tabId });
                    }
                  }
                } catch {
                  // Tab closed during retry; ignore
                  if (i === delays.length - 1 && !settled) {
                    settled = true;
                    pendingChecks.delete(tabId);
                    void browser.browserAction.setBadgeBackgroundColor({ color: "orange", tabId });
                    void browser.browserAction.setBadgeText({ text: "!", tabId });
                  }
                }
              })();
            }, cumulativeDelay) as unknown as number;

            timeoutIds.push(tid);
          }

          pendingChecks.set(tabId, timeoutIds);
        })();
      }
    }
  );
}
