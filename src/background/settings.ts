/**
 * Settings Management
 * Load, save, validate, and update extension settings in browser.storage.local.
 */

import type { Settings } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";

/**
 * Load settings from storage with validation and corruption handling
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get("settings");
    const settings: unknown = result.settings;

    if (!settings || typeof settings !== "object") {
      console.warn("Settings not found or invalid, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    return validateSettings(settings as Partial<Settings>);
  } catch (error) {
    console.error("Failed to load settings:", error);
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
      console.warn("Invalid coordinates in settings, resetting location");
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

  return validated;
}

/**
 * Save settings to storage with quota exceeded handling
 */
export async function saveSettings(settings: Settings): Promise<void> {
  settings.lastUpdated = Date.now();

  try {
    await browser.storage.local.set({ settings });
  } catch (error) {
    if (error instanceof Error && error.message && error.message.includes("QuotaExceededError")) {
      console.error("Storage quota exceeded, attempting to clear cache");

      try {
        await browser.storage.local.set({ settings });
      } catch (retryError) {
        console.error("Failed to save settings even after clearing cache:", retryError);
        throw new Error("Storage quota exceeded and unable to save settings");
      }
    } else {
      console.error("Failed to save settings:", error);
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
