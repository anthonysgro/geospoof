/**
 * Cross-method offset consistency across historical dates.
 *
 * The single highest-signal regression test in the fingerprinting
 * playbook: for a given instant, every independent offset-resolution
 * surface in the engine should report the same UTC offset. A
 * spoofing extension that overrides one surface but forgets another
 * produces a mismatch that any fingerprinter can one-line detect
 * by cross-checking two methods.
 *
 * Ported (conceptually) from arkenfox/TZP's `get_timezone_offsets`,
 * condensed to 6 distinct surfaces rather than TZP's 10 (we drop
 * the redundant coercion paths — `valueOf`, `Symbol.toPrimitive`,
 * and `getTime` all share the same underlying C++ epoch, so
 * testing one covers all three).
 *
 * Methods under test per date:
 *
 *   1. `Date.prototype.getTimezoneOffset()` — direct method
 *   2. Epoch arithmetic — `date.getTime() - Date.UTC(...)`
 *   3. `Date.parse` — parser path for ambiguous ISO strings
 *   4. `Intl.DateTimeFormat` with `timeZoneName: "short"` — Intl path
 *   5. Component arithmetic — `getUTCHours` vs `getHours` differential
 *   6. `Temporal.Now.zonedDateTimeISO().offsetNanoseconds` at a
 *      historical instant (feature-gated — skipped when Temporal
 *      isn't available)
 *
 * Dates tested (4 years × 2 seasons):
 *
 *   - 2025-01-15, 2025-07-15 — modern, strict equality
 *   - 1976-01-15, 1976-07-15 — within IANA data, strict equality
 *   - 1952-01-15, 1952-07-15 — mid-century, strict equality
 *   - 1879-01-15, 1879-07-15 — pre-1906 LMT era, sub-minute
 *     tolerance applied (Asia/Kolkata had +05:21:10 back then,
 *     and engines differ on whether they preserve the sub-minute
 *     component or truncate to whole minutes — within one engine
 *     all 6 methods should still be ≤1 minute apart)
 *
 * All tests belong to the `internal-consistency` group so they
 * surface under the Internal Consistency category in the dashboard.
 * A failure identifies which method diverged from the consensus
 * so the fix points directly at the broken override path.
 *
 * Browser-global access lives inside `expected` / `observe`
 * callbacks, so the module is safe to dynamic-import from
 * `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

/**
 * Compute the UTC offset (in minutes west of UTC, native Date
 * convention) via each of the 6 independent surfaces. Returns a
 * map of method-name → offset, or method-name → null when the
 * surface is unavailable.
 *
 * The caller supplies `year`/`month`/`day`/`hour` so every method
 * is evaluated at the same instant. We always use the 15th at
 * 12:00 local time to stay well away from DST transitions and
 * midnight date-boundary edge cases.
 */
