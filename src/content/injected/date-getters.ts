/**
 * Date getter overrides.
 *
 * Overrides `getHours`, `getMinutes`, `getSeconds`, `getMilliseconds`,
 * `getDate`, `getDay`, `getMonth`, and `getFullYear` on `Date.prototype`
 * to return values in the spoofed timezone when protection is enabled.
 */

import {
  spoofingEnabled,
  timezoneData,
  OriginalDateTimeFormat,
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

/**
 * Extract a date component for a given date in the specified IANA timezone
 * using OriginalDateTimeFormat with formatToParts.
 * Returns the numeric value of the requested component.
 */
function getDateComponent(
  date: Date,
  timezoneId: string,
  component: "hour" | "minute" | "second" | "day" | "month" | "year" | "weekday"
): number {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezoneId };
  switch (component) {
    case "hour":
      options.hour = "numeric";
      options.hour12 = false;
      break;
    case "minute":
      options.minute = "numeric";
      break;
    case "second":
      options.second = "numeric";
      break;
    case "day":
      options.day = "numeric";
      break;
    case "month":
      options.month = "numeric";
      break;
    case "year":
      options.year = "numeric";
      break;
    case "weekday":
      options.weekday = "short";
      break;
  }

  const formatter = new OriginalDateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(date);

  if (component === "weekday") {
    // Derive day-of-week (0=Sun..6=Sat) from the formatted weekday
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return dayMap[weekdayStr] ?? 0;
  }

  const partType =
    component === "day"
      ? "day"
      : component === "month"
        ? "month"
        : component === "year"
          ? "year"
          : component;
  const part = parts.find((p) => p.type === partType);
  return parseInt(part?.value ?? "0", 10);
}

/**
 * Install Date getter overrides on `Date.prototype`.
 */
export function installDateGetterOverrides(): void {
  // Override Date.prototype.getHours
  try {
    installOverride(Date.prototype, "getHours", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "hour");
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
          return getDateComponent(this, timezoneData.identifier, "minute");
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
          return getDateComponent(this, timezoneData.identifier, "second");
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
  // Milliseconds are timezone-independent (same instant in time),
  // so we return the original value. The ms component doesn't shift
  // across timezones — only h/m/s/date do.
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
          return getDateComponent(this, timezoneData.identifier, "day");
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
          return getDateComponent(this, timezoneData.identifier, "weekday");
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
          // getDateComponent returns 1-based month, subtract 1 for 0-indexed
          return getDateComponent(this, timezoneData.identifier, "month") - 1;
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
          return getDateComponent(this, timezoneData.identifier, "year");
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
