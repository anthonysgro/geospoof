/**
 * Date setter overrides.
 *
 * The component getters (`getHours`, `getMinutes`, `getDate`, ...) all
 * re-derive their result in the spoofed zone. Without matching setter
 * overrides, the pair is inconsistent: `setHours(H)` writes to the
 * underlying epoch as if `H` were in the real system zone, but
 * `getHours()` reads it back in the spoofed zone — the result of the
 * read disagrees with the value just written.
 *
 * This module overrides `setHours`, `setMinutes`, `setSeconds`,
 * `setDate`, `setMonth`, and `setFullYear` to interpret their
 * arguments in the spoofed zone, so set/get round-trips agree. The
 * multi-argument forms (`setHours(h, m?, s?, ms?)`, etc.) preserve the
 * same "keep current component when argument is omitted" semantics as
 * the native setters, but "current" is resolved in the spoofed zone.
 *
 * `setMilliseconds` is timezone-independent, so we don't override it —
 * the native setter already round-trips against our passthrough
 * `getMilliseconds`. `setTime` is an absolute UTC epoch write with no
 * timezone interpretation; it's also left native.
 *
 * Exposes two entry points:
 *   - `installDateSetterOverrides()` — installs on the top-level
 *     `Date.prototype` using the originals captured in `state.ts`.
 *   - `installDateSetterOverridesOn(proto, originals)` — installs on an
 *     arbitrary `Date.prototype` using a caller-supplied originals bag.
 *     Called by the iframe patcher against each same-origin iframe's
 *     Date.prototype so the iframe-realm setters match the top-level
 *     semantics.
 *
 * DST safety: the spoofed-offset estimate is refined against the final
 * UTC instant using the same two-pass pattern as
 * `computeEpochAdjustment` in `timezone-helpers.ts`.
 */

import {
  spoofingEnabled,
  timezoneData,
  OriginalDate,
  originalGetMilliseconds,
  originalSetHours,
  originalSetMinutes,
  originalSetSeconds,
  originalSetDate,
  originalSetMonth,
  originalSetFullYear,
  originalSetTime,
} from "./state";
import { installOverride } from "./function-masking";
import { resolvePartsForDate, getIntlBasedOffset } from "./timezone-helpers";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Bag of original `Date.prototype` setter references for a single realm.
 *
 * The spoofed setters delegate to these in three situations:
 *   1. Spoofing disabled — direct passthrough to the native setter.
 *   2. Offset resolution failed — fall through so the Date keeps the
 *      semantics native would have produced.
 *   3. Our handler threw — defensive fall through.
 *
 * `setTime` is included because the spoofed setter path uses it as the
 * final "commit" step (writing the computed UTC epoch into the Date's
 * internal `[[DateValue]]`). Capturing it in the originals bag means
 * the top-level spoofed setter uses the top-level native setTime and
 * an iframe-realm spoofed setter uses the iframe's native setTime — no
 * cross-realm call on the write path.
 *
 * `getMilliseconds` is here so the "keep current ms when the caller
 * omits it" branch of the spec-defined multi-arg setter semantics can
 * read through THAT realm's native getter rather than the top-level's.
 */
export interface DateSetterOriginals {
  setHours: (this: Date, h: number, m?: number, s?: number, ms?: number) => number;
  setMinutes: (this: Date, m: number, s?: number, ms?: number) => number;
  setSeconds: (this: Date, s: number, ms?: number) => number;
  setDate: (this: Date, d: number) => number;
  setMonth: (this: Date, m: number, d?: number) => number;
  setFullYear: (this: Date, y: number, m?: number, d?: number) => number;
  setTime: (this: Date, epoch: number) => number;
  getMilliseconds: (this: Date) => number;
}

/**
 * Compute the UTC epoch that, when interpreted in the spoofed zone,
 * yields the given wall-clock components. Refines the zone offset
 * against the final instant to absorb DST transitions.
 *
 * @param year   Full year (e.g. 2026). Years in the range [0, 99] are
 *   treated as literal years (not 1900 + year) to match native
 *   `Date.prototype.setFullYear` semantics, which differ from
 *   `Date.UTC`'s two-digit adjustment.
 * @param month  0-indexed month (0 = January, 11 = December)
 * @param day    Day of month (1-31)
 * @param hour   Hour (0-23)
 * @param minute Minute (0-59)
 * @param second Second (0-59)
 * @param ms     Millisecond (0-999)
 * @param timezoneId  IANA spoofed zone identifier
 * @param fallbackOffset  Fallback offset in minutes east of UTC
 * @returns the UTC epoch in milliseconds
 */
function composeUtcFromSpoofedLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezoneId: string,
  fallbackOffset: number
): number {
  // If any component is non-finite, propagate NaN (matches native setter
  // behaviour — setHours(undefined) on native yields a NaN epoch).
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    !Number.isFinite(ms)
  ) {
    return NaN;
  }

  // Step 1: rawUtc is the UTC epoch corresponding to the given wall-clock
  // components if the zone were UTC.
  //
  // `Date.UTC(year, ...)` applies a 1900+year adjustment when year is in
  // [0, 99]. `setFullYear` and friends do NOT. To match native setter
  // semantics for the small-year edge case, compute the UTC epoch for a
  // larger year first, then subtract the year delta in full-year
  // increments using setUTCFullYear on an intermediate Date.
  let rawUtc: number;
  if (year >= 0 && year <= 99) {
    const tmp = new OriginalDate(OriginalDate.UTC(2000, month, day, hour, minute, second, ms));
    // setUTCFullYear accepts any integer year without the 1900 adjustment.
    tmp.setUTCFullYear(Math.trunc(year));
    rawUtc = tmp.getTime();
  } else {
    rawUtc = OriginalDate.UTC(year, month, day, hour, minute, second, ms);
  }
  if (!Number.isFinite(rawUtc)) {
    return NaN;
  }

  // Step 2: subtract the spoofed offset to get the actual UTC instant for
  // the same wall-clock components in the spoofed zone.
  const probe1 = new OriginalDate(rawUtc - fallbackOffset * 60000);
  let offset = getIntlBasedOffset(probe1, timezoneId, fallbackOffset);
  let utcEpoch = rawUtc - offset * 60000;

  // Step 3: DST refinement. The offset we just used was an estimate —
  // re-resolve at the computed instant and, if it differs, recompute
  // once more. One refinement suffices for every IANA transition; the
  // spring-forward / fall-back deltas are at most 60 minutes and the
  // same two-pass converges.
  const probe2 = new OriginalDate(utcEpoch);
  const refined = getIntlBasedOffset(probe2, timezoneId, fallbackOffset);
  if (refined !== offset) {
    offset = refined;
    utcEpoch = rawUtc - offset * 60000;
  }

  return utcEpoch;
}

/** Convert an argument to a number the same way the spec's ToNumber step does. */
function toSetterNumber(value: unknown): number {
  return Number(value);
}

/**
 * Forward a setter passthrough using the caller's original arguments.
 *
 * Using `.apply` with the exact arity the caller supplied avoids the
 * "present undefined coerces to NaN" footgun that poisons the Date
 * when trailing optional args aren't forwarded as they were received.
 * For example, `date.setHours(7)` must forward as arity-1, not
 * arity-4 with three `undefined`s — native reads absent args as "keep
 * current component" but a present `undefined` as NaN.
 */
function passthrough(
  fn: (this: Date, ...args: never[]) => number,
  self: Date,
  args: IArguments
): number {
  // Cast to a broad apply signature so TypeScript accepts the
  // variadic-arity forward (native setters require at least one
  // typed arg in their declaration, but here we may forward zero).
  const applyable = fn as unknown as {
    apply(this: unknown, self: unknown, args: unknown): number;
  };
  return applyable.apply(self, args);
}

/**
 * Install Date setter overrides on the supplied `Date.prototype`.
 *
 * Shared by `installDateSetterOverrides()` (top level) and the iframe
 * patcher (per iframe realm).
 */
