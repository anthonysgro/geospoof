/**
 * Temporal API overrides.
 *
 * Feature-detects the Temporal API and overrides `Temporal.Now` methods
 * to return the spoofed timezone when enabled. No-ops gracefully if
 * Temporal is unavailable.
 *
 * Exposes two entry points:
 *   - `installTemporalOverrides()` — installs on the top-level realm,
 *     closing the document_start race via the bootstrap seed hook.
 *   - `installTemporalOverridesOn(temporalNs, opts)` — realm-parameterized
 *     installer. The iframe patcher calls this against each same-origin
 *     iframe realm, so the top-level and iframe realms share ONE
 *     implementation and cannot drift apart.
 */

import { spoofingEnabled, timezoneData } from "./state";
import { installOverride, installScrubbedAccessor } from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Install `Temporal.Now` + `Temporal.ZonedDateTime` overrides on the
 * supplied Temporal namespace.
 *
 * `Now.timeZoneId()` returns the spoofed identifier; every
 * `plain*ISO` / `zonedDateTimeISO` method substitutes the spoofed zone
 * only when no explicit timezone argument was provided. The
 * `ZonedDateTime.prototype` offset getters are passthroughs kept for
 * function masking (toString returns `[native code]`) and wrapped so a
 * foreign-`this` brand-check throw has our injected frames scrubbed.
 *
 * `opts.seed` is an optional per-call hook run at the top of each `Now`
 * method — the top-level realm passes `seedFromBootstrap` to close the
 * document_start race; iframe realms are patched after bootstrap so they
 * omit it (behavior-preserving for that aspect).
 */
export function installTemporalOverridesOn(
  temporalNs: NonNullable<typeof Temporal>,
  opts?: { seed?: () => void }
): void {
  const seed = opts?.seed;

  try {
    // Temporal is feature-detected at runtime; cast through unknown to satisfy
    // strict type-checking since the eslint TS parser cannot resolve the ambient
    // Temporal declarations inside this IIFE.

    const TemporalNow: TemporalNow = temporalNs.Now;

    const originalTimeZoneId = TemporalNow.timeZoneId.bind(TemporalNow);
    const originalPlainDateTimeISO = TemporalNow.plainDateTimeISO.bind(TemporalNow);
    const originalPlainDateISO = TemporalNow.plainDateISO.bind(TemporalNow);
    const originalPlainTimeISO = TemporalNow.plainTimeISO.bind(TemporalNow);
    const originalZonedDateTimeISO = TemporalNow.zonedDateTimeISO.bind(TemporalNow);

    const temporalNowObj = TemporalNow as unknown as object;

    installOverride(temporalNowObj, "timeZoneId", function (): string {
      seed?.();
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
        seed?.();
        if (spoofingEnabled && timezoneData && tzLike === undefined) {
          logger.debug("Temporal.Now.plainDateTimeISO: using spoofed tz", timezoneData.identifier);
          return originalPlainDateTimeISO(timezoneData.identifier);
        }
        return originalPlainDateTimeISO(tzLike);
      }
    );

    installOverride(temporalNowObj, "plainDateISO", function (tzLike?: string): TemporalPlainDate {
      seed?.();
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        logger.debug("Temporal.Now.plainDateISO: using spoofed tz", timezoneData.identifier);
        return originalPlainDateISO(timezoneData.identifier);
      }
      return originalPlainDateISO(tzLike);
    });

    installOverride(temporalNowObj, "plainTimeISO", function (tzLike?: string): TemporalPlainTime {
      seed?.();
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
        seed?.();
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

    const ZDTProto = temporalNs.ZonedDateTime.prototype;

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

/**
 * Install Temporal.Now overrides on the top-level realm if the Temporal
 * API is available. Called by index.ts during initialization.
 */
export function installTemporalOverrides(): void {
  if (typeof Temporal === "undefined") {
    return;
  }
  installTemporalOverridesOn(Temporal, {
    seed: seedFromBootstrap,
  });
}
