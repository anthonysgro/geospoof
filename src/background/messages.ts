/**
 * Message Handling
 * Central message router for inter-component communication.
 */

import type { LocationName } from "@/shared/types/settings";
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
} from "@/shared/types/messages";
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
        logger.info("VPN sync requested, forceRefresh:", payload?.forceRefresh ?? false);
        const result = await syncVpnLocation(payload?.forceRefresh ?? false);

        if ("error" in result) {
          logger.warn("VPN sync failed:", result);
          return result;
        }

        logger.debug("VPN sync result:", result);
        await handleSetLocation(
          { latitude: result.latitude, longitude: result.longitude },
          { fromVpnSync: true }
        );
        await updateSettings({ vpnSyncEnabled: true });

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
  options?: { fromVpnSync?: boolean }
): Promise<void> {
  const { latitude, longitude } = payload;

  logger.debug("Resolving timezone for coordinates:", { latitude, longitude });
  const timezone = await getTimezoneForCoordinates(latitude, longitude);
  logger.debug("Timezone resolved:", timezone);

  let locationName: LocationName | null = null;
  try {
    locationName = await reverseGeocode(latitude, longitude);
    logger.debug("Reverse geocode result:", locationName);
  } catch (error) {
    logger.warn("Reverse geocoding failed:", error);
  }

  const currentSettings = await loadSettings();

  // If VPN sync was active and a manual location is being set,
  // disable VPN sync and clear the IP geolocation cache (Req 9.3).
  // Skip this when the call originates from VPN sync itself.
  const vpnUpdates: Record<string, unknown> = {};
  if (currentSettings.vpnSyncEnabled && !options?.fromVpnSync) {
    await clearIpGeoCache();
    vpnUpdates.vpnSyncEnabled = false;
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
