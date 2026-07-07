/**
 * Date constructor and Date.parse overrides.
 *
 * Replaces a realm's `Date` with a spoofing-aware constructor that adjusts
 * epoch values for ambiguous date strings and multi-argument calls. Also
 * overrides `Date.parse` with the same adjustment logic.
 *
 * Exposes two entry points:
 *   - `installDateConstructor()` — installs on the top-level realm
 *     (`globalThis`), closing the document_start race via the bootstrap
 *     seed hook.
 *   - `installDateConstructorOn(realm)` — realm-parameterized installer.
 *     The iframe patcher calls this against each same-origin iframe
 *     realm, so the top-level and iframe realms share ONE implementation
 *     and cannot drift apart.
 */

import type { AnyFunction } from "./types";
import { OriginalDate as CapturedOriginalDate, spoofingEnabled, timezoneData } from "./state";
import { isAmbiguousDateString, computeEpochAdjustment } from "./timezone-helpers";
import {
  registerOverride,
  disguiseAsNative,
  stripExtensionFramesFromStack,
} from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * A realm's Date environment. `target` is the global object whose `Date`
 * property gets replaced (`globalThis` for the top-level realm, the iframe
 * window for iframe realms); `originalDate` is that realm's native `Date`
 * constructor captured before the swap; `functionProto` is that realm's
 * `Function.prototype` (so `Object.getPrototypeOf(Date)` matches native);
 * `seed` is an optional per-call hook run at the top of the constructor —
 * the top-level realm passes `seedFromBootstrap` to close the
 * document_start race, iframe realms are patched after bootstrap so they
 * omit it.
 */
export interface DateConstructorRealm {
  target: object;
  originalDate: DateConstructor;
  functionProto: object;
  seed?: () => void;
}

/**
 * Install the Date constructor + Date.parse overrides on the supplied
 * realm. Replaces `realm.target.Date` with a spoofing-aware constructor,
 * copies all static methods, fixes prototype/constructor references, and
 * registers everything for toString masking.
 */