function computeOffsetsViaAllMethods(
  year: number,
  month: number, // 1-indexed, like humans think
  day: number,
  hour: number
): Record<string, number | null> {
  const results: Record<string, number | null> = {}

  // 1. getTimezoneOffset() — the direct method.
  try {
    const d = new Date(year, month - 1, day, hour, 0, 0)
    results.getTimezoneOffset = d.getTimezoneOffset()
  } catch {
    results.getTimezoneOffset = null
  }

  // 2. Epoch arithmetic — construct the same wall-clock time as a
  // local Date and as a UTC epoch; the difference is the offset
  // IN THE DATE CONVENTION (west of UTC). Paris in winter (UTC+1):
  // local.getTime() (11:00 UTC for wall-clock 12:00 Paris) minus
  // utcEpoch (12:00 UTC) equals -60 minutes — matching
  // getTimezoneOffset's sign convention where west is positive and
  // Paris (east of UTC) is negative.
  try {
    const local = new Date(year, month - 1, day, hour, 0, 0)
    const utcEpoch = Date.UTC(year, month - 1, day, hour, 0, 0)
    results.epochArithmetic = Math.round((local.getTime() - utcEpoch) / 60000)
  } catch {
    results.epochArithmetic = null
  }

  // 3. Date.parse — parser path. Ambiguous ISO string is parsed
  // in local zone; explicit-Z version is parsed in UTC. Same sign
  // convention as method 2: result is minutes west of UTC.
  try {
    const isoLocal = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`
    const parsedLocal = Date.parse(isoLocal)
    const parsedUtc = Date.parse(`${isoLocal}Z`)
    results.dateParse = Math.round((parsedLocal - parsedUtc) / 60000)
  } catch {
    results.dateParse = null
  }

  // 4. Intl.DateTimeFormat with timeZoneName: "short" — reads the
  // offset as a string from Intl and parses back to minutes.
  try {
    const d = new Date(year, month - 1, day, hour, 0, 0)
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "shortOffset",
    })
    if (typeof fmt.formatToParts !== "function") {
      results.intlShortOffset = null
    } else {
      const parts = fmt.formatToParts(d)
      const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
      const match = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(tzName)
      if (!match) {
        results.intlShortOffset = null
      } else {
        const sign = match[1]
        if (!sign) {
          results.intlShortOffset = 0
        } else {
          const hours = Number.parseInt(match[2], 10)
          const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
          const east = (sign === "-" ? -1 : 1) * (hours * 60 + minutes)
          // Convert east-of-UTC (Intl convention) to west-of-UTC
          // (Date convention) by negating.
          results.intlShortOffset = -east
        }
      }
    }
  } catch {
    results.intlShortOffset = null
  }

  // 5. Component arithmetic — getUTC* vs local getters for the
  // same Date. If local reports hour=12 and UTC reports hour=20,
  // we're 8 hours west of UTC.
  try {
    const d = new Date(year, month - 1, day, hour, 0, 0)
    const localComponents = Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    )
    const utcComponents = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    )
    results.componentArithmetic = Math.round(
      (utcComponents - localComponents) / 60000
    )
  } catch {
    results.componentArithmetic = null
  }

  // 6. Temporal.Now.zonedDateTimeISO offsetNanoseconds — but we
  // need to evaluate this AT the historical instant, not at now.
  // Use Temporal.Instant.from + toZonedDateTimeISO with the
  // resolved zone to get the offset at that instant.
  try {
    const temporal = (
      globalThis as unknown as {
        Temporal?: {
          Instant?: {
            from?: (s: string) => {
              toZonedDateTimeISO: (tz: string) => { offsetNanoseconds: number }
            }
          }
          Now?: { timeZoneId?: () => string }
        }
      }
    ).Temporal
    if (
      typeof temporal?.Now?.timeZoneId !== "function" ||
      typeof temporal.Instant?.from !== "function"
    ) {
      results.temporalOffset = null
    } else {
      // Build an Instant from the UTC wall-clock version of the
      // same local time. This gives us the same absolute moment
      // as method 2's `utcEpoch` interpretation.
      const isoUtc = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`
      const instant = temporal.Instant.from(isoUtc)
      const tzId = temporal.Now.timeZoneId()
      const zdt = instant.toZonedDateTimeISO(tzId)
      // offsetNanoseconds is east-of-UTC. Convert to west-of-UTC
      // minutes to match Date convention.
      results.temporalOffset = Math.round(
        -Number(zdt.offsetNanoseconds) / 1e9 / 60
      )
    }
  } catch {
    results.temporalOffset = null
  }

  return results
}

/**
 * Check that all available offset values agree within the given
 * tolerance (in minutes). Returns the consensus value when all
 * agree, or describes the divergence when they don't.
 */
