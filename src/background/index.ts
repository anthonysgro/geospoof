/**
 * Background Script — Entry Point
 * Wires up initialization, event listeners, and re-exports all modules.
 *
 * MV3 event-page lifecycle: all listeners registered synchronously at the
 * top level; initialization runs inside onInstalled / onStartup callbacks.
 * Timer-based retry logic uses browser.alarms instead of setTimeout.
 */

import type { Runtime, Tabs, Alarms } from "webextension-polyfill";
import type { Message, UpdateSettingsPayload } from "@/shared/types/messages";
import { loadSettings } from "./settings";
import { setDebugEnabled, setVerbosityLevel, createLogger } from "@/shared/utils/debug-logger";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge } from "./badge";
import { broadcastSettingsToTabs, isRestrictedUrl, checkTabInjection } from "./tabs";
import { handleMessage, handleSetLocation } from "./messages";
import { syncVpnLocation } from "./vpn-sync";

const logger = createLogger("BG");

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
  syncVpnLocation,
  clearIpGeoCache,
  resetRateLimiter,
  MIN_REQUEST_INTERVAL,
  REQUEST_TIMEOUT,
} from "./vpn-sync";
export type { IpGeolocationResult, VpnSyncError, VpnSyncResponse } from "./vpn-sync";

// --- Alarm constants ---

/** Prefix for injection-check alarm names */
const ALARM_PREFIX = "injection-check:";

/** Cumulative delays (ms) for injection check retries */
const ALARM_DELAYS = [500, 1500, 3500];

/** Maximum attempt index (0-based) */
const MAX_ATTEMPT = ALARM_DELAYS.length - 1;

export { ALARM_PREFIX, ALARM_DELAYS, MAX_ATTEMPT };

// --- Alarm helpers ---

/**
 * Build an alarm name encoding tab ID and attempt number.
 */
export function buildAlarmName(tabId: number, attempt: number): string {
  return `${ALARM_PREFIX}${tabId}:${attempt}`;
}

/**
 * Parse an injection-check alarm name. Returns null if the name doesn't match.
 */
export function parseAlarmName(name: string): { tabId: number; attempt: number } | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  const rest = name.slice(ALARM_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const tabId = parseInt(parts[0], 10);
  const attempt = parseInt(parts[1], 10);
  if (isNaN(tabId) || isNaN(attempt)) return null;
  return { tabId, attempt };
}

/**
 * Clear all pending injection-check alarms for a given tab.
 */
async function clearAlarmsForTab(tabId: number): Promise<void> {
  for (let i = 0; i <= MAX_ATTEMPT; i++) {
    try {
      await browser.alarms.clear(buildAlarmName(tabId, i));
    } catch {
      // Alarm may not exist; ignore
    }
  }
}

export { clearAlarmsForTab };

// --- Initialization ---

async function initialize(): Promise<void> {
  const settings = await loadSettings();

  // Restore logger state from persisted settings
  setDebugEnabled(settings.debugLogging);
  setVerbosityLevel(settings.verbosityLevel);

  if (settings.webrtcProtection) {
    try {
      await setWebRTCProtection(true);
    } catch (error) {
      logger.error("Failed to apply WebRTC protection on startup:", error);
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
        await handleSetLocation(
          { latitude: result.latitude, longitude: result.longitude },
          { fromVpnSync: true }
        );
      }
    } catch (error) {
      logger.warn("VPN auto-sync on startup failed:", error);
    }
  }
}

export { initialize };

// --- Alarm handler ---

async function onAlarm(alarm: Alarms.Alarm): Promise<void> {
  const parsed = parseAlarmName(alarm.name);
  if (!parsed) return;

  const { tabId, attempt } = parsed;

  const settings = await loadSettings();
  const { enabled, location, timezone, debugLogging, verbosityLevel } = settings;
  const scopedPayload: UpdateSettingsPayload = {
    enabled,
    location,
    timezone,
    debugLogging,
    verbosityLevel,
  };

  try {
    const result = await checkTabInjection(tabId);
    if (result.injected) {
      // Clear remaining alarms for this tab
      await clearAlarmsForTab(tabId);

      try {
        await browser.tabs.sendMessage(tabId, {
          type: "UPDATE_SETTINGS",
          payload: scopedPayload,
        });
      } catch {
        // Tab may have closed; ignore
      }

      void browser.action.setBadgeBackgroundColor({ color: "green", tabId });
      void browser.action.setBadgeText({ text: "✓", tabId });
    } else if (attempt >= MAX_ATTEMPT) {
      // Final attempt failed
      void browser.action.setBadgeBackgroundColor({ color: "orange", tabId });
      void browser.action.setBadgeText({ text: "!", tabId });
    }
  } catch {
    // Tab closed during check
    if (attempt >= MAX_ATTEMPT) {
      void browser.action.setBadgeBackgroundColor({ color: "orange", tabId });
      void browser.action.setBadgeText({ text: "!", tabId });
    }
  }
}

export { onAlarm };

// --- Event Listeners (registered synchronously at top level) ---

browser.runtime.onMessage.addListener((message: Message, sender: Runtime.MessageSender) => {
  return handleMessage(message, sender);
});

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  if (details.reason === "install") {
    console.log("Extension installed - onboarding will be displayed");
  }
  void initialize();
});

browser.runtime.onStartup.addListener(() => {
  void initialize();
});

browser.alarms.onAlarm.addListener((alarm: Alarms.Alarm) => {
  void onAlarm(alarm);
});

if (browser.tabs && browser.tabs.onCreated) {
  browser.tabs.onCreated.addListener((tab: Tabs.Tab) => {
    void (async () => {
      const settings = await loadSettings();
      const { enabled, location, timezone, debugLogging, verbosityLevel } = settings;
      const scopedPayload: UpdateSettingsPayload = {
        enabled,
        location,
        timezone,
        debugLogging,
        verbosityLevel,
      };

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
    (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
      if (changeInfo.status === "loading") {
        void (async () => {
          const settings = await loadSettings();

          if (!settings.enabled) {
            void browser.action.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.action.setBadgeText({ text: "", tabId });
            return;
          }

          const isRestricted = isRestrictedUrl(tab.url!);
          if (isRestricted) {
            void browser.action.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.action.setBadgeText({ text: "", tabId });
            return;
          }

          // Clear existing alarms for this tab (re-navigation cleanup)
          await clearAlarmsForTab(tabId);

          // Schedule injection checks via browser.alarms
          for (let i = 0; i < ALARM_DELAYS.length; i++) {
            try {
              void browser.alarms.create(buildAlarmName(tabId, i), {
                delayInMinutes: ALARM_DELAYS[i] / 60000,
              });
            } catch (error) {
              console.debug(`Failed to create alarm for tab ${tabId} attempt ${i}:`, error);
            }
          }
        })();
      }
    }
  );
}
