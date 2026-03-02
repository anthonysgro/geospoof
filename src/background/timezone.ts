/**
 * Timezone
 * Timezone lookup using the GeoNames API with longitude-based fallback.
 */

import type { Timezone } from "@/shared/types/settings";
import { isValidIANATimezone } from "@/shared/utils/type-guards";
import { getCacheKey, GEOCODING_TIMEOUT } from "./geocoding";
import { loadSettings } from "./settings";

const GEONAMES_TIMEZONE_URL = "https://secure.geonames.org/timezoneJSON";
export const GEONAMES_USERNAME = "demo";

/** Internal interface for GeoNames timezone API response */
interface GeoNamesTimezoneResult {
  timezoneId: string;
  rawOffset: number;
  dstOffset: number;
  status?: {
    message?: string;
  };
}

// In-memory cache for timezone lookups
const timezoneCache: Map<string, Timezone> = new Map();

/**
 * Clear the timezone cache (for testing)
 */
export function clearTimezoneCache(): void {
  timezoneCache.clear();
}

/**
 * Get timezone for coordinates using GeoNames API with fallback
 */
export async function getTimezoneForCoordinates(
  latitude: number,
  longitude: number
): Promise<Timezone> {
  const cacheKey = getCacheKey(latitude, longitude);
  if (timezoneCache.has(cacheKey)) {
    return timezoneCache.get(cacheKey)!;
  }

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

    if (data.status) {
      const errorMsg = data.status.message || "Unknown error";

      if (errorMsg.includes("daily limit") || errorMsg.includes("demo has been exceeded")) {
        console.error(
          `GeoNames API limit exceeded. The GeoNames account '${username}' has hit its daily limit.\n` +
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

    if (!isValidIANATimezone(timezone.identifier)) {
      throw new Error("Invalid timezone identifier");
    }

    timezoneCache.set(cacheKey, timezone);

    return timezone;
  } catch (error) {
    console.warn("Timezone API failed, using fallback:", error);

    const estimatedOffset = Math.round(longitude / 15) * 60;

    let identifier = "Etc/GMT";
    const offsetHours = Math.round(estimatedOffset / 60);

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

    timezoneCache.set(cacheKey, fallbackTimezone);

    return fallbackTimezone;
  }
}
