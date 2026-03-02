/**
 * Background Script
 * Central coordinator for the GeoSpoof extension
 * Handles settings management, geocoding, timezone calculation, and message routing
 */

import type { Settings, Timezone, LocationName } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";
import type {
  Message,
  SetLocationPayload,
  SetProtectionStatusPayload,
  SetWebRTCProtectionPayload,
  GeocodeQueryPayload,
  GeocodeResult,
  CheckTabInjectionPayload,
  InjectionStatus,
} from "@/shared/types/messages";
import { isValidIANATimezone } from "@/shared/utils/type-guards";

// Initialize extension
async function initialize(): Promise<void> {
  const settings = await loadSettings();

  // Apply WebRTC protection if enabled
  if (settings.webrtcProtection) {
    try {
      await setWebRTCProtection(true);
    } catch (error) {
      console.error("Failed to apply WebRTC protection on startup:", error);
    }
  }

  // Apply initial settings to all tabs
  if (settings.enabled && settings.location) {
    await broadcastSettingsToTabs(settings);
  }

  // Update badge to reflect initial state
  await updateBadge(settings.enabled);
}

// Settings Management

/**
 * Load settings from storage with validation and corruption handling
 */
async function loadSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get("settings");
    const settings: unknown = result.settings;

    // Return defaults if settings don't exist or are invalid
    if (!settings || typeof settings !== "object") {
      console.warn("Settings not found or invalid, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    // Validate settings structure
    const validated = validateSettings(settings as Partial<Settings>);

    return validated;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Validate settings object and fix corruption
 */
function validateSettings(settings: Partial<Settings>): Settings {
  const validated: Settings = { ...DEFAULT_SETTINGS };

  // Validate enabled flag
  if (typeof settings.enabled === "boolean") {
    validated.enabled = settings.enabled;
  }

  // Validate location
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

  // Validate timezone
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

  // Validate locationName
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

  // Validate webrtcProtection
  if (typeof settings.webrtcProtection === "boolean") {
    validated.webrtcProtection = settings.webrtcProtection;
  }

  // Validate onboardingCompleted
  if (typeof settings.onboardingCompleted === "boolean") {
    validated.onboardingCompleted = settings.onboardingCompleted;
  }

  // Validate version
  if (typeof settings.version === "string") {
    validated.version = settings.version;
  }

  // Validate lastUpdated
  if (typeof settings.lastUpdated === "number") {
    validated.lastUpdated = settings.lastUpdated;
  }

  return validated;
}

/**
 * Save settings to storage with quota exceeded handling
 */
async function saveSettings(settings: Settings): Promise<void> {
  settings.lastUpdated = Date.now();

  try {
    await browser.storage.local.set({ settings });
  } catch (error) {
    // Handle storage quota exceeded
    if (error instanceof Error && error.message && error.message.includes("QuotaExceededError")) {
      console.error("Storage quota exceeded, attempting to clear cache");

      // Clear any cached data (we don't have cache in storage yet, but prepare for it)
      try {
        // Retry save after clearing
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
async function getSettings(): Promise<Settings> {
  return await loadSettings();
}

/**
 * Update settings with partial updates
 */
async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const updated: Settings = { ...current, ...updates };
  await saveSettings(updated);
  return updated;
}

// Badge Updates
async function updateBadge(enabled: boolean): Promise<void> {
  // Get all tabs and set badge for each one individually
  try {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      const isRestricted = isRestrictedUrl(tab.url ?? "");

      if (!enabled || isRestricted) {
        // Protection disabled or restricted page - gray badge, no text
        void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId: tab.id });
        void browser.browserAction.setBadgeText({ text: "", tabId: tab.id });
      } else {
        // Protection enabled on regular page - green badge with checkmark
        void browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId: tab.id });
        void browser.browserAction.setBadgeText({ text: "✓", tabId: tab.id });
      }
    }
  } catch (error) {
    console.error("Failed to update badge:", error);
    // Fallback to global badge if tab query fails
    const color = enabled ? "green" : "gray";
    const text = enabled ? "✓" : "";
    void browser.browserAction.setBadgeBackgroundColor({ color });
    void browser.browserAction.setBadgeText({ text });
  }
}

