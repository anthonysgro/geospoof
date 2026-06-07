/**
 * App → Extension bridge (Safari only)
 *
 * The native containing app writes a full "pending" desired-state snapshot into
 * the shared App Group container. The extension's JavaScript can't read that
 * container directly, so it asks the native handler (SafariWebExtensionHandler)
 * for it via browser.runtime.sendNativeMessage, and adopts it if the app acted
 * more recently than the extension's own last settings change.
 *
 * This is the inbound counterpart to the REGION_UPDATE push in settings.ts.
 */

import { createLogger } from "@/shared/utils/debug-logger";
import { loadSettings, updateSettings } from "./settings";
import {
  handleSetLocation,
  handleSetProtectionStatus,
  handleSetWebRTCProtection,
} from "./messages";
import { syncVpnLocation, clearIpGeoCache } from "./vpn-sync";
import { broadcastSettingsToTabs } from "./tabs";

const logger = createLogger("BG");

interface PendingSettings {
  updatedAt: number; // Unix seconds (Swift timeIntervalSince1970)
  enabled?: boolean;
  webrtc?: boolean;
  vpnSync?: boolean;
  cleared?: boolean;
  resync?: boolean;
  latitude?: number;
  longitude?: number;
  displayName?: string;
}

interface PendingResponse {
  pending: PendingSettings | null;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Ask the native host for the app-written desired-state snapshot and adopt it
 * if the app acted more recently than the extension's own last settings change
 * (symmetric last-writer-wins). Applies WebRTC, VPN sync, location/clear, and
 * the protection toggle. Never throws.
 */
export async function adoptPendingSettingsFromApp(): Promise<void> {
  if (!__SAFARI__) return;

  let response: PendingResponse | undefined;
  try {
    response = (await browser.runtime.sendNativeMessage("com.moonloaf.geospoof", {
      type: "GET_PENDING_SETTINGS",
    })) as PendingResponse;
  } catch (error) {
    logger.debug("adoptPendingSettingsFromApp: native message failed:", error);
    return;
  }

  const pending = response?.pending;
  if (!pending || typeof pending.updatedAt !== "number") {
    return;
  }

  const settings = await loadSettings();

  // The app writes updatedAt as Unix seconds; settings.lastUpdated is Unix ms.
  const pendingAtMs = pending.updatedAt * 1000;

  // Only adopt if the app's action is newer than the last extension change.
  if (pendingAtMs <= settings.lastUpdated) {
    return;
  }

  logger.info("Adopting pending settings from app:", pending);

  try {
    // 1. WebRTC protection — apply only when it actually differs.
    if (typeof pending.webrtc === "boolean" && pending.webrtc !== settings.webrtcProtection) {
      await handleSetWebRTCProtection({ enabled: pending.webrtc });
    }

    // 2. Location source: VPN sync, explicit clear, or a manual location.
    if (pending.vpnSync) {
      if (typeof pending.latitude === "number" && typeof pending.longitude === "number") {
        // The app already resolved the exit IP (shared device egress) — adopt
        // its coordinates as a VPN-synced location.
        const changed =
          !settings.location ||
          round4(settings.location.latitude) !== round4(pending.latitude) ||
          round4(settings.location.longitude) !== round4(pending.longitude);
        if (changed || !settings.vpnSyncEnabled) {
          await handleSetLocation(
            { latitude: pending.latitude, longitude: pending.longitude },
            {
              fromVpnSync: true,
              locationName: {
                city: "",
                country: "",
                displayName:
                  pending.displayName ||
                  `${pending.latitude.toFixed(4)}, ${pending.longitude.toFixed(4)}`,
              },
            }
          );
        }
        await updateSettings({ vpnSyncEnabled: true });
      } else {
        // No coords from the app — the extension owns IP detection + geolocation.
        const needSync = pending.resync === true || !settings.vpnSyncEnabled;
        if (needSync) {
          const result = await syncVpnLocation(true);
          if (!("error" in result)) {
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
          } else {
            logger.warn("adoptPendingSettingsFromApp: VPN sync failed:", result);
          }
        }
        await updateSettings({ vpnSyncEnabled: true });
      }
    } else if (pending.cleared) {
      if (settings.location || settings.vpnSyncEnabled) {
        if (settings.vpnSyncEnabled) await clearIpGeoCache();
        const cleared = await updateSettings({
          location: null,
          timezone: null,
          locationName: null,
          vpnSyncEnabled: false,
        });
        await broadcastSettingsToTabs(cleared);
      }
    } else if (typeof pending.latitude === "number" && typeof pending.longitude === "number") {
      // Apply only when the location actually changed (avoids a redundant
      // reverse-geocode when the app just toggled something else).
      const changed =
        !settings.location ||
        round4(settings.location.latitude) !== round4(pending.latitude) ||
        round4(settings.location.longitude) !== round4(pending.longitude);
      if (changed) {
        await handleSetLocation(
          { latitude: pending.latitude, longitude: pending.longitude },
          pending.displayName
            ? { locationName: { city: "", country: "", displayName: pending.displayName } }
            : undefined
        );
      }
    }

    // 3. Protection toggle — apply last, after location is settled.
    const current = await loadSettings();
    if (typeof pending.enabled === "boolean" && current.enabled !== pending.enabled) {
      await handleSetProtectionStatus({ enabled: pending.enabled });
    }

    logger.info("Pending settings adopted and applied.");
  } catch (error) {
    logger.error("Failed to adopt pending settings:", error);
  }
}
