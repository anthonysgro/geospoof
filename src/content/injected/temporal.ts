/**
 * Temporal API overrides.
 *
 * Feature-detects the Temporal API and overrides `Temporal.Now` methods
 * to return the spoofed timezone when enabled. No-ops gracefully if
 * Temporal is unavailable.
 */

import { spoofingEnabled, timezoneData } from "./state";
import { installOverride, registerOverride, disguiseAsNative } from "./function-masking";

/**
 * Install Temporal.Now overrides if the Temporal API is available.
 * Called by index.ts during initialization.
 */
export function installTemporalOverrides(): void {
  if (typeof Temporal === "undefined") {
    return;
  }

  try {
    // Temporal is feature-detected at runtime; cast through unknown to satisfy
    // strict type-checking since the eslint TS parser cannot resolve the ambient
    // Temporal declarations inside this IIFE.

    const TemporalNow: TemporalNow = (Temporal as unknown as TemporalNamespace).Now;

    const originalTimeZoneId = TemporalNow.timeZoneId.bind(TemporalNow) as () => string;
    const originalPlainDateTimeISO = TemporalNow.plainDateTimeISO.bind(TemporalNow) as (
      tzLike?: string
    ) => TemporalPlainDateTime;
    const originalPlainDateISO = TemporalNow.plainDateISO.bind(TemporalNow) as (
      tzLike?: string
    ) => TemporalPlainDate;
    const originalPlainTimeISO = TemporalNow.plainTimeISO.bind(TemporalNow) as (
      tzLike?: string
    ) => TemporalPlainTime;
    const originalZonedDateTimeISO = TemporalNow.zonedDateTimeISO.bind(TemporalNow) as (
      tzLike?: string
    ) => TemporalZonedDateTime;

    const temporalNowObj = TemporalNow as unknown as object;

    installOverride(temporalNowObj, "timeZoneId", function (): string {
      if (spoofingEnabled && timezoneData) {
        return timezoneData.identifier;
      }
      return originalTimeZoneId();
    });

    installOverride(
      temporalNowObj,
      "plainDateTimeISO",
      function (tzLike?: string): TemporalPlainDateTime {
        if (spoofingEnabled && timezoneData && tzLike === undefined) {
          return originalPlainDateTimeISO(timezoneData.identifier);
        }
        return originalPlainDateTimeISO(tzLike);
      }
    );

    installOverride(temporalNowObj, "plainDateISO", function (tzLike?: string): TemporalPlainDate {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return originalPlainDateISO(timezoneData.identifier);
      }
      return originalPlainDateISO(tzLike);
    });

    installOverride(temporalNowObj, "plainTimeISO", function (tzLike?: string): TemporalPlainTime {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return originalPlainTimeISO(timezoneData.identifier);
      }
      return originalPlainTimeISO(tzLike);
    });

    installOverride(
      temporalNowObj,
      "zonedDateTimeISO",
      function (tzLike?: string): TemporalZonedDateTime {
        if (spoofingEnabled && timezoneData && tzLike === undefined) {
          return originalZonedDateTimeISO(timezoneData.identifier);
        }
        return originalZonedDateTimeISO(tzLike);
      }
    );

    // ── Temporal.ZonedDateTime.prototype getter overrides ──────────────
    // Previously quantized sub-minute offsets to whole minutes. Now that
    // getTimezoneOffset returns exact fractional values (matching native),
    // we pass through the native nanosecond values untouched. The overrides
    // are kept only for function masking (toString returns [native code]).

    const ZDTProto = (Temporal as unknown as TemporalNamespace).ZonedDateTime.prototype;

    const origOffsetNsDesc = Object.getOwnPropertyDescriptor(ZDTProto, "offsetNanoseconds");
    const origOffsetDesc = Object.getOwnPropertyDescriptor(ZDTProto, "offset");

    if (origOffsetNsDesc?.get) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origOffsetNsGetter = origOffsetNsDesc.get;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offsetNanosecondsGetter = function (this: any): number {
        try {
          return origOffsetNsGetter.call(this) as number;
        } catch {
          return origOffsetNsGetter.call(this) as number;
        }
      };

      registerOverride(offsetNanosecondsGetter, "get offsetNanoseconds");
      disguiseAsNative(offsetNanosecondsGetter, "get offsetNanoseconds", 0);

      Object.defineProperty(ZDTProto, "offsetNanoseconds", {
        get: offsetNanosecondsGetter,
        configurable: origOffsetNsDesc.configurable,
        enumerable: origOffsetNsDesc.enumerable,
      });
    }

    if (origOffsetDesc?.get) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origOffsetGetter = origOffsetDesc.get;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offsetGetter = function (this: any): string {
        try {
          return origOffsetGetter.call(this) as string;
        } catch {
          return origOffsetGetter.call(this) as string;
        }
      };

      registerOverride(offsetGetter, "get offset");
      disguiseAsNative(offsetGetter, "get offset", 0);

      Object.defineProperty(ZDTProto, "offset", {
        get: offsetGetter,
        configurable: origOffsetDesc.configurable,
        enumerable: origOffsetDesc.enumerable,
      });
    }
  } catch {
    // Temporal API override failed — originals remain in place
  }
}