// Broadcast settings to all tabs
async function broadcastSettingsToTabs(settings: Settings): Promise<void> {
  const tabs = await browser.tabs.query({});

  const promises: Promise<void>[] = [];
  for (const tab of tabs) {
    // Send to all tabs, including those without http/https URLs
    // Content scripts only inject on http/https, so errors are expected for other URLs
    const promise = browser.tabs
      .sendMessage(tab.id!, {
        type: "UPDATE_SETTINGS",
        payload: settings,
      })
      .catch((error: Error) => {
        // Tab may not have content script injected (e.g., about:, moz-extension:, etc.)
        console.debug(`Could not send message to tab ${tab.id} (${tab.url}):`, error.message);
      });

    promises.push(promise as Promise<void>);
  }

  // Wait for all messages to be sent (or fail)
  await Promise.all(promises);
}

// Message Handling
browser.runtime.onMessage.addListener(
  (
    message: Message,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    void handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }
);

async function handleMessage(
  message: Message,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    switch (message.type) {
      case "GET_SETTINGS": {
        const settings = await loadSettings();
        sendResponse(settings);
        break;
      }

      case "SET_LOCATION":
        await handleSetLocation(message.payload as SetLocationPayload);
        sendResponse({ success: true });
        break;

      case "SET_PROTECTION_STATUS":
        await handleSetProtectionStatus(message.payload as SetProtectionStatusPayload);
        sendResponse({ success: true });
        break;

      case "SET_WEBRTC_PROTECTION":
        await handleSetWebRTCProtection(message.payload as SetWebRTCProtectionPayload);
        sendResponse({ success: true });
        break;

      case "GEOCODE_QUERY": {
        const results = await geocodeQuery((message.payload as GeocodeQueryPayload).query);
        sendResponse({ results });
        break;
      }

      case "COMPLETE_ONBOARDING":
        await handleCompleteOnboarding();
        sendResponse({ success: true });
        break;

      case "CHECK_TAB_INJECTION": {
        const injectionStatus = await checkTabInjection(
          (message.payload as CheckTabInjectionPayload).tabId
        );
        sendResponse(injectionStatus);
        break;
      }

      default:
        console.warn("Unknown message type:", message.type);
        sendResponse({ error: "Unknown message type" });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleSetLocation(payload: SetLocationPayload): Promise<void> {
  const { latitude, longitude } = payload;

  // Calculate timezone
  const timezone = await getTimezoneForCoordinates(latitude, longitude);

  // Reverse geocode for display name
  let locationName: LocationName | null = null;
  try {
    locationName = await reverseGeocode(latitude, longitude);
  } catch (error) {
    console.warn("Reverse geocoding failed:", error);
  }

  // Update settings
  const settings = await updateSettings({
    location: { latitude, longitude, accuracy: 10 },
    timezone,
    locationName,
  });

  // Broadcast to tabs
  await broadcastSettingsToTabs(settings);
}

async function handleSetProtectionStatus(payload: SetProtectionStatusPayload): Promise<void> {
  const { enabled } = payload;

  const settings = await updateSettings({ enabled });

  // Update badge globally (all tabs)
  await updateBadge(enabled);

  // If enabling protection, inject content script into all existing tabs
  if (enabled) {
    await injectContentScriptIntoExistingTabs();
  } else {
    // If disabling protection, clear badge for all tabs
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId: tab.id });
      void browser.browserAction.setBadgeText({ text: "", tabId: tab.id });
    }
  }

  // Broadcast to tabs
  await broadcastSettingsToTabs(settings);
}

