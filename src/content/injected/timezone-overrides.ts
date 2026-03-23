/**
 * Timezone overrides.
 *
 * Overrides `Date.prototype.getTimezoneOffset` and `Intl.DateTimeFormat`
 * constructor + `resolvedOptions` to return the spoofed timezone when
 * protection is enabled.
 */

import {
  spoofingEnabled,
  timezoneData,
  explicitTimezoneInstances,
  originalGetTimezoneOffset,
  OriginalDateTimeFormat,
  originalResolvedOptions,
  engineTruncatesOffset,
} from "./state";
import { registerOverride, disguiseAsNative, installOverride } from "./function-masking";
import { deriveOffsetFromParts } from "./timezone-helpers";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Install timezone-related overrides:
 * - `Date.prototype.getTimezoneOffset`
 * - `Intl.DateTimeFormat` constructor
 * - `Intl.DateTimeFormat.prototype.resolvedOptions`
 */
export function installTimezoneOverrides(): void {
  // Override Date.prototype.getTimezoneOffset()
  try {
    installOverride(Date.prototype, "getTimezoneOffset", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          // Derive offset from formatToParts — the same native path used by
          // the component getters (getHours, getDate, etc.). This guarantees
          // getTimezoneOffset and all getters produce consistent fingerprints
          // on both Chrome (which truncates sub-minute LMT offsets) and
          // Firefox (which preserves fractional minutes).
          const offsetMinutes = deriveOffsetFromParts(this, timezoneData.identifier);
          if (offsetMinutes !== undefined) {
            // getTimezoneOffset returns the negated offset (positive = west of UTC).
            // Chrome truncates sub-minute historical offsets to integers; Firefox preserves them.
            const result = engineTruncatesOffset ? Math.trunc(-offsetMinutes) : -offsetMinutes;
            logger.trace("getTimezoneOffset:", { date: this.toISOString(), spoofedOffset: result });
            return result;
          }
        }
        return originalGetTimezoneOffset.call(this);
      } catch (error) {
        logger.error("Error in getTimezoneOffset override:", error);
        return originalGetTimezoneOffset.call(this);
      }
    });
  } catch (error) {
    logger.error("Failed to override getTimezoneOffset:", error);
  }

  // Override Intl.DateTimeFormat constructor to inject timezone
  try {
    const DateTimeFormatOverride = function (
      this: Intl.DateTimeFormat | void,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormat {
      try {
        const hasExplicitTimezone = options?.timeZone != null;
        // Treat explicit timezone matching the spoofed timezone as non-explicit
        // so that resolvedOptions() returns the spoofed identifier consistently
        // for both the no-timezone and explicit-spoofed-timezone paths.
        const matchesSpoofedTz =
          hasExplicitTimezone &&
          spoofingEnabled &&
          timezoneData &&
          options.timeZone!.toLowerCase() === timezoneData.identifier.toLowerCase();

        if (spoofingEnabled && timezoneData && (!hasExplicitTimezone || matchesSpoofedTz)) {
          // Inject spoofed timezone when caller did NOT provide an explicit one,
          // or when the explicit timezone matches the spoofed timezone
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          logger.debug("Intl.DateTimeFormat: injecting timezone", {
            original: options?.timeZone ?? "(none)",
            injected: timezoneData.identifier,
          });
          const instance = new OriginalDateTimeFormat(locales, opts);
          // Do NOT add to explicitTimezoneInstances — treat as default-timezone instance
          return instance;
        }

        const instance = new OriginalDateTimeFormat(locales, options);
        if (hasExplicitTimezone) {
          explicitTimezoneInstances.add(instance);
        }
        return instance;
      } catch (error) {
        logger.error("Error in DateTimeFormat constructor override:", error);
        return new OriginalDateTimeFormat(locales, options);
      }
    } as unknown as typeof Intl.DateTimeFormat;

    registerOverride(DateTimeFormatOverride, "DateTimeFormat");
    disguiseAsNative(DateTimeFormatOverride, "DateTimeFormat", 0);
    Intl.DateTimeFormat = DateTimeFormatOverride;

    // Copy static properties
    Object.defineProperty(Intl.DateTimeFormat, "prototype", {
      value: OriginalDateTimeFormat.prototype,
      writable: false,
      configurable: false,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
  } catch (error) {
    logger.error("Failed to override Intl.DateTimeFormat constructor:", error);
  }

  // Override Intl.DateTimeFormat.prototype.resolvedOptions()
  // Scoped: only inject the spoofed timezone for instances that were NOT created
  // with an explicit timeZone option. This prevents self-interference where
  // getIntlBasedOffset / getLongTimezoneName (which use OriginalDateTimeFormat
  // with explicit timeZone) would get corrupted by the spoofed timezone.
  try {
    installOverride(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
      function (this: Intl.DateTimeFormat): Intl.ResolvedDateTimeFormatOptions {
        try {
          const options = originalResolvedOptions.call(this);
          // For non-explicit instances the constructor already injected the
          // spoofed timezone, so the native resolvedOptions already returns
          // the engine-normalized identifier (e.g. "Asia/Calcutta" for
          // "Asia/Kolkata"). No need to overwrite — just return as-is.
          return options;
        } catch (error) {
          logger.error("Error in resolvedOptions override:", error);
          return originalResolvedOptions.call(this);
        }
      }
    );
  } catch (error) {
    logger.error("Failed to override Intl.DateTimeFormat.resolvedOptions:", error);
  }
}
