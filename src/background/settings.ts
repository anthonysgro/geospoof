/**
 * Settings Management
 * Load, save, validate, and update extension settings in browser.storage.local.
 */

import type { Settings } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";
import { createLogger } from "@/shared/utils/debug-logger";

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
