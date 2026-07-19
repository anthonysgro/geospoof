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
import type { Favorite, ScopeMode, Settings } from "@/shared/types/settings";
import { parsePattern } from "@/shared/utils/scope";
import { loadSettings, updateSettings, validateAccuracySetting } from "./settings";
import {
  handleSetLocation,
  handleSetProtectionStatus,
  handleSetWebRTCProtection,
  handleSetPreserveGeoPrompt,
} from "./messages";
import { syncVpnLocation, clearIpGeoCache } from "./vpn-sync";
import { broadcastSettingsToTabs } from "./tabs";
import { updateBadge } from "./badge";

const logger = createLogger("BG");

interface PendingSettings {
  updatedAt: number; // Unix seconds (Swift timeIntervalSince1970)
  enabled?: boolean;
  webrtc?: boolean;
  /**
   * App→extension "preserve location prompts" preference. A plain bool bridged
   * like `webrtc`. Adopted into settings.preserveGeolocationPrompt. Pro-gated on
   * iOS, but the background tab-payload gate independently forces the free
   * behavior for non-Pro users, so adopting the raw preference here is safe.
   */
  preservePrompt?: boolean;
  vpnSync?: boolean;
  cleared?: boolean;
  resync?: boolean;
  /**
   * App→extension gate: true when the iOS app says this user isn't entitled to
   * automatic background sync (non-Pro or toggle off). Adopted into
   * settings.autoSyncBlocked. Absent/false = allowed (fail-open).
   */
  autoSyncBlocked?: boolean;
  /**
   * App→extension gate: true when the iOS app says Pro-only config features
   * (per-site filtering, custom accuracy) aren't allowed (non-Pro). Adopted
   * into settings.proFeaturesBlocked. Absent/false = allowed (fail-open).
   */
  proFeaturesBlocked?: boolean;
  latitude?: number;
  longitude?: number;
  displayName?: string;
  /**
   * IANA timezone id the app already resolved for these coordinates (e.g.
   * "Asia/Tashkent"). Forwarded as the timezoneHint so the extension doesn't
   * have to re-resolve from coordinates — that offline lookup can fail (CDN
   * range hiccup) and fall back to null, which would leave the page leaking the
   * real zone even though the app knew the right one.
   */
  timezone?: string;
  favorites?: string; // JSON-encoded Favorite[] from the app
  scopeMode?: string; // "all" | "allowlist" | "denylist"
  allowlist?: string; // JSON-encoded string[] from the app
  denylist?: string; // JSON-encoded string[] from the app
  accuracySetting?: string; // JSON-encoded AccuracySetting from the app (accuracySeed stays extension-owned)
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

    // 1a. "Preserve location prompts" — plain bool, adopt only when it differs.
    // handleSetPreserveGeoPrompt persists + re-broadcasts (the broadcast's
    // Pro-gate forces the free behavior for a non-Pro user regardless).
    if (
      typeof pending.preservePrompt === "boolean" &&
      pending.preservePrompt !== settings.preserveGeolocationPrompt
    ) {
      await handleSetPreserveGeoPrompt({ enabled: pending.preservePrompt });
    }

    // 1b. Automatic-background-sync gate. The app is the authority on iOS Pro
    // entitlement (the extension can't tell iOS from macOS), so adopt its
    // autoSyncBlocked signal whenever it differs. Cheap settings write; takes
    // effect on the next resync trigger / startup.
    if (typeof pending.autoSyncBlocked === "boolean") {
      const latest = await loadSettings();
      if (latest.autoSyncBlocked !== pending.autoSyncBlocked) {
        await updateSettings({ autoSyncBlocked: pending.autoSyncBlocked });
      }
    }

