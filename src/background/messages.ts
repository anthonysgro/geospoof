/**
 * Message Handling
 * Central message router for inter-component communication.
 */

import type {
  Message,
  SetLocationPayload,
  SetProtectionStatusPayload,
  SetWebRTCProtectionPayload,
  AnnounceWorkerFetchPayload,
  GeocodeQueryPayload,
  CheckTabInjectionPayload,
  SyncVpnPayload,
  SetDebugLoggingPayload,
  SetVerbosityLevelPayload,
  SetThemePayload,
  SaveFavoritePayload,
  RemoveFavoritePayload,
  RenameFavoritePayload,
  FavoriteResponse,
  UpdateSettingsPayload,
  SetScopeModePayload,
  ScopeSitePayload,
  ScopeResponse,
} from "@/shared/types/messages";
import type { LocationName } from "@/shared/types/settings";
import { setDebugEnabled, setVerbosityLevel, createLogger } from "@/shared/utils/debug-logger";
import { computeEffectiveEnabled, normalizeDomain } from "@/shared/utils/scope";
import { loadSettings, updateSettings } from "./settings";

const logger = createLogger("BG");

import { geocodeQuery, reverseGeocode } from "./geocoding";
import { getTimezoneForCoordinates } from "./timezone";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge, setBadgeForTab, badgeStateFor } from "./badge";
import {
  broadcastSettingsToTabs,
  injectContentScriptIntoExistingTabs,
  checkTabInjection,
  isRestrictedUrl,
} from "./tabs";
import { syncVpnLocation, clearIpGeoCache, clearEndpointCooldowns } from "./vpn-sync";
import { adoptPendingSettingsFromApp } from "./app-bridge";
import { allowlistWorkerUrl, isSameOriginWorker, tabPageUrlCache } from "./worker-request-filter";

