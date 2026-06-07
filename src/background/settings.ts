/**
 * Settings Management
 * Load, save, validate, and update extension settings in browser.storage.local.
 */

import type { Favorite, Settings } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";
import { createLogger } from "@/shared/utils/debug-logger";
import { getLastSyncedIp } from "./vpn-sync";

const logger = createLogger("BG");

/**
 * Load settings from storage with validation and corruption handling
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get("settings");
    const settings: unknown = result.settings;

    if (!settings || typeof settings !== "object") {
      logger.warn("Settings not found or invalid, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    return validateSettings(settings);
  } catch (error) {
    logger.error("Failed to load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Validate settings object and fix corruption
 */
export function validateSettings(settings: Partial<Settings>): Settings {
  const validated: Settings = { ...DEFAULT_SETTINGS };

  if (typeof settings.enabled === "boolean") {
    validated.enabled = settings.enabled;
  }

  if (settings.location && typeof settings.location === "object") {
    const { latitude, longitude, accuracy } = settings.location;

    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      validated.location = {
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" && accuracy > 0 ? accuracy : 10,
      };
    } else {
      logger.warn("Invalid coordinates in settings, resetting location");
    }
  }

  if (settings.timezone && typeof settings.timezone === "object") {
    const { identifier, offset, dstOffset } = settings.timezone;

    if (
      typeof identifier === "string" &&
      typeof offset === "number" &&
      typeof dstOffset === "number"
    ) {
      validated.timezone = { identifier, offset, dstOffset };
    }
  }

  if (settings.locationName && typeof settings.locationName === "object") {
    const { city, country, displayName } = settings.locationName;

    if (typeof displayName === "string") {
      validated.locationName = {
        city: typeof city === "string" ? city : "",
        country: typeof country === "string" ? country : "",
        displayName,
      };
    }
  }

  if (typeof settings.webrtcProtection === "boolean") {
    validated.webrtcProtection = settings.webrtcProtection;
  }

  if (typeof settings.onboardingCompleted === "boolean") {
    validated.onboardingCompleted = settings.onboardingCompleted;
  }

  if (typeof settings.version === "string") {
    validated.version = settings.version;
  }

  if (typeof settings.lastUpdated === "number") {
    validated.lastUpdated = settings.lastUpdated;
  }

  if (typeof settings.vpnSyncEnabled === "boolean") {
    validated.vpnSyncEnabled = settings.vpnSyncEnabled;
  }

  if (typeof settings.debugLogging === "boolean") {
    validated.debugLogging = settings.debugLogging;
  }

  const VALID_VERBOSITY_LEVELS = new Set(["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]);
  if (
    typeof settings.verbosityLevel === "string" &&
    VALID_VERBOSITY_LEVELS.has(settings.verbosityLevel)
  ) {
    validated.verbosityLevel = settings.verbosityLevel;
  }

  const VALID_THEMES = new Set(["system", "light", "dark"]);
  if (typeof settings.theme === "string" && VALID_THEMES.has(settings.theme)) {
    validated.theme = settings.theme;
  }

  if (Array.isArray(settings.favorites)) {
    const validatedFavorites: Favorite[] = [];
    for (const entry of settings.favorites) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.id === "string" &&
        typeof entry.latitude === "number" &&
        typeof entry.longitude === "number" &&
        entry.latitude >= -90 &&
        entry.latitude <= 90 &&
        entry.longitude >= -180 &&
        entry.longitude <= 180 &&
        typeof entry.city === "string" &&
        typeof entry.country === "string" &&
        typeof entry.displayName === "string" &&
        (entry.label === null || typeof entry.label === "string")
      ) {
        validatedFavorites.push({
          id: entry.id,
          latitude: entry.latitude,
          longitude: entry.longitude,
          city: entry.city,
          country: entry.country,
          displayName: entry.displayName.slice(0, 100),
          label: entry.label,
        });
      }
    }
    // Enforce capacity cap on load (defensive against manual storage edits)
    validated.favorites = validatedFavorites.slice(0, 10);
  } else {
    // Missing field (first run / migration) — treat as empty
    validated.favorites = [];
  }

  return validated;
}

/**
 * Save settings to storage with quota exceeded handling.
 *
 * Safari (with unsigned/development extensions) has a bug where it rejects
 * browser.storage.local.set() with a spurious "Exceeded storage quota" error
 * when the new serialized value is smaller than the currently stored value.
 * The workaround is to remove the key first, then write the new value.
 * This is safe because loadSettings() falls back to DEFAULT_SETTINGS on any
 * read failure, so a crash between remove and set is recoverable.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  settings.lastUpdated = Date.now();

  try {
    await browser.storage.local.set({ settings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isQuotaError =
      msg.includes("QuotaExceededError") ||
      msg.includes("Exceeded storage quota") ||
      msg.includes("quota");

    if (isQuotaError) {
      // Safari bug: rejects writes that shrink the stored value.
      // Delete first, then write fresh.
      logger.warn("Storage write failed (Safari quota bug), retrying via remove+set");
      try {
        await browser.storage.local.remove("settings");
        await browser.storage.local.set({ settings });
      } catch (retryError) {
        logger.error("Failed to save settings even after remove+set:", retryError);
        throw retryError;
      }
    } else {
      logger.error("Failed to save settings:", error);
      throw error;
    }
  }

  // Push the current region to the native host (Safari only) so the
  // containing app can display the active spoofed location without needing
  // to read browser.storage.local directly. Fire-and-forget — a failure
  // here must never block saving the actual settings.
  if (__SAFARI__) {
    void pushRegionToNativeHost(settings);
  }
}

/**
 * Push the current spoofed region to the containing native app via
 * browser.runtime.sendNativeMessage → SafariWebExtensionHandler →
 * UserDefaults(suiteName: "group.com.moonloaf.geospoof").
 *
 * Called after every successful settings save. Non-throwing.
 */
async function pushRegionToNativeHost(settings: Settings): Promise<void> {
  try {
    let ip: string | null = null;
    if (settings.vpnSyncEnabled) {
      ip = (await getLastSyncedIp()) ?? null;
    }
    await browser.runtime.sendNativeMessage("com.moonloaf.geospoof", {
      type: "REGION_UPDATE",
      enabled: settings.enabled,
      locationName: settings.locationName ?? null,
      location: settings.location ?? null,
      timezone: settings.timezone ?? null,
      webrtcProtection: settings.webrtcProtection,
      vpnSyncEnabled: settings.vpnSyncEnabled,
      ip,
    });
  } catch (error) {
    // Swallow — native messaging may not be available in all contexts
    // (e.g., Firefox, Chromium, or Safari without the host app running).
    logger.debug("pushRegionToNativeHost: native message failed (expected on non-Safari):", error);
  }
}

/**
 * Get current settings (alias for loadSettings for consistency)
 */
export async function getSettings(): Promise<Settings> {
  return await loadSettings();
}

/**
 * Update settings with partial updates
 */
export async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const updated: Settings = { ...current, ...updates };
  await saveSettings(updated);
  return updated;
}
