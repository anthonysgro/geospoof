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
} from "@/shared/types/messages";
import { loadSettings, updateSettings } from "./settings";
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
    switch (message.type) {
      case "GET_SETTINGS": {
        const settings = await loadSettings();

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
        await handleSetLocation(message.payload as SetLocationPayload);
        return { success: true };

      case "SET_PROTECTION_STATUS":
        await handleSetProtectionStatus(message.payload as SetProtectionStatusPayload);
        return { success: true };

      case "SET_WEBRTC_PROTECTION":
        await handleSetWebRTCProtection(message.payload as SetWebRTCProtectionPayload);
        return { success: true };

      case "GEOCODE_QUERY": {
        const results = await geocodeQuery((message.payload as GeocodeQueryPayload).query);
        return { results };
      }

      case "COMPLETE_ONBOARDING":
        await handleCompleteOnboarding();
        return { success: true };

      case "SYNC_VPN": {
        const payload = message.payload as SyncVpnPayload | undefined;
        const result = await syncVpnLocation(payload?.forceRefresh ?? false);

        if ("error" in result) {
          return result;
        }

        await handleSetLocation({ latitude: result.latitude, longitude: result.longitude });
        await updateSettings({ vpnSyncEnabled: true });

        return result;
      }

      case "DISABLE_VPN_SYNC": {
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

      default:
        console.warn("Unknown message type:", message.type);
        return { error: "Unknown message type" };
    }
  } catch (error) {
    console.error("Error handling message:", error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function handleSetLocation(payload: SetLocationPayload): Promise<void> {
  const { latitude, longitude } = payload;

  const timezone = await getTimezoneForCoordinates(latitude, longitude);

  let locationName: LocationName | null = null;
  try {
    locationName = await reverseGeocode(latitude, longitude);
  } catch (error) {
    console.warn("Reverse geocoding failed:", error);
  }

  const currentSettings = await loadSettings();

  // If VPN sync was active and a manual location is being set,
  // disable VPN sync and clear the IP geolocation cache (Req 9.3)
  const vpnUpdates: Record<string, unknown> = {};
  if (currentSettings.vpnSyncEnabled) {
    await clearIpGeoCache();
    vpnUpdates.vpnSyncEnabled = false;
  }

  const settings = await updateSettings({
    location: { latitude, longitude, accuracy: 10 },
    timezone,
    locationName,
    ...vpnUpdates,
  });

  await broadcastSettingsToTabs(settings);
}

export async function handleSetProtectionStatus(
  payload: SetProtectionStatusPayload
): Promise<void> {
  const { enabled } = payload;

  const settings = await updateSettings({ enabled });

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
}

export async function handleCompleteOnboarding(): Promise<void> {
  await updateSettings({ onboardingCompleted: true });
}
