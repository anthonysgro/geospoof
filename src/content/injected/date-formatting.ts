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
  OriginalDateTimeFormat,
  originalToString,
  originalToTimeString,
  originalToDateString,
  originalToLocaleString,
  originalToLocaleDateString,
  originalToLocaleTimeString,
} from "./state";
import { installOverride } from "./function-masking";
import { getIntlBasedOffset, formatGMTOffset, getLongTimezoneName } from "./timezone-helpers";

/**
 * Install Date formatting overrides on `Date.prototype`.
 */
export function installDateFormattingOverrides(): void {
  // Override Date.prototype.toDateString()
  try {
    installOverride(Date.prototype, "toDateString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "2-digit",
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")}`;
        }
        return originalToDateString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toDateString override:", error);
        return originalToDateString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toDateString:", error);
  }

  // Override Date.prototype.toString()
  try {
    installOverride(Date.prototype, "toString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          const gmtOffset = formatGMTOffset(offsetMinutes);
          const longName = getLongTimezoneName(this, timezoneData.identifier);
          return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
        }
        return originalToString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toString override:", error);
        return originalToString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toString:", error);
  }

  // Override Date.prototype.toTimeString()
  try {
    installOverride(Date.prototype, "toTimeString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          const gmtOffset = formatGMTOffset(offsetMinutes);
          const longName = getLongTimezoneName(this, timezoneData.identifier);
          return `${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
        }
        return originalToTimeString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toTimeString override:", error);
        return originalToTimeString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toTimeString:", error);
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
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleString.call(this, locales as string, opts);
            }
            return originalToLocaleString.call(this, locales, options);
          }
          return originalToLocaleString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleString override:", error);
          return originalToLocaleString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleString:", error);
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
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleDateString.call(this, locales as string, opts);
            }
            return originalToLocaleDateString.call(this, locales, options);
          }
          return originalToLocaleDateString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleDateString override:", error);
          return originalToLocaleDateString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleDateString:", error);
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
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleTimeString.call(this, locales as string, opts);
            }
            return originalToLocaleTimeString.call(this, locales, options);
          }
          return originalToLocaleTimeString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleTimeString override:", error);
          return originalToLocaleTimeString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleTimeString:", error);
  }
}
