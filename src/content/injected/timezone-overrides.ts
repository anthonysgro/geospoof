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
} from "./state";
import { registerOverride, disguiseAsNative, installOverride } from "./function-masking";
import { getIntlBasedOffset } from "./timezone-helpers";

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
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          // getTimezoneOffset returns the offset TO GET TO UTC (negative of UTC offset)
          return -offsetMinutes;
        }
        return originalGetTimezoneOffset.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in getTimezoneOffset override:", error);
        return originalGetTimezoneOffset.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override getTimezoneOffset:", error);
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
        console.error("[GeoSpoof Injected] Error in DateTimeFormat constructor override:", error);
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
    console.error("[GeoSpoof Injected] Failed to override Intl.DateTimeFormat constructor:", error);
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
          if (spoofingEnabled && timezoneData && !explicitTimezoneInstances.has(this)) {
            options.timeZone = timezoneData.identifier;
          }
          return options;
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in resolvedOptions override:", error);
          return originalResolvedOptions.call(this);
        }
      }
    );
  } catch (error) {
    console.error(
      "[GeoSpoof Injected] Failed to override Intl.DateTimeFormat.resolvedOptions:",
      error
    );
  }
}
