/**
 * Date formatting overrides.
 *
 * Overrides `toString`, `toDateString`, `toTimeString`, `toLocaleString`,
 * `toLocaleDateString`, and `toLocaleTimeString` on `Date.prototype` to
 * format dates using the spoofed timezone when protection is enabled.
 */

import {
  spoofingEnabled,
  timezoneData,
  engineTruncatesOffset,
  originalToString,
  originalToTimeString,
  originalToDateString,
  originalToLocaleString,
  originalToLocaleDateString,
  originalToLocaleTimeString,
} from "./state";
import { installOverride } from "./function-masking";
import { createLogger } from "@/shared/utils/debug-logger";
import {
  resolvePartsForDate,
  formatGMTOffset,
  getLongTimezoneName,
  deriveOffsetFromParts,
  getLocalDateViaOffset,
  getIntlBasedOffset,
} from "./timezone-helpers";

const logger = createLogger("INJ");

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Zero-pad a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Install Date formatting overrides on `Date.prototype`.
 */
export function installDateFormattingOverrides(): void {
  // Override Date.prototype.toDateString()
  try {
    installOverride(Date.prototype, "toDateString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            // Chrome: use shortOffset-derived local date (matches native getter path)
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const weekday = SHORT_DAYS[local.getUTCDay()];
            const month = SHORT_MONTHS[local.getUTCMonth()];
            const day = pad2(local.getUTCDate());
            const year = local.getUTCFullYear();
            const result = `${weekday} ${month} ${day} ${year}`;
            logger.trace("toDateString: spoofed", this.getTime(), true, result);
            return result;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            const weekday = parts.weekday;
            const month = SHORT_MONTHS[parts.month - 1];
            const day = pad2(parts.day);
            const year = parts.year;
            const result = `${weekday} ${month} ${day} ${year}`;
            logger.trace("toDateString: spoofed", this.getTime(), false, result);
            return result;
          }
        }
        logger.debug("toDateString: fallback", "spoofing disabled");
        return originalToDateString.call(this);
      } catch (error) {
        logger.error("Error in toDateString override:", error);
        logger.debug("toDateString: fallback", "error");
        return originalToDateString.call(this);
      }
    });
  } catch (error) {
    logger.error("Failed to override Date.toDateString:", error);
  }

  // Override Date.prototype.toString()
  try {
    installOverride(Date.prototype, "toString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            // Chrome: shortOffset-derived components (matches native getter path)
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const offsetMinutes = getIntlBasedOffset(
              this,
              timezoneData.identifier,
              timezoneData.offset
            );
            const weekday = SHORT_DAYS[local.getUTCDay()];
            const month = SHORT_MONTHS[local.getUTCMonth()];
            const day = pad2(local.getUTCDate());
            const year = local.getUTCFullYear();
            const hours = pad2(local.getUTCHours());
            const minutes = pad2(local.getUTCMinutes());
            const seconds = pad2(local.getUTCSeconds());
            const gmtOffset = formatGMTOffset(offsetMinutes);
            const longName = getLongTimezoneName(this, timezoneData.identifier);
            const result = `${weekday} ${month} ${day} ${year} ${hours}:${minutes}:${seconds} ${gmtOffset} (${longName})`;
            logger.trace("toString: spoofed", this.getTime(), true, offsetMinutes, result);
            return result;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            const offsetMinutes = deriveOffsetFromParts(this, timezoneData.identifier);
            const weekday = parts.weekday;
            const month = SHORT_MONTHS[parts.month - 1];
            const day = pad2(parts.day);
            const year = parts.year;
            const hours = pad2(parts.hour);
            const minutes = pad2(parts.minute);
            const seconds = pad2(parts.second);
            const gmtOffset = formatGMTOffset(offsetMinutes ?? 0);
            const longName = getLongTimezoneName(this, timezoneData.identifier);
            const result = `${weekday} ${month} ${day} ${year} ${hours}:${minutes}:${seconds} ${gmtOffset} (${longName})`;
            logger.trace("toString: spoofed", this.getTime(), false, offsetMinutes ?? 0, result);
            return result;
          }
        }
        logger.debug("toString: fallback", "spoofing disabled");
        return originalToString.call(this);
      } catch (error) {
        logger.error("Error in toString override:", error);
        logger.debug("toString: fallback", "error");
        return originalToString.call(this);
      }
    });
  } catch (error) {
    logger.error("Failed to override Date.toString:", error);
  }

  // Override Date.prototype.toTimeString()
  try {
    installOverride(Date.prototype, "toTimeString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            // Chrome: shortOffset-derived components
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const offsetMinutes = getIntlBasedOffset(
              this,
              timezoneData.identifier,
              timezoneData.offset
            );
            const hours = pad2(local.getUTCHours());
            const minutes = pad2(local.getUTCMinutes());
            const seconds = pad2(local.getUTCSeconds());
            const gmtOffset = formatGMTOffset(offsetMinutes);
            const longName = getLongTimezoneName(this, timezoneData.identifier);
            const result = `${hours}:${minutes}:${seconds} ${gmtOffset} (${longName})`;
            logger.trace("toTimeString: spoofed", this.getTime(), true, offsetMinutes, result);
            return result;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            const offsetMinutes = deriveOffsetFromParts(this, timezoneData.identifier);
            const hours = pad2(parts.hour);
            const minutes = pad2(parts.minute);
            const seconds = pad2(parts.second);
            const gmtOffset = formatGMTOffset(offsetMinutes ?? 0);
            const longName = getLongTimezoneName(this, timezoneData.identifier);
            const result = `${hours}:${minutes}:${seconds} ${gmtOffset} (${longName})`;
            logger.trace(
              "toTimeString: spoofed",
              this.getTime(),
              false,
              offsetMinutes ?? 0,
              result
            );
            return result;
          }
        }
        logger.debug("toTimeString: fallback", "spoofing disabled");
        return originalToTimeString.call(this);
      } catch (error) {
        logger.error("Error in toTimeString override:", error);
        logger.debug("toTimeString: fallback", "error");
        return originalToTimeString.call(this);
      }
    });
  } catch (error) {
    logger.error("Failed to override Date.toTimeString:", error);
  }

  // Override Date.prototype.toLocaleString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              logger.debug("toLocaleString: timezone injected", timezoneData.identifier);
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleString.call(this, locales as string, opts);
            }
            return originalToLocaleString.call(this, locales, options);
          }
          logger.debug("toLocaleString: fallback", "spoofing disabled");
          return originalToLocaleString.call(this, locales as string, options);
        } catch (error) {
          logger.error("Error in toLocaleString override:", error);
          logger.debug("toLocaleString: fallback", "error");
          return originalToLocaleString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    logger.error("Failed to override Date.toLocaleString:", error);
  }

  // Override Date.prototype.toLocaleDateString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleDateString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              logger.debug("toLocaleDateString: timezone injected", timezoneData.identifier);
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleDateString.call(this, locales as string, opts);
            }
            return originalToLocaleDateString.call(this, locales, options);
          }
          logger.debug("toLocaleDateString: fallback", "spoofing disabled");
          return originalToLocaleDateString.call(this, locales as string, options);
        } catch (error) {
          logger.error("Error in toLocaleDateString override:", error);
          logger.debug("toLocaleDateString: fallback", "error");
          return originalToLocaleDateString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    logger.error("Failed to override Date.toLocaleDateString:", error);
  }

  // Override Date.prototype.toLocaleTimeString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleTimeString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              logger.debug("toLocaleTimeString: timezone injected", timezoneData.identifier);
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleTimeString.call(this, locales as string, opts);
            }
            return originalToLocaleTimeString.call(this, locales, options);
          }
          logger.debug("toLocaleTimeString: fallback", "spoofing disabled");
          return originalToLocaleTimeString.call(this, locales as string, options);
        } catch (error) {
          logger.error("Error in toLocaleTimeString override:", error);
          logger.debug("toLocaleTimeString: fallback", "error");
          return originalToLocaleTimeString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    logger.error("Failed to override Date.toLocaleTimeString:", error);
  }
}
