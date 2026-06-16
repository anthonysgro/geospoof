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
const GEO_TZ_VERSION = "8.1.6";
// Use timezones.geojson (not timezones-1970.geojson) — the 1970 variant unions
// zones with identical behavior since 1970 and uses the highest-population
// identifier, which means coordinates near water bodies or zone boundaries
// (e.g. coastal Chicago) can land in an Etc/GMT±N zone with no DST instead of
// the correct named zone like America/Chicago. The full timezones.geojson has
// complete land coverage and always returns the proper IANA identifier.
const _geoTz = geoTzInit(
  `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones.geojson.geo.dat`,
  `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones.geojson.index.json`
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
 * Build a Timezone from a geo-service-supplied IANA identifier hint, or null if
 * the hint is absent/invalid. Used as a high-quality fallback when the offline
 * browser-geo-tz boundary lookup fails or yields nothing — far better than the
 * crude longitude estimate, and crucially returns a real named zone (with DST)
 * rather than a fingerprintable Etc/GMT±N.
 */
function buildTimezoneFromHint(ianaHint: string | undefined): Timezone | null {
  if (!ianaHint || !isValidIANATimezone(ianaHint)) {
    return null;
  }
  // isValidIANATimezone is a format check only; the hint is external (geo
  // service), so a format-valid but non-existent zone (e.g. "Not/AZone") can
  // still make Intl throw. Treat any such failure as an unusable hint.
  try {
    const { offset, dstOffset } = computeOffsets(ianaHint);
    return { identifier: ianaHint, offset, dstOffset };
  } catch {
    return null;
  }
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
 *
 * @param ianaHint - Optional IANA timezone identifier from a geo service (VPN
 *   sync path). Used as a high-quality fallback ahead of the longitude estimate
 *   when the offline boundary lookup fails or returns nothing. Ignored for
 *   manual locations that don't carry one.
 */
export async function getTimezoneForCoordinates(
  latitude: number,
  longitude: number,
  ianaHint?: string
): Promise<Timezone> {
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = await sessionGet<Timezone>("timezone:" + cacheKey);
  if (cached !== undefined && !cached.identifier.startsWith("Etc/")) {
    logger.debug("Timezone cache hit:", { latitude, longitude, result: cached });
    return cached;
  }

  logger.info("Timezone lookup for coordinates:", { latitude, longitude });

  try {
    const results = await _geoTz.find(latitude, longitude);

    if (results.length === 0) {
      const hinted = buildTimezoneFromHint(ianaHint);
      if (hinted) {
        logger.debug("Timezone lookup returned no results, using geo-service hint:", hinted);
        await sessionSet("timezone:" + cacheKey, hinted);
        return hinted;
      }
      const fallback = buildFallbackTimezone(longitude);
      logger.debug("Timezone lookup returned no results, using fallback:", fallback);
      // Don't cache fallback results — a transient CDN failure should be retried
      // on the next call rather than pinning the wrong Etc/GMT±N zone indefinitely.
      return fallback;
    }

    const identifier = results[0];

    if (!isValidIANATimezone(identifier)) {
      const hinted = buildTimezoneFromHint(ianaHint);
      if (hinted) {
        logger.warn("Invalid IANA timezone from boundary data, using geo-service hint:", {
          identifier,
          hinted,
        });
        await sessionSet("timezone:" + cacheKey, hinted);
        return hinted;
      }
      const fallback = buildFallbackTimezone(longitude);
      logger.warn("Invalid IANA timezone, using fallback:", { identifier, fallback });
      // Don't cache fallback results — same reason as above.
      return fallback;
    }

    // browser-geo-tz classifies points it can't place on land (e.g. a coastal
    // city whose exact coordinate lands just offshore, like Dubai at
    // 25.07725,55.30927) as an Etc/GMT±N zone. Those generic, DST-less zones
    // are both wrong for the location and a fingerprinting tell — a real
    // populated place virtually never legitimately resolves to Etc/GMT. When we
    // have a real named-zone hint (from the city catalog or geo service),
    // prefer it over the Etc result.
    if (identifier.startsWith("Etc/")) {
      const hinted = buildTimezoneFromHint(ianaHint);
      if (hinted) {
        logger.debug("Boundary lookup returned an Etc/GMT zone; preferring IANA hint:", {
          identifier,
          hinted,
        });
        await sessionSet("timezone:" + cacheKey, hinted);
        return hinted;
      }
      // No usable hint. NEVER persist or serve an Etc/GMT zone — it's a
      // fingerprintable, DST-less longitude bucket and exactly the "wrong
      // timezone" a user would see leak. Return a fallback (fallback:true →
      // not cached, and saved as null by the caller so the real lookup is
      // retried next sync) rather than pinning the Etc zone.
      const fallback = buildFallbackTimezone(longitude);
      logger.warn(
        "Boundary lookup returned an Etc/GMT zone with no usable hint; not persisting it, using fallback:",
        { identifier, fallback }
      );
      return fallback;
    }

    const { offset, dstOffset } = computeOffsets(identifier);

    const timezone: Timezone = { identifier, offset, dstOffset };
    logger.debug("Timezone resolved:", { latitude, longitude, result: timezone });
    await sessionSet("timezone:" + cacheKey, timezone);
    return timezone;
  } catch (error) {
    // Boundary lookup failed (network error, CDN range-request hiccup, service
    // worker suspension mid-fetch). Prefer the geo-service IANA hint — it's a
    // real named zone with DST — over the crude longitude estimate.
    const hinted = buildTimezoneFromHint(ianaHint);
    if (hinted) {
      logger.warn("Timezone lookup failed, using geo-service hint:", { error, hinted });
      // The hint is authoritative and stable, so it's safe to cache for the session.
      await sessionSet("timezone:" + cacheKey, hinted);
      return hinted;
    }

    logger.warn("Timezone lookup failed, using fallback:", error);

    const fallback = buildFallbackTimezone(longitude);
    logger.warn("Timezone lookup failed, using fallback:", { error, fallback });
    // Don't cache fallback results — a transient CDN failure (network error,
    // service worker suspension mid-fetch, CDN hiccup) should be retried on
    // the next SET_LOCATION call. Caching Etc/GMT±N zones would pin the wrong
    // no-DST offset for the entire browser session.
    return fallback;
  }
}
