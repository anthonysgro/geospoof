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
import { deriveOffsetFromParts, getIntlBasedOffset } from "./timezone-helpers";
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
          const epoch = this.getTime();
          if (isNaN(epoch)) return originalGetTimezoneOffset.call(this);

          if (engineTruncatesOffset) {
            // Chrome/V8: truncates sub-minute LMT offsets to integers natively.
            // deriveOffsetFromParts uses formatToParts (whole-second precision) which
            // already loses sub-minute detail, so it agrees with Chrome's truncated
            // native value. Use it here for consistency with the component getters.
            const offsetMinutes = deriveOffsetFromParts(this, timezoneData.identifier);
            if (offsetMinutes !== undefined) {
              const result = Math.trunc(-offsetMinutes);
              logger.trace(
                "getTimezoneOffset (chrome): epoch",
                epoch,
                "rawOffset",
                offsetMinutes,
                "result",
                result
              );
              return result;
            }
          } else {
            // Firefox: preserves fractional sub-minute LMT offsets natively.
            // deriveOffsetFromParts reconstructs the offset from formatToParts
            // wall-clock components, which only have second precision — this loses
            // the sub-second part of historical LMT offsets (e.g. Anchorage 1879
            // is -9:59:36 = 599.6 min, but formatToParts gives components that
            // reconstruct to exactly 599 min). TZP's offsetNanoseconds and
            // timeZoneName methods both use the shortOffset string path which
            // preserves the full 599.6 value. Using deriveOffsetFromParts here
            // would cause a "mixed" result across TZP's 10 measurement methods.
            // getIntlBasedOffset reads the shortOffset string directly (e.g.
            // "GMT-9:59:36") and parses it to the full fractional value, matching
            // what offsetNanoseconds and timeZoneName see.
            const offsetMinutes = getIntlBasedOffset(
              this,
              timezoneData.identifier,
              timezoneData.offset
            );
            const result = -offsetMinutes;
            logger.trace(
              "getTimezoneOffset (firefox): epoch",
              epoch,
              "rawOffset",
              offsetMinutes,
              "result",
              result
            );
            return result;
          }

          logger.warn("getTimezoneOffset: offset resolution failed, epoch", epoch);
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
          logger.debug(
            "Intl.DateTimeFormat: injecting timezone, original",
            options?.timeZone ?? "(none)",
            "injected",
            timezoneData.identifier
          );
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
