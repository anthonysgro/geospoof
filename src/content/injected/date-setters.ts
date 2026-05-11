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
 * Install Date setter overrides on `Date.prototype`.
 *
 * Must run after `date-getters.ts` so the read path used for component
 * preservation in multi-argument calls is already in place (the spoofed
 * getters are what `preserveCurrent*` calls below go through).
 */
export function installDateSetterOverrides(): void {
  // ── setHours(h, m?, s?, ms?) ─────────────────────────────────────────
  try {
    installOverride(
      Date.prototype,
      "setHours",
      function (this: Date, h?: number, m?: number, s?: number, ms?: number): number {
        try {
          if (!spoofingEnabled || !timezoneData) {
            return originalSetHours.call(this, h as number, m as number, s as number, ms as number);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) {
            // Date is already NaN — native behaviour is to stay NaN.
            return NaN;
          }
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return originalSetHours.call(this, h as number, m as number, s as number, ms as number);
          }
          // Preserve components per spec: omitted arguments keep the
          // current spoofed-zone value (h replaces HourFromTime, m?
          // replaces MinFromTime, etc.).
          const newHour = toSetterNumber(h);

          const newMinute = arguments.length >= 2 ? toSetterNumber(m) : parts.minute;

          const newSecond = arguments.length >= 3 ? toSetterNumber(s) : parts.second;
          const newMs =
            arguments.length >= 4 ? toSetterNumber(ms) : originalGetMilliseconds.call(this);
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
          originalSetTime.call(this, newEpoch);
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
          return originalSetHours.call(this, h as number, m as number, s as number, ms as number);
        }
      },
      // Native arity
      4
    );
  } catch (error) {
    logger.error("Failed to override Date.setHours:", error);
  }

  // ── setMinutes(m, s?, ms?) ───────────────────────────────────────────
  try {
    installOverride(
      Date.prototype,
      "setMinutes",
      function (this: Date, m?: number, s?: number, ms?: number): number {
        try {
          if (!spoofingEnabled || !timezoneData) {
            return originalSetMinutes.call(this, m as number, s as number, ms as number);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return originalSetMinutes.call(this, m as number, s as number, ms as number);
          }
          const newMinute = toSetterNumber(m);

          const newSecond = arguments.length >= 2 ? toSetterNumber(s) : parts.second;
          const newMs =
            arguments.length >= 3 ? toSetterNumber(ms) : originalGetMilliseconds.call(this);
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
          originalSetTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setMinutes override:", error);
          return originalSetMinutes.call(this, m as number, s as number, ms as number);
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
      Date.prototype,
      "setSeconds",
      function (this: Date, s?: number, ms?: number): number {
        try {
          if (!spoofingEnabled || !timezoneData) {
            return originalSetSeconds.call(this, s as number, ms as number);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return originalSetSeconds.call(this, s as number, ms as number);
          }
          const newSecond = toSetterNumber(s);
          const newMs =
            arguments.length >= 2 ? toSetterNumber(ms) : originalGetMilliseconds.call(this);
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
          originalSetTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setSeconds override:", error);
          return originalSetSeconds.call(this, s as number, ms as number);
        }
      },
      2
    );
  } catch (error) {
    logger.error("Failed to override Date.setSeconds:", error);
  }

  // ── setDate(d) ───────────────────────────────────────────────────────
  try {
    installOverride(Date.prototype, "setDate", function (this: Date, d?: number): number {
      try {
        if (!spoofingEnabled || !timezoneData) {
          return originalSetDate.call(this, d as number);
        }
        const epoch = this.getTime();
        if (isNaN(epoch)) return NaN;
        const parts = resolvePartsForDate(this, timezoneData.identifier);
        if (!parts) {
          return originalSetDate.call(this, d as number);
        }
        const newDay = toSetterNumber(d);
        const newEpoch = composeUtcFromSpoofedLocal(
          parts.year,
          parts.month - 1,
          newDay,
          parts.hour,
          parts.minute,
          parts.second,
          originalGetMilliseconds.call(this),
          timezoneData.identifier,
          timezoneData.offset
        );
        originalSetTime.call(this, newEpoch);
        return newEpoch;
      } catch (error) {
        logger.error("Error in setDate override:", error);
        return originalSetDate.call(this, d as number);
      }
    });
  } catch (error) {
    logger.error("Failed to override Date.setDate:", error);
  }

  // ── setMonth(m, d?) ──────────────────────────────────────────────────
  try {
    installOverride(
      Date.prototype,
      "setMonth",
      function (this: Date, m?: number, d?: number): number {
        try {
          if (!spoofingEnabled || !timezoneData) {
            return originalSetMonth.call(this, m as number, d as number);
          }
          const epoch = this.getTime();
          if (isNaN(epoch)) return NaN;
          const parts = resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return originalSetMonth.call(this, m as number, d as number);
          }
          const newMonth = toSetterNumber(m);

          const newDay = arguments.length >= 2 ? toSetterNumber(d) : parts.day;
          const newEpoch = composeUtcFromSpoofedLocal(
            parts.year,
            newMonth,
            newDay,
            parts.hour,
            parts.minute,
            parts.second,
            originalGetMilliseconds.call(this),
            timezoneData.identifier,
            timezoneData.offset
          );
          originalSetTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setMonth override:", error);
          return originalSetMonth.call(this, m as number, d as number);
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
      Date.prototype,
      "setFullYear",
      function (this: Date, y?: number, m?: number, d?: number): number {
        try {
          if (!spoofingEnabled || !timezoneData) {
            return originalSetFullYear.call(this, y as number, m as number, d as number);
          }
          const epoch = this.getTime();
          // Spec quirk: setFullYear on a NaN date starts from epoch 0
          // (1970-01-01T00:00:00Z in UTC). Match that.
          const parts = isNaN(epoch)
            ? resolvePartsForDate(new OriginalDate(0), timezoneData.identifier)
            : resolvePartsForDate(this, timezoneData.identifier);
          if (!parts) {
            return originalSetFullYear.call(this, y as number, m as number, d as number);
          }
          const ms = isNaN(epoch) ? 0 : originalGetMilliseconds.call(this);
          const newYear = toSetterNumber(y);

          const newMonth = arguments.length >= 2 ? toSetterNumber(m) : parts.month - 1;

          const newDay = arguments.length >= 3 ? toSetterNumber(d) : parts.day;
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
          originalSetTime.call(this, newEpoch);
          return newEpoch;
        } catch (error) {
          logger.error("Error in setFullYear override:", error);
          return originalSetFullYear.call(this, y as number, m as number, d as number);
        }
      },
      3
    );
  } catch (error) {
    logger.error("Failed to override Date.setFullYear:", error);
  }
}
