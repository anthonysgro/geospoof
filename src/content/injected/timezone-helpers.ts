/**
 * Pure/near-pure timezone utility functions.
 * No side effects on global objects — uses OriginalDateTimeFormat from state
 * to avoid self-interference with the spoofed DateTimeFormat constructor.
 */

import type { TimezoneData } from "./types";
import { OriginalDate, OriginalDateTimeFormat, originalGetTimezoneOffset } from "./state";

/** Validate that an unknown value conforms to the TimezoneData interface. */
export function validateTimezoneData(tz: unknown): tz is TimezoneData {
  if (!tz || typeof tz !== "object") {
    return false;
  }

  const t = tz as Partial<TimezoneData>;

  if (typeof t.identifier !== "string" || t.identifier.length === 0) {
    console.error("[GeoSpoof Injected] Invalid timezone identifier:", t.identifier);
    return false;
  }

  if (typeof t.offset !== "number" || !Number.isFinite(t.offset)) {
    console.error("[GeoSpoof Injected] Invalid timezone offset:", t.offset);
    return false;
  }

  if (typeof t.dstOffset !== "number" || !Number.isFinite(t.dstOffset)) {
    console.error("[GeoSpoof Injected] Invalid timezone dstOffset:", t.dstOffset);
    return false;
  }

  return true;
}

/** Parse a GMT offset string like "GMT+5:30" or "GMT-8" into minutes from UTC. */
export function parseGMTOffset(gmtString: string): number {
  if (gmtString === "GMT" || gmtString === "UTC") {
    return 0;
  }

  // Handle GMT±H:MM:SS (historical sub-minute offsets like GMT+0:53:28)
  // as well as the standard GMT±H:MM and GMT±H formats.
  const match = gmtString.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);
  // Round to nearest minute to match getTimezoneOffset() convention
  return sign * (hours * 60 + minutes + (seconds >= 30 ? 1 : 0));
}

/**
 * Resolve the actual UTC offset for a given date and IANA timezone using
 * Intl.DateTimeFormat. Returns offset in minutes from UTC (positive = east).
 * Falls back to the stored timezone.offset on any error.
 */
export function getIntlBasedOffset(date: Date, timezoneId: string, fallbackOffset: number): number {
  try {
    const formatter = new OriginalDateTimeFormat("en-US", {
      timeZone: timezoneId,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return parseGMTOffset(tzPart?.value ?? "GMT");
  } catch {
    // Invalid IANA identifier or unsupported environment — use fallback
    return fallbackOffset;
  }
}

/** Convert an offset in minutes from UTC to a `GMT±HHMM` string. */
export function formatGMTOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

/** Extract the long timezone name (e.g. "Pacific Daylight Time") for a date and IANA tz. */
export function getLongTimezoneName(date: Date, timezoneId: string): string {
  try {
    const formatter = new OriginalDateTimeFormat("en-US", {
      timeZone: timezoneId,
      timeZoneName: "long",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? timezoneId;
  } catch {
    return timezoneId;
  }
}

// ── Date constructor helpers ─────────────────────────────────────────

/**
 * Determine if a date string lacks an explicit timezone indicator.
 * Returns true if the string is "ambiguous" (no tz info), meaning
 * the JS engine will parse it using the local timezone.
 *
 * Explicit indicators: Z, UTC, GMT, ±HH:MM, ±HHMM, ±HH (at end)
 * ISO 8601 date-only (e.g. "2024-01-15") is treated as explicit (UTC per spec).
 */
export function isAmbiguousDateString(str: string): boolean {
  // ISO 8601 date-only: YYYY-MM-DD with no time component → UTC per ECMAScript spec
  if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
    return false;
  }

  // Check for explicit timezone indicators
  const hasExplicitTz =
    // Trailing Z (UTC designator) — e.g. "2024-01-15T12:00:00Z"
    /Z$/i.test(str.trim()) ||
    // UTC or GMT keywords (case-insensitive)
    /\b(?:UTC|GMT)\b/i.test(str) ||
    // ±HH:MM, ±HHMM, or ±HH at end of string
    /[+-]\d{2}(?::?\d{2})?$/.test(str.trim());

  return !hasExplicitTz;
}

/**
 * Compute the epoch adjustment in milliseconds to shift a timestamp
 * from real-local-time interpretation to spoofed-local-time interpretation.
 *
 * @param parsedDate - Date object parsed in real local time
 * @param timezoneId - Spoofed IANA timezone identifier
 * @param fallbackOffset - Fallback offset from timezoneData
 * @returns adjustment in milliseconds (add to epoch)
 */
export function computeEpochAdjustment(
  parsedDate: Date,
  timezoneId: string,
  fallbackOffset: number
): number {
  // Real system offset (positive = west of UTC, same convention as getTimezoneOffset)
  const realOffsetMinutes = originalGetTimezoneOffset.call(parsedDate);
  // Spoofed offset (positive = east of UTC, Intl convention)
  const spoofedUtcOffset = getIntlBasedOffset(parsedDate, timezoneId, fallbackOffset);
  // Convert to same sign convention as getTimezoneOffset (positive = west)
  const spoofedOffsetMinutes = -spoofedUtcOffset;
  const initialAdjustment = (spoofedOffsetMinutes - realOffsetMinutes) * 60000;

  // Iterative refinement: re-resolve the spoofed offset at the adjusted epoch
  // to handle DST boundary crossings between real and spoofed timezones.
  // Converges in at most 2 iterations since offsets change at most once per DST transition.
  try {
    const adjustedDate = new OriginalDate(parsedDate.getTime() + initialAdjustment);
    const refinedSpoofedUtcOffset = getIntlBasedOffset(adjustedDate, timezoneId, fallbackOffset);
    if (refinedSpoofedUtcOffset !== spoofedUtcOffset) {
      const refinedSpoofedOffsetMinutes = -refinedSpoofedUtcOffset;
      return (refinedSpoofedOffsetMinutes - realOffsetMinutes) * 60000;
    }
  } catch {
    // Fall back to initial un-refined adjustment
  }

  return initialAdjustment;
}