    // 1c. Pro-only config gate (per-site filtering, custom accuracy). Same
    // app-as-authority rationale as 1b.
    if (typeof pending.proFeaturesBlocked === "boolean") {
      const latest = await loadSettings();
      if (latest.proFeaturesBlocked !== pending.proFeaturesBlocked) {
        await updateSettings({ proFeaturesBlocked: pending.proFeaturesBlocked });
      }
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
              timezoneHint: pending.timezone,
              locationName: {
                city: "",
                country: "",
                displayName:
                  pending.displayName ||
                  `${pending.latitude.toFixed(5)}, ${pending.longitude.toFixed(5)}`,
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
                        `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`,
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
          {
            timezoneHint: pending.timezone,
            ...(pending.displayName
              ? { locationName: { city: "", country: "", displayName: pending.displayName } }
              : {}),
          }
        );
      }
    }

    // 3. Protection toggle — apply last, after location is settled.
    const current = await loadSettings();
    if (typeof pending.enabled === "boolean" && current.enabled !== pending.enabled) {
      await handleSetProtectionStatus({ enabled: pending.enabled });
    }

    // 4. Favorites — adopt the app's list when it differs. The app and
    // extension reconcile last-writer-wins by the pending/region timestamp,
    // same as every other field. (Concurrent edits on both sides resolve to
    // whichever wrote most recently — the whole list, not a per-item merge.)
    if (typeof pending.favorites === "string") {
      try {
        const parsed = JSON.parse(pending.favorites) as Favorite[];
        if (Array.isArray(parsed)) {
          const latest = await loadSettings();
          const next = parsed.slice(0, 10);
          if (JSON.stringify(latest.favorites) !== JSON.stringify(next)) {
            await updateSettings({ favorites: next });
          }
        }
      } catch (error) {
        logger.debug("adoptPendingSettingsFromApp: favorites parse failed:", error);
      }
    }

    // 5. Site-scoping — adopt the mode and the allow/deny lists when present
    // and changed. Entries are parsed as glob-style URL patterns + de-duplicated
    // here so the extension stays the source of truth for list hygiene
    // regardless of what the app stored, and so advanced patterns (wildcards,
    // ports, paths) survive the app→extension round-trip. A scope change
    // re-broadcasts per-tab and re-badges so open tabs and the toolbar reflect
    // the new decision without a manual reload.
    const scopeUpdates: Partial<Settings> = {};
    const VALID_SCOPE_MODES = new Set<ScopeMode>(["all", "allowlist", "denylist"]);
    const latestForScope = await loadSettings();

    if (
      typeof pending.scopeMode === "string" &&
      VALID_SCOPE_MODES.has(pending.scopeMode as ScopeMode) &&
      pending.scopeMode !== latestForScope.scopeMode
    ) {
      scopeUpdates.scopeMode = pending.scopeMode as ScopeMode;
    }

    const parsePatternList = (json: string | undefined): string[] | undefined => {
      if (typeof json !== "string") return undefined;
      let arr: unknown;
      try {
        arr = JSON.parse(json);
      } catch {
        return undefined;
      }
      if (!Array.isArray(arr)) return undefined;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const entry of arr) {
        if (typeof entry !== "string") continue;
        const canonical = parsePattern(entry);
        if (canonical !== null && !seen.has(canonical)) {
          seen.add(canonical);
          out.push(canonical);
        }
      }
      return out;
    };

    const adoptedAllow = parsePatternList(pending.allowlist);
    if (adoptedAllow && JSON.stringify(adoptedAllow) !== JSON.stringify(latestForScope.allowlist)) {
      scopeUpdates.allowlist = adoptedAllow;
    }
    const adoptedDeny = parsePatternList(pending.denylist);
    if (adoptedDeny && JSON.stringify(adoptedDeny) !== JSON.stringify(latestForScope.denylist)) {
      scopeUpdates.denylist = adoptedDeny;
    }

    if (Object.keys(scopeUpdates).length > 0) {
      const updated = await updateSettings(scopeUpdates);
      await broadcastSettingsToTabs(updated);
      await updateBadge();
    }

    // 6. Accuracy setting — adopt the app's value when present and changed.
    // Rides as a JSON string like favorites/allow-deny; validated through the
    // same repair function the SET_ACCURACY handler uses so the extension stays
    // the source of truth for shape/range hygiene. accuracySeed is NOT bridged
    // (per-install, extension-owned).
    if (typeof pending.accuracySetting === "string") {
      try {
        const parsedAccuracy: unknown = JSON.parse(pending.accuracySetting);
        const validatedAccuracy = validateAccuracySetting(parsedAccuracy);
        const latestForAccuracy = await loadSettings();
        if (
          JSON.stringify(validatedAccuracy) !== JSON.stringify(latestForAccuracy.accuracySetting)
        ) {
          const updated = await updateSettings({ accuracySetting: validatedAccuracy });
          await broadcastSettingsToTabs(updated);
        }
      } catch (error) {
        logger.debug("adoptPendingSettingsFromApp: accuracySetting parse failed:", error);
      }
    }

    logger.info("Pending settings adopted and applied.");
  } catch (error) {
    logger.error("Failed to adopt pending settings:", error);
  }
}