export function installDateSetterOverridesOn(proto: object, originals: DateSetterOriginals): void {
  // ── setHours(h, m?, s?, ms?) ─────────────────────────────────────────
  try {
    installOverride(
      proto,
      "setHours",
      function (this: Date, h?: number, m?: number, s?: number, ms?: number): number {
        // Forward only as many arguments as the caller supplied. Native
        // setters interpret omitted trailing args as "keep current"; a
        // present `undefined` coerces to NaN and poisons the Date value.
        // eslint-disable-next-line prefer-rest-params
        const argsIn = arguments;
        try {
          if (!spoofingEnabled || !timezoneData) {
            return passthrough(originals.setHours, this, argsIn);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) {
            return NaN;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return passthrough(originals.setHours, this, argsIn);
          }
          const newHour = toSetterNumber(h);
          const newMinute = argsIn.length >= 2 ? toSetterNumber(m) : parts.minute;
          const newSecond = argsIn.length >= 3 ? toSetterNumber(s) : parts.second;
          const newMs =
            argsIn.length >= 4 ? toSetterNumber(ms) : originals.getMilliseconds.call(this);
          const newEpoch = composeUtcFromSpoofedLocal(
            parts.year,
            parts.month - 1,
            parts.day,
            newHour,
            newMinute,
            newSecond,
            newMs,
            timezoneData.identifier,
            timezoneData.offset
          );
          originals.setTime.call(this, newEpoch);
          logger.trace("setHours: spoofed write", {
            from: epoch,
            to: newEpoch,
            h: newHour,
            m: newMinute,
            s: newSecond,
            ms: newMs,
          });
          return newEpoch;
        } catch (error) {
          logger.error("Error in setHours override:", error);
          return passthrough(originals.setHours, this, argsIn);
        }
      },
      4
    );
  } catch (error) {
    logger.error("Failed to override Date.setHours:", error);
  }

  // ── setMinutes(m, s?, ms?) ───────────────────────────────────────────
  try {
    installOverride(
      proto,
      "setMinutes",
      function (this: Date, m?: number, s?: number, ms?: number): number {
        // eslint-disable-next-line prefer-rest-params
        const argsIn = arguments;
        try {
          if (!spoofingEnabled || !timezoneData) {
            return passthrough(originals.setMinutes, this, argsIn);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return passthrough(originals.setMinutes, this, argsIn);
          }
          const newMinute = toSetterNumber(m);
          const newSecond = argsIn.length >= 2 ? toSetterNumber(s) : parts.second;
          const newMs =
            argsIn.length >= 3 ? toSetterNumber(ms) : originals.getMilliseconds.call(this);
          const newEpoch = composeUtcFromSpoofedLocal(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            newMinute,
            newSecond,
            newMs,
            timezoneData.identifier,
            timezoneData.offset
          );
          originals.setTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setMinutes override:", error);
          return passthrough(originals.setMinutes, this, argsIn);
        }
      },
      3
    );
  } catch (error) {
    logger.error("Failed to override Date.setMinutes:", error);
  }

  // ── setSeconds(s, ms?) ───────────────────────────────────────────────
  try {
    installOverride(
      proto,
      "setSeconds",
      function (this: Date, s?: number, ms?: number): number {
        // eslint-disable-next-line prefer-rest-params
        const argsIn = arguments;
        try {
          if (!spoofingEnabled || !timezoneData) {
            return passthrough(originals.setSeconds, this, argsIn);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return passthrough(originals.setSeconds, this, argsIn);
          }
          const newSecond = toSetterNumber(s);
          const newMs =
            argsIn.length >= 2 ? toSetterNumber(ms) : originals.getMilliseconds.call(this);
          const newEpoch = composeUtcFromSpoofedLocal(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            newSecond,
            newMs,
            timezoneData.identifier,
            timezoneData.offset
          );
          originals.setTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setSeconds override:", error);
          return passthrough(originals.setSeconds, this, argsIn);
        }
      },
      2
    );
  } catch (error) {
    logger.error("Failed to override Date.setSeconds:", error);
  }

  // ── setDate(d) ───────────────────────────────────────────────────────
  try {
    installOverride(proto, "setDate", function (this: Date, d?: number): number {
      // eslint-disable-next-line prefer-rest-params
      const argsIn = arguments;
      try {
        if (!spoofingEnabled || !timezoneData) {
          return passthrough(originals.setDate, this, argsIn);
        }
        const epoch = this.getTime();
        if (isNaN(epoch)) return NaN;
        const parts = resolvePartsForDate(this, timezoneData.identifier);
        if (!parts) {
          return passthrough(originals.setDate, this, argsIn);
        }
        const newDay = toSetterNumber(d);
        const newEpoch = composeUtcFromSpoofedLocal(
          parts.year,
          parts.month - 1,
          newDay,
          parts.hour,
          parts.minute,
          parts.second,
          originals.getMilliseconds.call(this),
          timezoneData.identifier,
          timezoneData.offset
        );
        originals.setTime.call(this, newEpoch);
        return newEpoch;
      } catch (error) {
        logger.error("Error in setDate override:", error);
        return passthrough(originals.setDate, this, argsIn);
      }
    });
  } catch (error) {
    logger.error("Failed to override Date.setDate:", error);
  }

  // ── setMonth(m, d?) ──────────────────────────────────────────────────
  try {
    installOverride(
      proto,
      "setMonth",
      function (this: Date, m?: number, d?: number): number {
        // eslint-disable-next-line prefer-rest-params
        const argsIn = arguments;
        try {
          if (!spoofingEnabled || !timezoneData) {
            return passthrough(originals.setMonth, this, argsIn);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return passthrough(originals.setMonth, this, argsIn);
          }
          const newMonth = toSetterNumber(m);
          const newDay = argsIn.length >= 2 ? toSetterNumber(d) : parts.day;
          const newEpoch = composeUtcFromSpoofedLocal(
            parts.year,
            newMonth,
            newDay,
            parts.hour,
            parts.minute,
            parts.second,
            originals.getMilliseconds.call(this),
            timezoneData.identifier,
            timezoneData.offset
          );
          originals.setTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setMonth override:", error);
          return passthrough(originals.setMonth, this, argsIn);
        }
      },
      2
    );
  } catch (error) {
    logger.error("Failed to override Date.setMonth:", error);
  }

  // ── setFullYear(y, m?, d?) ───────────────────────────────────────────
  try {
    installOverride(
      proto,
      "setFullYear",
      function (this: Date, y?: number, m?: number, d?: number): number {
        // eslint-disable-next-line prefer-rest-params
        const argsIn = arguments;
        try {
          if (!spoofingEnabled || !timezoneData) {
            return passthrough(originals.setFullYear, this, argsIn);
          }
          const epoch = this.getTime();
          // Spec quirk: setFullYear on a NaN date starts from epoch 0
          // (1970-01-01T00:00:00Z in UTC). Match that.
          const parts = isNaN(epoch)
            ? resolvePartsForDate(new OriginalDate(0), timezoneData.identifier)
            : resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return passthrough(originals.setFullYear, this, argsIn);
          }
          const ms = isNaN(epoch) ? 0 : originals.getMilliseconds.call(this);
          const newYear = toSetterNumber(y);
          const newMonth = argsIn.length >= 2 ? toSetterNumber(m) : parts.month - 1;
          const newDay = argsIn.length >= 3 ? toSetterNumber(d) : parts.day;
          const newEpoch = composeUtcFromSpoofedLocal(
            newYear,
            newMonth,
            newDay,
            parts.hour,
            parts.minute,
            parts.second,
            ms,
            timezoneData.identifier,
            timezoneData.offset
          );
          originals.setTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setFullYear override:", error);
          return passthrough(originals.setFullYear, this, argsIn);
        }
      },
      3
    );
  } catch (error) {
    logger.error("Failed to override Date.setFullYear:", error);
  }
}

/**
 * Install Date setter overrides on the top-level `Date.prototype`.
 *
 * Convenience wrapper for the top-level realm — uses the originals
 * captured at module load in `state.ts`. Must run after
 * `installDateGetterOverrides()` so multi-argument setters that
 * preserve omitted components read through spoofed getters.
 */
export function installDateSetterOverrides(): void {
  installDateSetterOverridesOn(Date.prototype, {
    setHours: originalSetHours,
    setMinutes: originalSetMinutes,
    setSeconds: originalSetSeconds,
    setDate: originalSetDate,
    setMonth: originalSetMonth,
    setFullYear: originalSetFullYear,
    setTime: originalSetTime,
    getMilliseconds: originalGetMilliseconds,
  });
}
