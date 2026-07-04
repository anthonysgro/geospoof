/**
 * Temporal API overrides.
 *
 * Feature-detects the Temporal API and overrides `Temporal.Now` methods
 * to return the spoofed timezone when enabled. No-ops gracefully if
 * Temporal is unavailable.
 */

import { spoofingEnabled, timezoneData } from "./state";
import { installOverride, installScrubbedAccessor } from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

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

    const TemporalNow: TemporalNow = Temporal.Now;

    const originalTimeZoneId = TemporalNow.timeZoneId.bind(TemporalNow);
    const originalPlainDateTimeISO = TemporalNow.plainDateTimeISO.bind(TemporalNow);
    const originalPlainDateISO = TemporalNow.plainDateISO.bind(TemporalNow);
    const originalPlainTimeISO = TemporalNow.plainTimeISO.bind(TemporalNow);
    const originalZonedDateTimeISO = TemporalNow.zonedDateTimeISO.bind(TemporalNow);

    const temporalNowObj = TemporalNow as unknown as object;

    installOverride(temporalNowObj, "timeZoneId", function (): string {
      seedFromBootstrap();
      if (spoofingEnabled && timezoneData) {
        logger.debug("Temporal.Now.timeZoneId: returning spoofed", timezoneData.identifier);
        return timezoneData.identifier;
      }
      return originalTimeZoneId();
    });

    installOverride(
      temporalNowObj,
      "plainDateTimeISO",
      function (tzLike?: string): TemporalPlainDateTime {
        seedFromBootstrap();
        if (spoofingEnabled && timezoneData && tzLike === undefined) {
          logger.debug("Temporal.Now.plainDateTimeISO: using spoofed tz", timezoneData.identifier);
          return originalPlainDateTimeISO(timezoneData.identifier);
        }
        return originalPlainDateTimeISO(tzLike);
      }
    );

    installOverride(temporalNowObj, "plainDateISO", function (tzLike?: string): TemporalPlainDate {
      seedFromBootstrap();
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        logger.debug("Temporal.Now.plainDateISO: using spoofed tz", timezoneData.identifier);
        return originalPlainDateISO(timezoneData.identifier);
      }
      return originalPlainDateISO(tzLike);
    });

    installOverride(temporalNowObj, "plainTimeISO", function (tzLike?: string): TemporalPlainTime {
      seedFromBootstrap();
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        logger.debug("Temporal.Now.plainTimeISO: using spoofed tz", timezoneData.identifier);
        return originalPlainTimeISO(timezoneData.identifier);
      }
      return originalPlainTimeISO(tzLike);
    });

    installOverride(
      temporalNowObj,
      "zonedDateTimeISO",
      function (tzLike?: string): TemporalZonedDateTime {
        seedFromBootstrap();
        if (spoofingEnabled && timezoneData && tzLike === undefined) {
          logger.debug("Temporal.Now.zonedDateTimeISO: using spoofed tz", timezoneData.identifier);
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

    const ZDTProto = Temporal.ZonedDateTime.prototype;

    const origOffsetNsDesc = Object.getOwnPropertyDescriptor(ZDTProto, "offsetNanoseconds");
    const origOffsetDesc = Object.getOwnPropertyDescriptor(ZDTProto, "offset");

    // These getters are passthroughs kept only for function masking (offset
    // values are already native-correct). `installScrubbedAccessor` wraps them
    // so a foreign-`this` brand-check throw has our injected frames scrubbed.
    if (origOffsetNsDesc?.get) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origOffsetNsGetter = origOffsetNsDesc.get;
      installScrubbedAccessor(ZDTProto, "offsetNanoseconds", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: function (this: any): number {
          return origOffsetNsGetter.call(this) as number;
        },
      });
    }

    if (origOffsetDesc?.get) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origOffsetGetter = origOffsetDesc.get;
      installScrubbedAccessor(ZDTProto, "offset", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: function (this: any): string {
          return origOffsetGetter.call(this) as string;
        },
      });
    }
  } catch {
    // Temporal API override failed — originals remain in place
  }
}
