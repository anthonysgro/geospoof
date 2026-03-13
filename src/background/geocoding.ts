/**
 * Geocoding
 * Forward and reverse geocoding using the Nominatim (OpenStreetMap) API.
 */

import type { LocationName } from "@/shared/types/settings";
import type { GeocodeResult } from "@/shared/types/messages";
import { sessionGet, sessionSet } from "./session-cache";

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
export const GEOCODING_TIMEOUT = 5000;
export const MAX_RETRIES = 2;

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

/** Internal interface for scored geocode results */
interface ScoredGeocodeResult extends GeocodeResult {
  score: number;
  type: string;
  class: string;
}

/**
 * Get cache key for coordinates (rounded to 4 decimal places ~11m precision)
 */
export function getCacheKey(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(4);
  const lon = longitude.toFixed(4);
  return `${lat},${lon}`;
}

/**
 * Forward geocoding - search for locations by query
 */
export async function geocodeQuery(query: string): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "10",
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

    const dataArray = data as NominatimSearchResult[];
    const results: ScoredGeocodeResult[] = dataArray.map((r: NominatimSearchResult) => {
      const city = r.address?.city || r.address?.town || r.address?.village || "";
      const country = r.address?.country || "";

      let score = 0;

      if (city) score += 10;
      if (r.type === "city") score += 20;
      if (r.type === "town") score += 15;
      if (r.type === "administrative") score += 10;
      if (r.class === "place") score += 5;
      if (r.class === "boundary") score += 5;
      if (r.type === "road" || r.type === "street") score -= 20;
      if (r.type === "building" || r.type === "house") score -= 20;
      if (r.class === "highway") score -= 15;
      if (r.class === "amenity") score -= 10;
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
export async function reverseGeocode(latitude: number, longitude: number): Promise<LocationName> {
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = await sessionGet<LocationName>("reverseGeo:" + cacheKey);
  if (cached !== undefined) {
    return cached;
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

    await sessionSet("reverseGeo:" + cacheKey, locationName);

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
export async function fetchWithRetry(
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

      if (lastError.name === "AbortError" || attempt === maxRetries) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}
