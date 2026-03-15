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
            return local.getUTCHours();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.hour;
        }
        return originalGetHours.call(this);
      } catch {
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
            return local.getUTCMinutes();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.minute;
        }
        return originalGetMinutes.call(this);
      } catch {
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
            return local.getUTCSeconds();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.second;
        }
        return originalGetSeconds.call(this);
      } catch {
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
            return local.getUTCDate();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.day;
        }
        return originalGetDate.call(this);
      } catch {
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
            return local.getUTCDay();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return WEEKDAY_TO_NUMBER[parts.weekday];
        }
        return originalGetDay.call(this);
      } catch {
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
            return local.getUTCMonth();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.month - 1;
        }
        return originalGetMonth.call(this);
      } catch {
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
            return local.getUTCFullYear();
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (parts) return parts.year;
        }
        return originalGetFullYear.call(this);
      } catch {
        return originalGetFullYear.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }
}