export async function handleMessage(
  message: Message,
  _sender: browser.runtime.MessageSender
): Promise<unknown> {
  try {
    logger.info("Received message:", message.type, message.payload);

    switch (message.type) {
      case "GET_SETTINGS": {
        // Popup branch (no sender.tab): return the full Settings object so the
        // popup can render the selected scope mode and both site lists
        // (Req 13.2). Content-script branch returns a scoped, list-free payload.
        if (_sender.tab == null) {
          // Safari: adopt the app's pending snapshot first so the popup
          // reflects what the user set in the containing app — without it the
          // popup can show stale "off" state until a tab event triggers
          // adoption. Scoped to popup-originated messages so content scripts
          // don't incur a native round-trip per page.
          if (__SAFARI__) {
            await adoptPendingSettingsFromApp();
          }

          const settings = await loadSettings();
          logger.debug("Loaded settings (popup):", settings);
          return settings;
        }

        // Content-script branch: the Background is the sole gatekeeper. It
        // resolves Effective_Enabled for the requesting tab's top-level URL via
        // the shared source of truth and returns a payload typed as
        // UpdateSettingsPayload, which structurally has NO allowlist/denylist
        // keys — the lists cannot leak into a page (Req 6.6, 6.7, 8.5, 8.7).
        const settings = await loadSettings();
        logger.debug("Loaded settings (content script):", settings);

        const senderTabId = _sender.tab.id;
        const senderTabUrl = _sender.tab.url;

        // Effective_Enabled resolves to false when the URL is missing,
        // unparseable, restricted, or out of scope (Req 8.7).
        const effectiveEnabled = computeEffectiveEnabled({
          masterEnabled: settings.enabled,
          scopeMode: settings.scopeMode,
          allowlist: settings.allowlist,
          denylist: settings.denylist,
          topLevelUrl: senderTabUrl,
          isRestricted: isRestrictedUrl,
        });

        // Badge recovery: a content-script GET_SETTINGS confirms the script is
        // alive. Reflect the per-tab decision via the shared three-state badge
        // mapping using the already-computed Effective_Enabled (Req 12.1–12.3).
        if (senderTabId != null) {
          setBadgeForTab(senderTabId, badgeStateFor(settings.enabled, effectiveEnabled));
        }

        const scoped: UpdateSettingsPayload = {
          enabled: effectiveEnabled,
          location: settings.location,
          timezone: settings.timezone,
          debugLogging: settings.debugLogging,
          verbosityLevel: settings.verbosityLevel,
          webrtcProtection: settings.webrtcProtection,
        };
        return scoped;
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

      case "ANNOUNCE_WORKER_FETCH": {
        const payload = message.payload as AnnounceWorkerFetchPayload;
        if (typeof payload?.url === "string") {
          const tabId = _sender.tab?.id;
          const tabPageUrl = tabId != null ? tabPageUrlCache.get(tabId) : undefined;
          // Only allowlist same-origin workers — cross-origin workers
          // (e.g. Cloudflare Turnstile, Stripe) must not be patched.
          if (isSameOriginWorker(payload.url, tabPageUrl)) {
            allowlistWorkerUrl(payload.url);
          }
        }
        // Fire-and-forget — the content script doesn't await the result
        // because blocking the worker construction on a background
        // round-trip would regress cold-start performance.
        return { success: true };
      }

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
        // User-initiated sync: give every endpoint a fresh shot by dropping any
        // per-endpoint cooldowns parked by the automatic path.
        clearEndpointCooldowns();
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
            timezoneHint: result.timezone,
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

      case "SAVE_FAVORITE":
        return await handleSaveFavorite(message.payload as SaveFavoritePayload);

      case "REMOVE_FAVORITE":
        return await handleRemoveFavorite(message.payload as RemoveFavoritePayload);

      case "RENAME_FAVORITE":
        return await handleRenameFavorite(message.payload as RenameFavoritePayload);

      case "SET_SCOPE_MODE":
        return await handleSetScopeMode(message.payload as SetScopeModePayload);

      case "ADD_SCOPE_SITE":
        return await handleAddScopeSite(message.payload as ScopeSitePayload);

      case "REMOVE_SCOPE_SITE":
        return await handleRemoveScopeSite(message.payload as ScopeSitePayload);

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
  options?: { fromVpnSync?: boolean; locationName?: LocationName; timezoneHint?: string }
): Promise<void> {
  const { latitude, longitude } = payload;

  logger.debug("Resolving timezone for coordinates:", { latitude, longitude });
  const timezone = await getTimezoneForCoordinates(latitude, longitude, options?.timezoneHint);
  logger.debug("Timezone resolved:", timezone);

  // Don't persist a fallback timezone to storage — it's a longitude estimate
  // with no DST awareness (Etc/GMT±N), produced when the geo-tz data fetch
  // fails transiently. Saving null means the next browser session will retry
  // the real lookup rather than loading a wrong timezone from storage.
  const timezoneToSave = timezone.fallback ? null : timezone;

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
      timezone: timezoneToSave,
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
    timezone: timezoneToSave,
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

  if (enabled) {
    await injectContentScriptIntoExistingTabs();
  }

  await updateBadge();

  await broadcastSettingsToTabs(settings);
}

export async function handleSetWebRTCProtection(
  payload: SetWebRTCProtectionPayload
): Promise<void> {
  const { enabled } = payload;

  await setWebRTCProtection(enabled);
  const settings = await updateSettings({ webrtcProtection: enabled });
  logger.info("WebRTC protection updated:", { enabled });

  // Push the new flag to every live content script so the injected
  // RTCPeerConnection wrapper flips state without needing a reload.
  await broadcastSettingsToTabs(settings);
}

export async function handleCompleteOnboarding(): Promise<void> {
  await updateSettings({ onboardingCompleted: true });
  logger.info("Onboarding completed");
}

export async function handleSaveFavorite(payload: SaveFavoritePayload): Promise<FavoriteResponse> {
  const settings = await loadSettings();

  // Capacity check (Req 2.6, 8.5)
  if (settings.favorites.length >= 10) {
    return { error: "AT_CAPACITY" };
  }

  // Deduplication by coordinates rounded to 4dp (Req 10.1)
  const roundCoord = (v: number) => Math.round(v * 10000) / 10000;
  const roundedLat = roundCoord(payload.latitude);
  const roundedLon = roundCoord(payload.longitude);
  const isDuplicate = settings.favorites.some(
    (f) => roundCoord(f.latitude) === roundedLat && roundCoord(f.longitude) === roundedLon
  );
  if (isDuplicate) {
    return { success: true };
  }

  // Append new favorite (Req 2.2, 8.4)
  const newFavorite = {
    id: payload.id,
    latitude: payload.latitude,
    longitude: payload.longitude,
    city: payload.city,
    country: payload.country,
    displayName: payload.displayName.slice(0, 100),
    label: payload.label,
  };

  try {
    await updateSettings({ favorites: [...settings.favorites, newFavorite] });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  return { success: true };
}

export async function handleRemoveFavorite(
  payload: RemoveFavoritePayload
): Promise<FavoriteResponse> {
  const settings = await loadSettings();

  // Filter out matching id — no-op if not found (Req 2.3, 2.4, 8.6, 8.7)
  const filtered = settings.favorites.filter((f) => f.id !== payload.id);

  try {
    await updateSettings({ favorites: filtered });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  return { success: true };
}

export async function handleRenameFavorite(
  payload: RenameFavoritePayload
): Promise<FavoriteResponse> {
  const settings = await loadSettings();

  // No-op if id not found (Req 8.8)
  const match = settings.favorites.find((f) => f.id === payload.id);
  if (!match) {
    return { success: true };
  }

  const updated = settings.favorites.map((f) =>
    f.id === payload.id ? { ...f, label: payload.label } : f
  );

  try {
    await updateSettings({ favorites: updated });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  return { success: true };
}

/**
 * SET_SCOPE_MODE handler (Req 9.1, 9.5). Persist the new scope mode, then
 * re-evaluate and re-deliver per-tab Effective_Enabled and re-badge every tab.
 * On storage failure the persisted mode is left unchanged, no re-broadcast or
 * badge refresh occurs, and STORAGE_ERROR is returned (Req 9.5).
 */
export async function handleSetScopeMode(payload: SetScopeModePayload): Promise<ScopeResponse> {
  let settings;
  try {
    settings = await updateSettings({ scopeMode: payload.scopeMode });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  await broadcastSettingsToTabs(settings);
  await updateBadge();
  return { success: true };
}

/**
 * ADD_SCOPE_SITE handler (Req 14.5, 15.1–15.6). Normalize the entered domain,
 * append it to the target list (idempotent against existing normalized
 * entries), persist, then re-broadcast and re-badge. Returns INVALID_DOMAIN for
 * unparseable input and STORAGE_ERROR on persistence failure.
 */
export async function handleAddScopeSite(payload: ScopeSitePayload): Promise<ScopeResponse> {
  const normalized = normalizeDomain(payload.domain);
  if (normalized === null) {
    return { error: "INVALID_DOMAIN" };
  }

  const settings = await loadSettings();
  const list = settings[payload.list];

  // Idempotent: a duplicate add reports success without re-persisting (Req
  // 14.5, 15.2).
  if (list.includes(normalized)) {
    return { success: true };
  }

  let updated;
  try {
    updated = await updateSettings({ [payload.list]: [...list, normalized] });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  await broadcastSettingsToTabs(updated);
  await updateBadge();
  return { success: true };
}

/**
 * REMOVE_SCOPE_SITE handler (Req 9.2). Remove the matching normalized domain
 * from the target list, persist, then re-broadcast and re-badge. Falls back to
 * the raw domain when normalization fails so legacy/odd entries can still be
 * removed. Returns STORAGE_ERROR on persistence failure.
 */
export async function handleRemoveScopeSite(payload: ScopeSitePayload): Promise<ScopeResponse> {
  const normalized = normalizeDomain(payload.domain) ?? payload.domain;

  const settings = await loadSettings();
  const filtered = settings[payload.list].filter((d) => d !== normalized);

  let updated;
  try {
    updated = await updateSettings({ [payload.list]: filtered });
  } catch {
    return { error: "STORAGE_ERROR" };
  }

  await broadcastSettingsToTabs(updated);
  await updateBadge();
  return { success: true };
}