// Inject content script into all existing tabs
async function injectContentScriptIntoExistingTabs(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      // Only inject into http/https pages
      if (tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
        try {
          // Check if content script is already injected by sending a ping
          const response: unknown = await browser.tabs.sendMessage(tab.id!, { type: "PING" });
          if (response && (response as { pong?: boolean }).pong) {
            console.debug(`Content script already injected in tab ${tab.id}`);
            continue; // Skip if already injected
          }
        } catch {
          // Content script not injected, proceed with injection
          try {
            await browser.tabs.executeScript(tab.id!, {
              file: "content/content.js",
              runAt: "document_start",
            });
            console.log(`Injected content script into tab ${tab.id}`);
          } catch (error) {
            // Tab may not allow injection (e.g., restricted pages)
            console.debug(
              `Could not inject into tab ${tab.id}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to inject content scripts:", error);
  }
}

async function handleSetWebRTCProtection(payload: SetWebRTCProtectionPayload): Promise<void> {
  const { enabled } = payload;

  await setWebRTCProtection(enabled);
  await updateSettings({ webrtcProtection: enabled });
}

async function handleCompleteOnboarding(): Promise<void> {
  await updateSettings({ onboardingCompleted: true });
}

/**
 * Check if a URL is a restricted page where extensions cannot run
 */
function isRestrictedUrl(url: string): boolean {
  if (!url) return true;

  // Firefox privileged pages
  const restrictedPrefixes = [
    "about:",
    "moz-extension:",
    "chrome:",
    "resource:",
    "view-source:",
    "data:",
    "blob:",
    "file:",
  ];

  // Firefox addons domain
  const restrictedDomains = ["addons.mozilla.org", "accounts.firefox.com", "testpilot.firefox.com"];

  // Check prefixes
  for (const prefix of restrictedPrefixes) {
    if (url.startsWith(prefix)) {
      return true;
    }
  }

  // Check domains
  try {
    const urlObj = new URL(url);
    for (const domain of restrictedDomains) {
      if (urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)) {
        return true;
      }
    }
  } catch {
    // Invalid URL, treat as restricted
    return true;
  }

  return false;
}

async function checkTabInjection(tabId: number): Promise<InjectionStatus> {
  try {
    // Try to ping the content script
    await browser.tabs.sendMessage(tabId, { type: "PING" });
    return { injected: true, error: null };
  } catch (error) {
    console.error(`Content script not responding in tab ${tabId}:`, error);
    return { injected: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Geocoding with Nominatim API
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const GEOCODING_TIMEOUT = 5000; // 5 seconds
const MAX_RETRIES = 2;

// In-memory cache for reverse geocoding
const reverseGeocodeCache: Map<string, LocationName> = new Map();

/**
 * Get cache key for coordinates (rounded to 4 decimal places ~11m precision)
 */
function getCacheKey(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(4);
  const lon = longitude.toFixed(4);
  return `${lat},${lon}`;
}

/** Internal interface for Nominatim search API response */
interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance?: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

/** Internal interface for Nominatim reverse API response */
interface NominatimReverseResult {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

/** Internal interface for GeoNames timezone API response */
interface GeoNamesTimezoneResult {
  timezoneId: string;
  rawOffset: number;
  dstOffset: number;
  status?: {
    message?: string;
  };
}

/** Internal interface for scored geocode results */
interface ScoredGeocodeResult extends GeocodeResult {
  score: number;
  type: string;
  class: string;
}

/**
 * Forward geocoding - search for locations by query
 */
async function geocodeQuery(query: string): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "10", // Increased to get more results for filtering
    addressdetails: "1",
  });

  try {
    const result = await fetchWithRetry(
      `${NOMINATIM_SEARCH_URL}?${params}`,
      {
        headers: { "User-Agent": "GeoSpoof-Extension/1.0" },
      },
      MAX_RETRIES
    );

    if (!result.ok) {
      throw new Error(`Geocoding failed: ${result.status}`);
    }

    const data: unknown = await result.json();

    // Map and score results
    const dataArray = data as NominatimSearchResult[];
    const results: ScoredGeocodeResult[] = dataArray.map((r: NominatimSearchResult) => {
      const city = r.address?.city || r.address?.town || r.address?.village || "";
      const country = r.address?.country || "";

      // Calculate relevance score
      let score = 0;

      // Prioritize results with city/town/village in address
      if (city) score += 10;

      // Prioritize results where the place type is a city/town
      if (r.type === "city") score += 20;
      if (r.type === "town") score += 15;
      if (r.type === "administrative") score += 10;

      // Prioritize results where class is "place" or "boundary"
      if (r.class === "place") score += 5;
      if (r.class === "boundary") score += 5;

      // Deprioritize roads, buildings, and other non-city results
      if (r.type === "road" || r.type === "street") score -= 20;
      if (r.type === "building" || r.type === "house") score -= 20;
      if (r.class === "highway") score -= 15;
      if (r.class === "amenity") score -= 10;

      // Use importance from Nominatim (0-1 scale, higher is more important)
      if (r.importance) score += r.importance * 10;

      return {
        name: r.display_name,
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        city,
        country,
        score,
        type: r.type,
        class: r.class,
      };
    });

    // Sort by score (highest first) and return top 5
    return results
      .sort((a: ScoredGeocodeResult, b: ScoredGeocodeResult) => b.score - a.score)
      .slice(0, 5)
      .map((r: ScoredGeocodeResult) => ({
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        city: r.city,
        country: r.country,
      }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Geocoding request timed out");
      throw new Error("TIMEOUT");
    }
    console.error("Geocoding error:", error);
    throw new Error("NETWORK");
  }
}

/**
 * Reverse geocoding - get address from coordinates
 */
async function reverseGeocode(latitude: number, longitude: number): Promise<LocationName> {
  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)!;
  }

  const params = new URLSearchParams({
    lat: latitude.toString(),
    lon: longitude.toString(),
    format: "json",
    addressdetails: "1",
  });

  try {
    const result = await fetchWithRetry(
      `${NOMINATIM_REVERSE_URL}?${params}`,
      {
        headers: { "User-Agent": "GeoSpoof-Extension/1.0" },
      },
      MAX_RETRIES
    );

    if (!result.ok) {
      throw new Error(`Reverse geocoding failed: ${result.status}`);
    }

    const data = (await result.json()) as NominatimReverseResult;

    const locationName: LocationName = {
      city: data.address?.city || data.address?.town || data.address?.village || "",
      country: data.address?.country || "",
      displayName: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    };

    // Cache the result
    reverseGeocodeCache.set(cacheKey, locationName);

    return locationName;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Reverse geocoding request timed out");
      throw new Error("TIMEOUT");
    }
    console.error("Reverse geocoding error:", error);
    throw new Error("NETWORK");
  }
}

/**
 * Fetch with timeout and retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEOCODING_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on timeout or if it's the last attempt
      if (lastError.name === "AbortError" || attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}

// Timezone calculation with GeoNames API
const GEONAMES_TIMEZONE_URL = "https://secure.geonames.org/timezoneJSON";
const GEONAMES_USERNAME = "demo"; // Default fallback

// In-memory cache for timezone lookups
const timezoneCache: Map<string, Timezone> = new Map();

/**
 * Clear the timezone cache (for testing)
 */
function clearTimezoneCache(): void {
  timezoneCache.clear();
}

/**
 * Get timezone for coordinates using GeoNames API with fallback
 */
async function getTimezoneForCoordinates(latitude: number, longitude: number): Promise<Timezone> {
  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  if (timezoneCache.has(cacheKey)) {
    return timezoneCache.get(cacheKey)!;
  }

  // Get username from settings
  const settings = await loadSettings();
  const username = settings.geonamesUsername || GEONAMES_USERNAME;

  try {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lng: longitude.toString(),
      username: username,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOCODING_TIMEOUT);

    const response = await fetch(`${GEONAMES_TIMEZONE_URL}?${params}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Timezone API failed: ${response.status}`);
    }

    const data = (await response.json()) as GeoNamesTimezoneResult;

    // Check for API error response
    if (data.status) {
      const errorMsg = data.status.message || "Unknown error";

      // Check if it's a rate limit error
      if (errorMsg.includes("daily limit") || errorMsg.includes("demo has been exceeded")) {
        console.error(
          "GeoNames API limit exceeded. The shared 'demo' account has hit its daily limit.\n" +
            "To fix this, create a free account at https://www.geonames.org and enable web services.\n" +
            "Then update your username in the extension settings."
        );
      }

      throw new Error(`Timezone API error: ${errorMsg}`);
    }

    const timezone: Timezone = {
      identifier: data.timezoneId,
      offset: Math.round(data.rawOffset * 60),
      dstOffset: Math.round(data.dstOffset * 60),
    };

    // Validate IANA timezone identifier format
    if (!isValidIANATimezone(timezone.identifier)) {
      throw new Error("Invalid timezone identifier");
    }

    // Cache the result
    timezoneCache.set(cacheKey, timezone);

    return timezone;
  } catch (error) {
    console.warn("Timezone API failed, using fallback:", error);

    // Fallback: estimate timezone from longitude and latitude
    // Rough approximation: 15 degrees longitude ≈ 1 hour
    const estimatedOffset = Math.round(longitude / 15) * 60;

    // Estimate IANA timezone identifier based on coordinates
    // This is a rough approximation for common regions
    let identifier = "Etc/GMT";
    const offsetHours = Math.round(estimatedOffset / 60);

    // Use Etc/GMT format (note: signs are inverted in Etc/GMT)
    if (offsetHours === 0) {
      identifier = "Etc/GMT";
    } else if (offsetHours > 0) {
      identifier = `Etc/GMT-${offsetHours}`;
    } else {
      identifier = `Etc/GMT+${Math.abs(offsetHours)}`;
    }

    const fallbackTimezone: Timezone = {
      identifier: identifier,
      offset: estimatedOffset,
      dstOffset: 0,
      fallback: true,
    };

    // Cache the fallback result
    timezoneCache.set(cacheKey, fallbackTimezone);

    return fallbackTimezone;
  }
}

// WebRTC Protection
async function setWebRTCProtection(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await browser.privacy.network.webRTCIPHandlingPolicy.set({
        value: "disable_non_proxied_udp",
      });
    } else {
      await browser.privacy.network.webRTCIPHandlingPolicy.clear({});
    }
  } catch (error) {
    console.error("Failed to set WebRTC protection:", error);
    throw error;
  }
}

// Initialize on install
browser.runtime.onInstalled.addListener((details: browser.runtime._OnInstalledDetails) => {
  if (details.reason === "install") {
    // First installation - onboarding will be shown in popup
    console.log("Extension installed - onboarding will be displayed");
  }
  void initialize();
});

// Initialize on startup
void initialize();

// Listen for new tabs to inject settings immediately
// Check if browser.tabs.onCreated exists (may not exist in test environment)
if (browser.tabs && browser.tabs.onCreated) {
  browser.tabs.onCreated.addListener((tab: browser.tabs.Tab) => {
    void (async () => {
      const settings = await loadSettings();

      // Wait a moment for content script to be injected
      setTimeout(() => {
        void (async () => {
          // Always send settings, even if protection is disabled
          // This ensures content script has the current state
          try {
            await browser.tabs.sendMessage(tab.id!, {
              type: "UPDATE_SETTINGS",
              payload: settings,
            });
          } catch (error) {
            // Content script may not be ready yet
            console.debug(`Could not send settings to new tab ${tab.id}:`, error);
          }
        })();
      }, 100);
    })();
  });
}

// Listen for tab updates to ensure settings are applied
// Check if browser.tabs.onUpdated exists (may not exist in test environment)
if (browser.tabs && browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: browser.tabs._OnUpdatedChangeInfo, tab: browser.tabs.Tab) => {
      // Act when the page starts loading to inject as early as possible
      if (changeInfo.status === "loading") {
        void (async () => {
          const settings = await loadSettings();

          // Check if this is a restricted URL where extensions can't run
          const isRestricted = isRestrictedUrl(tab.url!);

          // If protection is disabled, just set gray badge and return
          if (!settings.enabled) {
            void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.browserAction.setBadgeText({ text: "", tabId });
            return;
          }

          // If this is a restricted page, don't show warning - just show gray badge
          if (isRestricted) {
            void browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.browserAction.setBadgeText({ text: "", tabId });
            return;
          }

          // Protection is enabled - try to send settings
          try {
            await browser.tabs.sendMessage(tabId, {
              type: "UPDATE_SETTINGS",
              payload: settings,
            });

            // If successful, set green checkmark badge for this tab
            void browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId });
            void browser.browserAction.setBadgeText({ text: "✓", tabId });
          } catch (error) {
            // Content script may not be injected yet, which is expected
            console.debug(`Could not send settings to updated tab ${tabId}:`, error);

            // Check if this is an injection failure (CSP or other issue)
            // If protection is enabled but we can't inject, show warning
            if (settings.enabled && changeInfo.status === "loading") {
              console.error(
                `Content script injection may have failed for tab ${tabId} (${tab.url}):`,
                error
              );

              // Update badge to show warning state (orange with "!")
              void browser.browserAction.setBadgeBackgroundColor({ color: "orange", tabId });
              void browser.browserAction.setBadgeText({ text: "!", tabId });
            }
          }
        })();
      }
    }
  );
}

// ESM exports for testing
export {
  DEFAULT_SETTINGS,
  initialize,
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  validateSettings,
  geocodeQuery,
  reverseGeocode,
  getTimezoneForCoordinates,
  clearTimezoneCache,
  isValidIANATimezone,
  setWebRTCProtection,
  updateBadge,
  broadcastSettingsToTabs,
  handleMessage,
  isRestrictedUrl,
  handleSetLocation,
  handleSetProtectionStatus,
  handleSetWebRTCProtection,
  handleCompleteOnboarding,
  checkTabInjection,
  getCacheKey,
  fetchWithRetry,
  GEOCODING_TIMEOUT,
  MAX_RETRIES,
  GEONAMES_USERNAME,
};
