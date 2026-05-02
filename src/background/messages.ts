/**
 * Message Handling
 * Central message router for inter-component communication.
 */

import type {
  Message,
  SetLocationPayload,
  SetProtectionStatusPayload,
  SetWebRTCProtectionPayload,
  GeocodeQueryPayload,
  CheckTabInjectionPayload,
  SyncVpnPayload,
  SetDebugLoggingPayload,
  SetVerbosityLevelPayload,
  SetThemePayload,
} from "@/shared/types/messages";
import type { LocationName } from "@/shared/types/settings";
import { setDebugEnabled, setVerbosityLevel, createLogger } from "@/shared/utils/debug-logger";
import { loadSettings, updateSettings } from "./settings";

const logger = createLogger("BG");

import { geocodeQuery, reverseGeocode } from "./geocoding";
import { getTimezoneForCoordinates } from "./timezone";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge } from "./badge";
import {
  broadcastSettingsToTabs,
  injectContentScriptIntoExistingTabs,
  checkTabInjection,
  isRestrictedUrl,
} from "./tabs";
import { syncVpnLocation, clearIpGeoCache } from "./vpn-sync";

export async function handleMessage(
  message: Message,
  _sender: browser.runtime.MessageSender
): Promise<unknown> {
  console.log("[MSG-HANDLER] Received message:", message.type);
  try {
    logger.info("Received message:", message.type, message.payload);

    switch (message.type) {
      case "GET_SETTINGS": {
        const settings = await loadSettings();
        logger.debug("Loaded settings:", settings);

        // Badge recovery: when a content script sends GET_SETTINGS, it confirms
        // it is alive. Update the badge to green if protection is enabled and
        // the tab URL is not restricted.
        const senderTabId = _sender.tab?.id;
        const senderTabUrl = _sender.tab?.url;
        if (senderTabId != null && settings.enabled && !isRestrictedUrl(senderTabUrl ?? "")) {
          void browser.action.setBadgeBackgroundColor({
            color: "green",
            tabId: senderTabId,
          });
          void browser.action.setBadgeText({ text: "✓", tabId: senderTabId });
        }

        return settings;
      }

      case "SET_LOCATION":
        logger.debug("Setting location:", message.payload);
        await handleSetLocation(message.payload as SetLocationPayload);
        return { success: true };

      case "SET_PROTECTION_STATUS":
        logger.debug("Setting protection status:", message.payload);
        await handleSetProtectionStatus(message.payload as SetProtectionStatusPayload);
        return { success: true };

      case "SET_WEBRTC_PROTECTION":
        logger.debug("Setting WebRTC protection:", message.payload);
        await handleSetWebRTCProtection(message.payload as SetWebRTCProtectionPayload);
        return { success: true };

      case "GEOCODE_QUERY": {
        const results = await geocodeQuery((message.payload as GeocodeQueryPayload).query);
        logger.debug("Geocode results:", results);
        return { results };
      }

      case "COMPLETE_ONBOARDING":
        await handleCompleteOnboarding();
        return { success: true };

      case "SYNC_VPN": {
        const payload = message.payload as SyncVpnPayload | undefined;
        const syncMsgStart = Date.now();
        logger.info("[MSG] SYNC_VPN received, forceRefresh:", payload?.forceRefresh ?? false);
        const result = await syncVpnLocation(payload?.forceRefresh ?? false);

        if ("error" in result) {
          logger.warn("[MSG] SYNC_VPN failed after", Date.now() - syncMsgStart, "ms:", result);
          return result;
        }

        logger.debug("[MSG] SYNC_VPN result:", result);
        const setLocStart = Date.now();
        // Pass city/country from freeipapi directly — no need for separate Nominatim call
        await handleSetLocation(
          { latitude: result.latitude, longitude: result.longitude },
          {
            fromVpnSync: true,
            locationName: {
              city: result.city,
              country: result.country,
              displayName:
                result.city && result.country
                  ? `${result.city}, ${result.country}`
                  : result.city ||
                    result.country ||
                    `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`,
            },
          }
        );
        logger.debug("[MSG] handleSetLocation completed in", Date.now() - setLocStart, "ms");
        await updateSettings({ vpnSyncEnabled: true });

        logger.info("[MSG] SYNC_VPN total time:", Date.now() - syncMsgStart, "ms");
        return result;
      }

      case "DISABLE_VPN_SYNC": {
        logger.info("Disabling VPN sync");
        await clearIpGeoCache();
        await updateSettings({
          vpnSyncEnabled: false,
          location: null,
          timezone: null,
          locationName: null,
        });
        const disabledSettings = await loadSettings();
        await broadcastSettingsToTabs(disabledSettings);
        return { success: true };
      }

      case "CLEAR_LOCATION": {
        logger.info("Clearing location");
        const clearedSettings = await updateSettings({
          location: null,
          timezone: null,
          locationName: null,
        });
        await broadcastSettingsToTabs(clearedSettings);
        return { success: true };
      }

      case "CHECK_TAB_INJECTION": {
        const injectionStatus = await checkTabInjection(
          (message.payload as CheckTabInjectionPayload).tabId
        );
        return injectionStatus;
      }

      case "SET_DEBUG_LOGGING": {
        const { enabled } = message.payload as SetDebugLoggingPayload;
        const beforeSettings = await loadSettings();
        const settings = await updateSettings({ debugLogging: enabled });
        setDebugEnabled(enabled);
        logger.debug("Debug logging toggled:", {
          before: beforeSettings.debugLogging,
          after: enabled,
        });
        await broadcastSettingsToTabs(settings);
        return { success: true };
      }

      case "SET_VERBOSITY_LEVEL": {
        const { level } = message.payload as SetVerbosityLevelPayload;
        setVerbosityLevel(level);
        const settings = await updateSettings({ verbosityLevel: level });
        await broadcastSettingsToTabs(settings);
        return { success: true };
      }

      case "SET_THEME": {
        const { theme } = message.payload as SetThemePayload;
        await updateSettings({ theme });
        return { success: true };
      }

      default:
        logger.warn("Unknown message type:", message.type);
        return { error: "Unknown message type" };
    }
  } catch (error) {
    logger.error("Error handling message:", error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function handleSetLocation(
  payload: SetLocationPayload,
  options?: { fromVpnSync?: boolean; locationName?: LocationName }
): Promise<void> {
  const { latitude, longitude } = payload;

  logger.debug("Resolving timezone for coordinates:", { latitude, longitude });
  const timezone = await getTimezoneForCoordinates(latitude, longitude);
  logger.debug("Timezone resolved:", timezone);

  const currentSettings = await loadSettings();

  // If VPN sync was active and a manual location is being set,
  // disable VPN sync and clear the IP geolocation cache (Req 9.3).
  // Skip this when the call originates from VPN sync itself.
  const vpnUpdates: Record<string, unknown> = {};
  if (currentSettings.vpnSyncEnabled && !options?.fromVpnSync) {
    await clearIpGeoCache();
    vpnUpdates.vpnSyncEnabled = false;
  }

  // If locationName was provided (e.g., from VPN sync), use it directly
  if (options?.locationName) {
    const settings = await updateSettings({
      location: { latitude, longitude, accuracy: 10 },
      timezone,
      locationName: options.locationName,
      ...vpnUpdates,
    });
    logger.debug("Settings updated with provided locationName:", settings);
    await broadcastSettingsToTabs(settings);
    return;
  }

  // Reverse geocode to get the location name (blocking so popup shows it immediately)
  let locationName = null;
  try {
    locationName = await reverseGeocode(latitude, longitude);
    logger.debug("Reverse geocode result:", locationName);
  } catch (error) {
    logger.warn("Reverse geocoding failed:", error);
  }

  const settings = await updateSettings({
    location: { latitude, longitude, accuracy: 10 },
    timezone,
    locationName,
    ...vpnUpdates,
  });

  logger.debug("Settings updated after SET_LOCATION:", settings);
  await broadcastSettingsToTabs(settings);
}

export async function handleSetProtectionStatus(
  payload: SetProtectionStatusPayload
): Promise<void> {
  const { enabled } = payload;

  const settings = await updateSettings({ enabled });
  logger.info("Protection status updated:", { enabled });

  await updateBadge(enabled);

  if (enabled) {
    await injectContentScriptIntoExistingTabs();
  } else {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      void browser.action.setBadgeBackgroundColor({ color: "gray", tabId: tab.id });
      void browser.action.setBadgeText({ text: "", tabId: tab.id });
    }
  }

  await broadcastSettingsToTabs(settings);
}

export async function handleSetWebRTCProtection(
  payload: SetWebRTCProtectionPayload
): Promise<void> {
  const { enabled } = payload;

  await setWebRTCProtection(enabled);
  await updateSettings({ webrtcProtection: enabled });
  logger.info("WebRTC protection updated:", { enabled });
}

export async function handleCompleteOnboarding(): Promise<void> {
  await updateSettings({ onboardingCompleted: true });
  logger.info("Onboarding completed");
}
