/**
 * Timezone
 * Offline timezone lookup using browser-geo-tz boundary data with longitude-based fallback.
 */

import type { Timezone } from "@/shared/types/settings";
import { isValidIANATimezone } from "@/shared/utils/type-guards";
import { createLogger } from "@/shared/utils/debug-logger";
import { getCacheKey } from "./geocoding";
import { sessionGet, sessionSet, sessionClearNamespace } from "./session-cache";
import { init as geoTzInit } from "browser-geo-tz";

const logger = createLogger("BG");

// Initialize browser-geo-tz once at module load so the data fetch promises
// are reused across all calls — avoids re-fetching the CDN files on every lookup.
// Pin to a specific geo-tz version so the index and .dat file are always in sync
// (using @latest risks a version mismatch between the two files if a new release
// is published between when each CDN cache entry was populated).
const GEO_TZ_VERSION = "8.1.5";
const _geoTz = geoTzInit(
  `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones-1970.geojson.geo.dat`,
  `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones-1970.geojson.index.json`
);

/**
 * Clear the timezone cache (for testing)
 */
export async function clearTimezoneCache(): Promise<void> {
  await sessionClearNamespace("timezone");
}

/**
 * Parse a short-offset timezone name (e.g. "GMT-8", "GMT+5:30") into minutes from UTC.
 */
function parseShortOffset(tzName: string): number {
  if (tzName === "GMT" || tzName === "UTC") {
    return 0;
  }
  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] || "0", 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Get the UTC offset in minutes for a given IANA timezone identifier at a specific date.
 */
function getOffsetAtDate(identifier: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: identifier,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  return parseShortOffset(tzPart?.value ?? "GMT");
}

/**
 * Compute the current UTC offset and DST offset for an IANA timezone identifier.
 *
 * The DST offset is derived by comparing winter (Jan 1) and summer (Jul 1) offsets
 * for the current year. The difference between the two (if any) is the DST adjustment.
 */
export function computeOffsets(identifier: string): { offset: number; dstOffset: number } {
  const now = new Date();
  const currentOffset = getOffsetAtDate(identifier, now);

  const year = now.getFullYear();
  const winterOffset = getOffsetAtDate(identifier, new Date(year, 0, 1));
  const summerOffset = getOffsetAtDate(identifier, new Date(year, 6, 1));

  // DST offset is the difference between the two seasonal offsets.
  // If they're the same, there's no DST.
  const dstOffset = Math.abs(summerOffset - winterOffset);

  return { offset: currentOffset, dstOffset };
}

/**
 * Build a longitude-based fallback timezone (Etc/GMT±N).
 */
function buildFallbackTimezone(longitude: number): Timezone {
  const estimatedOffset = Math.round(longitude / 15) * 60;
  const offsetHours = Math.round(estimatedOffset / 60);

  let identifier: string;
  if (offsetHours === 0) {
    identifier = "Etc/GMT";
  } else if (offsetHours > 0) {
    // Etc/GMT uses inverted sign convention
    identifier = `Etc/GMT-${offsetHours}`;
  } else {
    identifier = `Etc/GMT+${Math.abs(offsetHours)}`;
  }

  return {
    identifier,
    offset: estimatedOffset,
    dstOffset: 0,
    fallback: true,
  };
}

/**
 * Get timezone for coordinates using browser-geo-tz boundary data with fallback.
 */
export async function getTimezoneForCoordinates(
  latitude: number,
  longitude: number
): Promise<Timezone> {
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = await sessionGet<Timezone>("timezone:" + cacheKey);
  if (cached !== undefined) {
    logger.debug("Timezone cache hit:", { latitude, longitude, result: cached });
    return cached;
  }

  logger.info("Timezone lookup for coordinates:", { latitude, longitude });

  try {
    const results = await _geoTz.find(latitude, longitude);

    if (results.length === 0) {
      const fallback = buildFallbackTimezone(longitude);
      logger.debug("Timezone lookup returned no results, using fallback:", fallback);
      await sessionSet("timezone:" + cacheKey, fallback);
      return fallback;
    }

    const identifier = results[0];

    if (!isValidIANATimezone(identifier)) {
      const fallback = buildFallbackTimezone(longitude);
      logger.warn("Invalid IANA timezone, using fallback:", { identifier, fallback });
      await sessionSet("timezone:" + cacheKey, fallback);
      return fallback;
    }

    const { offset, dstOffset } = computeOffsets(identifier);

    const timezone: Timezone = { identifier, offset, dstOffset };
    logger.debug("Timezone resolved:", { latitude, longitude, result: timezone });
    await sessionSet("timezone:" + cacheKey, timezone);
    return timezone;
  } catch (error) {
    logger.warn("Timezone lookup failed, using fallback:", error);

    const fallback = buildFallbackTimezone(longitude);
    logger.warn("Timezone lookup failed, using fallback:", { error, fallback });
    await sessionSet("timezone:" + cacheKey, fallback);
    return fallback;
  }
}