export function installDateConstructorOn(realm: DateConstructorRealm): void {
  const { target, functionProto } = realm;
  const seed = realm.seed;
  // The realm's native Date + Date.parse, captured before the swap. Named
  // `OriginalDate` locally so the shared body below reads identically for
  // every realm.
  const OriginalDate = realm.originalDate;
  const OriginalDateParse = OriginalDate.parse.bind(OriginalDate);

  // ── Date constructor override ────────────────────────────────────────

  /**
   * Intercepts string and multi-argument calls, detects ambiguous inputs,
   * and adjusts the resulting epoch by the difference between the real and
   * spoofed UTC offsets. Delegates entirely to OriginalDate when spoofing
   * is disabled or for non-ambiguous inputs.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function DateOverride(this: any, ...args: any[]): any {
    // Scrub our injected frames from any native throw (e.g. `new Date(Symbol())`
    // / BigInt coercion) so the extension id can't be read off the stack. This
    // raw constructor bypasses the stripConstruct scrub net (a constructor can't
    // be a method-shorthand), so the scrub lives inline here.
    try {
      // Close the document_start race for `new Date()` snapshots taken in the
      // page's first script — seed from the early bootstrap global if present
      // (Firefox). No-op once seeded or once the settings event has arrived.
      // Iframe realms pass no seed (patched after bootstrap).
      seed?.();

      // Capture new.target so subclassing / Reflect.construct preserve the
      // caller's prototype (native fidelity). Undefined ⇒ called without `new`.
      const nt: AnyFunction | undefined = new.target as AnyFunction | undefined;

      // Called as function (without new) — return current time string.
      //
      // Native `Date()` returns a string of the current time formatted
      // in the SYSTEM timezone. If we passed through to the native we'd
      // produce a system-zone string here while `new Date().toString()`
      // produces a SPOOFED-zone string (because the instance's
      // `.toString()` goes through our overridden Date.prototype.toString).
      //
      // That inconsistency is detectable: CreepJS's `valid.date` check
      // compares `new Date() == Date()`, and the two sides coerce to
      // strings with different timezone labels when system ≠ spoofed.
      //
      // Fix: construct a pristine instance and stringify it through the
      // same prototype chain that `new Date()` uses — our spoofed
      // toString formats in the spoofed zone, so both sides agree.
      if (!nt) {
        if (!spoofingEnabled || !timezoneData) {
          return OriginalDate();
        }
        return new OriginalDate().toString();
      }

      // Construct through `new.target` so `class X extends Date {}` and
      // `Reflect.construct(Date, args, X)` yield an instance with X.prototype,
      // exactly like native. For the ordinary `new Date(...)` case nt is
      // DateOverride itself, whose prototype IS OriginalDate.prototype — so the
      // result is identical to `new OriginalDate(...)`.
      const construct = (ctorArgs: ReadonlyArray<unknown>): object =>
        Reflect.construct(
          OriginalDate as unknown as new (...a: unknown[]) => object,
          ctorArgs,
          nt as unknown as new (...a: unknown[]) => object
        );

      // When spoofing is disabled, delegate (still honoring new.target).
      if (!spoofingEnabled || !timezoneData) {
        return construct(args);
      }

      // No arguments — current time
      if (args.length === 0) {
        return construct([]);
      }

      // Single argument
      if (args.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const arg = args[0];

        // Single numeric argument — absolute epoch, no adjustment
        if (typeof arg === "number") {
          return construct([arg]);
        }

        // Single string argument
        if (typeof arg === "string") {
          try {
            const parsed = new OriginalDate(arg);
            // If unparseable (NaN), construct an invalid Date (with nt.prototype)
            if (isNaN(parsed.getTime())) {
              return construct([arg]);
            }
            // If ambiguous, apply epoch adjustment
            if (isAmbiguousDateString(arg)) {
              const adjustment = computeEpochAdjustment(
                parsed,
                timezoneData.identifier,
                timezoneData.offset
              );
              logger.trace("Date constructor (string): epoch adjustment", {
                input: arg,
                adjustment,
                original: parsed.getTime(),
                adjusted: parsed.getTime() + adjustment,
              });
              return construct([parsed.getTime() + adjustment]);
            }
            // Explicit timezone string — pass through
            return construct([arg]);
          } catch {
            // Fall back to original behavior on error
            return construct([arg]);
          }
        }

        // Any other single argument (Date object, null, undefined, boolean, etc.)
        return construct([arg]);
      }

      // Multi-argument (2+): year, month, [day, hours, minutes, seconds, ms]
      const multiArgs: ReadonlyArray<unknown> = [
        args[0],
        args[1],
        args[2] ?? 1,
        args[3] ?? 0,
        args[4] ?? 0,
        args[5] ?? 0,
        args[6] ?? 0,
      ];
      try {
        const parsed = Reflect.construct(
          OriginalDate as unknown as new (...a: unknown[]) => object,
          multiArgs
        ) as Date;
        const adjustment = computeEpochAdjustment(
          parsed,
          timezoneData.identifier,
          timezoneData.offset
        );
        logger.trace("Date constructor (multi-arg): epoch adjustment", {
          input: args,
          adjustment,
          original: parsed.getTime(),
          adjusted: parsed.getTime() + adjustment,
        });
        return construct([parsed.getTime() + adjustment]);
      } catch {
        // Fall back to original behavior on error
        return construct(multiArgs);
      }
    } catch (err) {
      stripExtensionFramesFromStack(err);
      throw err;
    }
  }

  // ── Date.parse override ──────────────────────────────────────────────

  /**
   * Applies the same ambiguous-string adjustment as the Date constructor
   * override, returning the corrected epoch number.
   */
  const dateParseOverride = (str: string): number => {
    try {
      // When spoofing is disabled, delegate entirely to OriginalDateParse
      if (!spoofingEnabled || !timezoneData) {
        return OriginalDateParse(str);
      }

      try {
        const epoch = OriginalDateParse(str);
        // If unparseable, return NaN
        if (isNaN(epoch)) {
          return NaN;
        }
        // If ambiguous, apply epoch adjustment
        if (isAmbiguousDateString(str)) {
          const parsed = new OriginalDate(epoch);
          const adjustment = computeEpochAdjustment(
            parsed,
            timezoneData.identifier,
            timezoneData.offset
          );
          logger.trace("Date.parse: epoch adjustment", {
            input: str,
            adjustment,
            original: epoch,
            adjusted: epoch + adjustment,
          });
          return epoch + adjustment;
        }
        // Explicit timezone string — pass through
        return epoch;
      } catch {
        // Fall back to original behavior on error
        return OriginalDateParse(str);
      }
    } catch (err) {
      stripExtensionFramesFromStack(err);
      throw err;
    }
  };

  // ── Install Date constructor override and preserve static methods/prototype ──

  // Set prototype for instanceof preservation
  DateOverride.prototype = OriginalDate.prototype;

  // Fix name property: "DateOverride" → "Date"
  Object.defineProperty(DateOverride, "name", {
    value: "Date",
    configurable: true,
    enumerable: false,
    writable: false,
  });

  // Fix length property to match native Date.length (7)
  Object.defineProperty(DateOverride, "length", {
    value: 7,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  // Copy ALL own properties from OriginalDate (UTC, now, etc.)
  const skipProps = new Set(["prototype", "name", "length", "parse"]);
  for (const prop of Object.getOwnPropertyNames(OriginalDate)) {
    if (skipProps.has(prop)) continue;
    const desc = Object.getOwnPropertyDescriptor(OriginalDate, prop);
    if (desc) {
      Object.defineProperty(DateOverride, prop, desc);
    }
  }

  // Disguise dateParseOverride BEFORE installing it on DateOverride
  registerOverride(dateParseOverride, "parse");
  disguiseAsNative(dateParseOverride, "parse", 1);

  // Install Date.parse override
  Object.defineProperty(DateOverride, "parse", {
    value: dateParseOverride,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  // Ensure prototype chain: Object.getPrototypeOf(Date) === Function.prototype
  Object.setPrototypeOf(DateOverride, functionProto);

  // Replace the realm's Date constructor
  (target as unknown as Record<string, unknown>).Date = DateOverride as unknown;

  // Fix constructor reference: Date.prototype.constructor === Date
  Object.defineProperty(OriginalDate.prototype, "constructor", {
    value: DateOverride,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  // Register overrides for toString masking
  registerOverride(DateOverride as AnyFunction, "Date");
  // Register static methods — fingerprinters check Date.now.toString() after the constructor swap
  registerOverride((DateOverride as unknown as DateConstructor).now, "now");
  registerOverride((DateOverride as unknown as DateConstructor).UTC, "UTC");
}

/**
 * Install the Date constructor + Date.parse overrides on the top-level
 * realm (`globalThis`), passing the bootstrap seed hook to close the
 * document_start race.
 */
export function installDateConstructor(): void {
  installDateConstructorOn({
    target: globalThis,
    originalDate: CapturedOriginalDate,
    functionProto: Function.prototype,
    seed: seedFromBootstrap,
  });
}
