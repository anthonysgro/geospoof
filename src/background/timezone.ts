/**
 * Timezone
 * Offline timezone lookup using browser-geo-tz boundary data with longitude-based fallback.
 */

import type { Timezone } from "@/shared/types/settings";
import { isValidIANATimezone } from "@/shared/utils/type-guards";
import { getCacheKey } from "./geocoding";
import { sessionGet, sessionSet, sessionClearNamespace } from "./session-cache";
import { find } from "browser-geo-tz";

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
    return cached;
  }

  try {
    const results = await find(latitude, longitude);

    if (results.length === 0) {
      const fallback = buildFallbackTimezone(longitude);
      await sessionSet("timezone:" + cacheKey, fallback);
      return fallback;
    }

    const identifier = results[0];

    if (!isValidIANATimezone(identifier)) {
      const fallback = buildFallbackTimezone(longitude);
      await sessionSet("timezone:" + cacheKey, fallback);
      return fallback;
    }

    const { offset, dstOffset } = computeOffsets(identifier);

    const timezone: Timezone = { identifier, offset, dstOffset };
    await sessionSet("timezone:" + cacheKey, timezone);
    return timezone;
  } catch (error) {
    console.warn("Timezone lookup failed, using fallback:", error);

    const fallback = buildFallbackTimezone(longitude);
    await sessionSet("timezone:" + cacheKey, fallback);
    return fallback;
  }
}
