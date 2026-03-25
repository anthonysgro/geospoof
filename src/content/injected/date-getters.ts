/**
 * Date getter overrides.
 *
 * Overrides `getHours`, `getMinutes`, `getSeconds`, `getMilliseconds`,
 * `getDate`, `getDay`, `getMonth`, and `getFullYear` on `Date.prototype`
 * to return values in the spoofed timezone when protection is enabled.
 *
 * On Chrome (V8), native component getters use the shortOffset resolution
 * path internally. We match that by shifting the epoch via getIntlBasedOffset
 * and reading UTC methods on the shifted date.
 *
 * On Firefox (SpiderMonkey), native getters match formatToParts, so we use
 * resolvePartsForDate.
 */

import {
  spoofingEnabled,
  timezoneData,
  engineTruncatesOffset,
  originalGetHours,
  originalGetMinutes,
  originalGetSeconds,
  originalGetMilliseconds,
  originalGetDate,
  originalGetDay,
  originalGetMonth,
  originalGetFullYear,
} from "./state";
import { installOverride } from "./function-masking";
import { resolvePartsForDate, getLocalDateViaOffset, WEEKDAY_TO_NUMBER } from "./timezone-helpers";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Install Date getter overrides on `Date.prototype`.
 */
export function installDateGetterOverrides(): void {
  // Override Date.prototype.getHours
  try {
    installOverride(Date.prototype, "getHours", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCHours();
            logger.trace("getHours: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            logger.trace("getHours: spoofed", this.getTime(), false, parts.hour);
            return parts.hour;
          }
        }
        logger.debug("getHours: fallback", "spoofing disabled");
        return originalGetHours.call(this);
      } catch {
        logger.debug("getHours: fallback", "error");
        return originalGetHours.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMinutes
  try {
    installOverride(Date.prototype, "getMinutes", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCMinutes();
            logger.trace("getMinutes: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            logger.trace("getMinutes: spoofed", this.getTime(), false, parts.minute);
            return parts.minute;
          }
        }
        logger.debug("getMinutes: fallback", "spoofing disabled");
        return originalGetMinutes.call(this);
      } catch {
        logger.debug("getMinutes: fallback", "error");
        return originalGetMinutes.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getSeconds
  try {
    installOverride(Date.prototype, "getSeconds", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCSeconds();
            logger.trace("getSeconds: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            logger.trace("getSeconds: spoofed", this.getTime(), false, parts.second);
            return parts.second;
          }
        }
        logger.debug("getSeconds: fallback", "spoofing disabled");
        return originalGetSeconds.call(this);
      } catch {
        logger.debug("getSeconds: fallback", "error");
        return originalGetSeconds.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMilliseconds
  // Milliseconds are timezone-independent — no spoofing needed.
  try {
    installOverride(Date.prototype, "getMilliseconds", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return originalGetMilliseconds.call(this);
        }
        return originalGetMilliseconds.call(this);
      } catch {
        return originalGetMilliseconds.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getDate (day of month)
  try {
    installOverride(Date.prototype, "getDate", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCDate();
            logger.trace("getDate: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            logger.trace("getDate: spoofed", this.getTime(), false, parts.day);
            return parts.day;
          }
        }
        logger.debug("getDate: fallback", "spoofing disabled");
        return originalGetDate.call(this);
      } catch {
        logger.debug("getDate: fallback", "error");
        return originalGetDate.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getDay (day of week, 0=Sun..6=Sat)
  try {
    installOverride(Date.prototype, "getDay", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCDay();
            logger.trace("getDay: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            const val = WEEKDAY_TO_NUMBER[parts.weekday];
            logger.trace("getDay: spoofed", this.getTime(), false, val);
            return val;
          }
        }
        logger.debug("getDay: fallback", "spoofing disabled");
        return originalGetDay.call(this);
      } catch {
        logger.debug("getDay: fallback", "error");
        return originalGetDay.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMonth (0-indexed: 0=Jan..11=Dec)
  try {
    installOverride(Date.prototype, "getMonth", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCMonth();
            logger.trace("getMonth: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            const val = parts.month - 1;
            logger.trace("getMonth: spoofed", this.getTime(), false, val);
            return val;
          }
        }
        logger.debug("getMonth: fallback", "spoofing disabled");
        return originalGetMonth.call(this);
      } catch {
        logger.debug("getMonth: fallback", "error");
        return originalGetMonth.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getFullYear
  try {
    installOverride(Date.prototype, "getFullYear", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          if (engineTruncatesOffset) {
            const local = getLocalDateViaOffset(this, timezoneData.identifier, timezoneData.offset);
            const val = local.getUTCFullYear();
            logger.trace("getFullYear: spoofed", this.getTime(), true, val);
            return val;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) {
            logger.trace("getFullYear: spoofed", this.getTime(), false, parts.year);
            return parts.year;
          }
        }
        logger.debug("getFullYear: fallback", "spoofing disabled");
        return originalGetFullYear.call(this);
      } catch {
        logger.debug("getFullYear: fallback", "error");
        return originalGetFullYear.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }
}
