/**
 * Date constructor and Date.parse overrides.
 *
 * Replaces `globalThis.Date` with a spoofing-aware constructor that adjusts
 * epoch values for ambiguous date strings and multi-argument calls. Also
 * overrides `Date.parse` with the same adjustment logic.
 */

import type { AnyFunction } from "./types";
import { OriginalDate, OriginalDateParse, spoofingEnabled, timezoneData } from "./state";
import { isAmbiguousDateString, computeEpochAdjustment } from "./timezone-helpers";
import { registerOverride, disguiseAsNative } from "./function-masking";

/**
 * Install the Date constructor override and Date.parse override.
 *
 * Replaces `globalThis.Date` with a spoofing-aware constructor, copies all
 * static methods, fixes prototype/constructor references, and registers
 * everything for toString masking.
 */
export function installDateConstructor(): void {
  // ── Date constructor override ────────────────────────────────────────

  /**
   * Intercepts string and multi-argument calls, detects ambiguous inputs,
   * and adjusts the resulting epoch by the difference between the real and
   * spoofed UTC offsets. Delegates entirely to OriginalDate when spoofing
   * is disabled or for non-ambiguous inputs.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function DateOverride(this: any, ...args: any[]): any {
    // Called as function (without new) — return current time string
    if (!new.target) {
      return OriginalDate();
    }

    // When spoofing is disabled, delegate entirely to OriginalDate
    if (!spoofingEnabled || !timezoneData) {
      if (args.length === 0) return new OriginalDate();
      if (args.length === 1) return new OriginalDate(args[0] as number | string);
      return new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
    }

    // No arguments — current time
    if (args.length === 0) {
      return new OriginalDate();
    }

    // Single argument
    if (args.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const arg = args[0];

      // Single numeric argument — absolute epoch, no adjustment
      if (typeof arg === "number") {
        return new OriginalDate(arg);
      }

      // Single string argument
      if (typeof arg === "string") {
        try {
          const parsed = new OriginalDate(arg);
          // If unparseable (NaN), return invalid Date as-is
          if (isNaN(parsed.getTime())) {
            return parsed;
          }
          // If ambiguous, apply epoch adjustment
          if (isAmbiguousDateString(arg)) {
            const adjustment = computeEpochAdjustment(
              parsed,
              timezoneData.identifier,
              timezoneData.offset
            );
            return new OriginalDate(parsed.getTime() + adjustment);
          }
          // Explicit timezone string — pass through
          return parsed;
        } catch {
          // Fall back to original behavior on error
          return new OriginalDate(arg);
        }
      }

      // Any other single argument (Date object, null, undefined, boolean, etc.)
      return new OriginalDate(arg as number | string);
    }

    // Multi-argument (2+ numeric): year, month, [day, hours, minutes, seconds, ms]
    try {
      const parsed = new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
      const adjustment = computeEpochAdjustment(
        parsed,
        timezoneData.identifier,
        timezoneData.offset
      );
      return new OriginalDate(parsed.getTime() + adjustment);
    } catch {
      // Fall back to original behavior on error
      return new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
    }
  }

  // ── Date.parse override ──────────────────────────────────────────────

  /**
   * Applies the same ambiguous-string adjustment as the Date constructor
   * override, returning the corrected epoch number.
   */
  const dateParseOverride = (str: string): number => {
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
        return epoch + adjustment;
      }
      // Explicit timezone string — pass through
      return epoch;
    } catch {
      // Fall back to original behavior on error
      return OriginalDateParse(str);
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
  registerOverride(dateParseOverride as unknown as AnyFunction, "parse");
  disguiseAsNative(dateParseOverride as unknown as AnyFunction, "parse", 1);

  // Install Date.parse override
  Object.defineProperty(DateOverride, "parse", {
    value: dateParseOverride,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  // Ensure prototype chain: Object.getPrototypeOf(Date) === Function.prototype
  Object.setPrototypeOf(DateOverride, Function.prototype);

  // Replace global Date constructor
  (globalThis as unknown as Record<string, unknown>).Date =
    DateOverride as unknown as DateConstructor;

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
  registerOverride(
    (DateOverride as unknown as DateConstructor).now as unknown as AnyFunction,
    "now"
  );
  registerOverride(
    (DateOverride as unknown as DateConstructor).UTC as unknown as AnyFunction,
    "UTC"
  );
}