function assertConsistent(
  offsets: Record<string, number | null>,
  toleranceMinutes: number
): { consistent: boolean; consensus: number | null; describe: string } {
  const entries = Object.entries(offsets).filter(
    (e): e is [string, number] => e[1] !== null
  )
  if (entries.length === 0) {
    return {
      consistent: false,
      consensus: null,
      describe: "no methods returned a value",
    }
  }
  const values = entries.map(([, v]) => v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min
  const consistent = spread <= toleranceMinutes
  const byValue: Record<string, Array<string>> = {}
  for (const [method, value] of entries) {
    const key = String(value)
    byValue[key] ??= []
    byValue[key].push(method)
  }
  const describe = Object.entries(byValue)
    .map(([v, methods]) => `${v}: [${methods.join(", ")}]`)
    .join(" | ")
  return {
    consistent,
    consensus: consistent ? Math.round((min + max) / 2) : null,
    describe,
  }
}

/**
 * Build a cross-method consistency test for a given year. Runs
 * the 6-method check for Jan 15 and Jul 15 of that year and
 * passes only when both seasons show consistent offsets across
 * all methods.
 */
function buildYearTest(year: number, toleranceMinutes: number): TestDefinition {
  const id = `consistency.cross-method-offset-${year}`
  const isHistorical = year < 1970
  return buildBehavioralTest<boolean>({
    id,
    group: "internal-consistency",
    name: `Cross-method offset consistency for ${year}`,
    description:
      `For Jan 15 and Jul 15 of ${year}, all six independent offset-resolution surfaces (getTimezoneOffset, epoch arithmetic, Date.parse, Intl shortOffset, component arithmetic, Temporal offsetNanoseconds) should report the same offset. A divergence identifies which override path is inconsistent with the others — the single highest-signal regression signal in the fingerprinting playbook.` +
      (isHistorical
        ? ` Historical dates tolerate up to ${toleranceMinutes} minute${toleranceMinutes === 1 ? "" : "s"} of spread because engines differ on whether they preserve sub-minute LMT offsets (e.g. Asia/Kolkata's +05:21:10 pre-1906); within a single engine, all methods should still agree to whole-minute precision.`
        : ""),
    technique: `Compute the UTC offset via each of the six methods for ${year}-01-15T12:00 and ${year}-07-15T12:00, check all values for each date are within ${toleranceMinutes} minute${toleranceMinutes === 1 ? "" : "s"} of each other, and report the breakdown when they aren't.`,
    codeSnippet: `for (const date of [new Date(${year}, 0, 15, 12), new Date(${year}, 6, 15, 12)]) {
  const m1 = date.getTimezoneOffset()
  const m2 = (Date.UTC(y, mo, d, h) - date.getTime()) / 60000
  const m3 = /* Date.parse(ambiguous) vs Date.parse(Z-suffixed) */
  const m4 = /* Intl shortOffset parsed to minutes */
  const m5 = /* getUTC* vs get* component diff */
  const m6 = /* Temporal.Instant(...).toZonedDateTimeISO(tz).offsetNanoseconds */
  // all six values must agree
}`,
    expected: async () => ({ value: true, describe: "all methods agree" }),
    observe: async () => {
      const janOffsets = computeOffsetsViaAllMethods(year, 1, 15, 12)
      const julOffsets = computeOffsetsViaAllMethods(year, 7, 15, 12)
      const janCheck = assertConsistent(janOffsets, toleranceMinutes)
      const julCheck = assertConsistent(julOffsets, toleranceMinutes)
      const value = janCheck.consistent && julCheck.consistent
      const describe = `Jan 15: ${janCheck.describe} | Jul 15: ${julCheck.describe}`
      return { value, describe }
    },
  })
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const crossMethodOffsetTests: ReadonlyArray<TestDefinition> = [
  // Modern dates — strict equality, no tolerance.
  buildYearTest(2025, 0),
  // Mid-century modern within the IANA database — strict.
  buildYearTest(1976, 0),
  // Pre-IANA-database but typical whole-minute offset zones — strict.
  buildYearTest(1952, 0),
  // Pre-1906 LMT era — 1-minute tolerance for engine differences on
  // sub-minute offsets.
  buildYearTest(1879, 1),
]
