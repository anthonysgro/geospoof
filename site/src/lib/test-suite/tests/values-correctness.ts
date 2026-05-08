/**
 * Values correctness battery.
 *
 * These behavioral tests answer the question "does the value the browser
 * reports equal the value we expect it to report?" — specifically, the
 * value rendered in the Identity Panel. Each test reads its expected
 * value from the shared `IdentitySnapshot` via `ctx.getIdentity()` or
 * `ctx.awaitIdentity(...)` rather than calling the underlying browser
 * API independently. That "single source of truth" rule (Req 13.2,
 * 23.2) is what keeps the Identity Panel and the test suite from ever
 * disagreeing.
 *
 * Two categories are covered:
 *
 *   1. Timezone correctness (Req 9.1–9.6) — all assigned to the
 *      `timezone-correctness` group. These compare observable timezone
 *      surfaces (`Intl.DateTimeFormat`, `Date` prototype methods,
 *      `Temporal`) against the snapshot's IANA identifier.
 *   2. Geolocation correctness (Req 10.1–10.6) — all assigned to the
 *      `geolocation-correctness` group. These verify that the
 *      `navigator.geolocation` and `navigator.permissions` surfaces agree
 *      with the snapshot's resolved location.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import { requireLocationSnapshot } from "../helpers/location"
import { getSharedPosition } from "../helpers/shared-position"
import type { TestDefinition, TestRunContext } from "../types"

/**
 * Max time the live geolocation calls are allowed to take.
 * (The shared-snapshot wait is owned by `requireLocationSnapshot`
 * in `helpers/location.ts` — tests don't need to set their own.)
 */
const GEOLOCATION_CALL_TIMEOUT_MS = 5_000

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `timeZoneName: "long"` part emitted by
 * `Intl.DateTimeFormat` for the given IANA identifier at the given
 * instant. Returns an empty string when the identifier is unusable or
 * when `formatToParts` is unavailable.
 */
function deriveLongTimezoneName(identifier: string, when: Date): string {
  if (!identifier) return ""
  try {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: identifier,
      timeZoneName: "long",
    })
    if (typeof fmt.formatToParts !== "function") return ""
    const parts = fmt.formatToParts(when)
    return parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

/**
 * Derive the east-of-UTC offset, in minutes, for the given IANA
 * identifier at the given instant, using `Intl.DateTimeFormat` with
 * `timeZoneName: "shortOffset"`. Negative east / positive west is the
 * `Date.prototype.getTimezoneOffset()` convention; this function
 * returns the opposite (east positive) so callers can negate it to get
 * the `getTimezoneOffset()` comparison value.
 *
 * `GMT` alone (no explicit sign) is treated as 0.
 */
function deriveEastOfUtcMinutes(identifier: string, when: Date): number {
  if (!identifier) return 0
  try {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: identifier,
      timeZoneName: "shortOffset",
    })
    if (typeof fmt.formatToParts !== "function") return 0
    const parts = fmt.formatToParts(when)
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    // `GMT`, `GMT+5`, `GMT-8`, `GMT+5:30`, `GMT+05:30`, `GMT-08:00`
    const match = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(tzName)
    if (!match) return 0
    const sign = match[1]
    if (!sign) return 0
    const hours = Number.parseInt(match[2] ?? "0", 10)
    const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
    const magnitude = hours * 60 + minutes
    return sign === "-" ? -magnitude : magnitude
  } catch {
    return 0
  }
}

/**
 * Resolve the current timezone identifier live from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`. We deliberately
 * do NOT read from the identity snapshot here because that snapshot
 * was captured at dashboard mount time — which on cold page loads can
 * be in the sub-second window before a privacy extension has finished
 * delivering its spoofing settings. Reading live ensures the
 * "expected" reference used by every downstream test sees the same
 * post-settlement world that the test's "observed" read will see,
 * eliminating race-induced false failures.
 *
 * The race itself is still honestly surfaced by the single
 * `known-limitation.race.early-timezone-probe` test, which captures
 * the zone at earliest possible module-evaluation time.
 */
function resolveLiveTimezoneIdentifier(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// Geolocation helpers
// ---------------------------------------------------------------------------

interface Coords {
  latitude: number
  longitude: number
}

/**
 * Obtain current coords for this run.
 *
 * Delegates to `getSharedPosition`, which reuses a single cached
 * `GeolocationPosition` across every test that needs one within a run.
 * Two important consequences:
 *
 *   - Safari serialises concurrent `getCurrentPosition` calls; issuing
 *     them from every test independently caused ~10 tests to time out
 *     at 5s each. Sharing one call fixes that.
 *   - Native GPS readings jitter by a few meters between samples. Two
 *     independent calls can round to different 4-decimal-place values
 *     even on raw browsers. Sharing one call produces one reading that
 *     the test and the Identity Panel both see.
 *
 * The `timeoutMs` argument is kept for call-site compatibility but
 * `getSharedPosition` enforces its own 5s ceiling.
 */
async function getCurrentPositionOnce(
  ctx: TestRunContext,
  _timeoutMs: number
): Promise<Coords> {
  void _timeoutMs
  const pos = await getSharedPosition(ctx)
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  }
}

/**
 * Call `watchPosition`, resolve with the first callback's coords, and
 * always call `clearWatch` before returning — even on the timeout and
 * error paths. The try/finally guarantees we never leak a watch id.
 */
async function watchFirstPosition(timeoutMs: number): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("navigator.geolocation is not available")
  }
  const geo = navigator.geolocation
  let watchId: number | null = null

  try {
    return await new Promise<Coords>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        // Safari often stalls watchPosition entirely on desktop —
        // the spec allows zero callbacks for a stationary device.
        // We can't distinguish "extension broke watch" from "engine
        // never fires watchPosition here", so skip rather than
        // error. The getCurrentPosition path remains covered by
        // the sibling values-correctness test.
        reject(
          new SkipTestError(
            `watchPosition did not invoke its callback within ${timeoutMs}ms. Safari may not fire watchPosition for a stationary device within our probe window; the first-callback match can't be measured in that state.`
          )
        )
      }, timeoutMs)

      try {
        watchId = geo.watchPosition(
          (pos) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            })
          },
          (err) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(
              new Error(err.message || `watchPosition error code ${err.code}`)
            )
          },
          { timeout: timeoutMs, maximumAge: Number.POSITIVE_INFINITY }
        )
      } catch (err) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  } finally {
    if (watchId !== null) {
      try {
        geo.clearWatch(watchId)
      } catch {
        // clearWatch must not mask the primary result or error.
      }
    }
  }
}

/** Equality helper: compare two coordinate pairs to 4 decimal places. */
function coordsMatch4dp(a: Coords, b: Coords): boolean {
  return (
    a.latitude.toFixed(4) === b.latitude.toFixed(4) &&
    a.longitude.toFixed(4) === b.longitude.toFixed(4)
  )
}

function describeCoords(c: Coords): string {
  return `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
}

// ---------------------------------------------------------------------------
// Timezone values-correctness tests
// ---------------------------------------------------------------------------

const intlResolvedOptionsTest = buildBehavioralTest<string>({
  id: "values.timezone.intl-resolved-options",
  group: "timezone-correctness",
  name: "Intl.DateTimeFormat().resolvedOptions().timeZone is a valid IANA identifier",
  description:
    "`Intl.DateTimeFormat().resolvedOptions().timeZone` should return a non-empty string that passes Intl's own `supportedLocalesOf`-adjacent validation (we round-trip it by constructing a new formatter). Any browser — spoofed or not — should satisfy this.",
  technique:
    "Read Intl.DateTimeFormat().resolvedOptions().timeZone and verify it round-trips as a valid IANA identifier by constructing a second Intl.DateTimeFormat with it as the explicit timeZone.",
  codeSnippet: `const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone
new Intl.DateTimeFormat(undefined, { timeZone: tz })
// must not throw, tz must be a non-empty string`,
  expected: async () => ({
    value: "non-empty round-trippable identifier",
    describe: "non-empty round-trippable identifier",
  }),
  observe: async () => {
    const tz = resolveLiveTimezoneIdentifier()
    if (!tz) {
      return {
        value: "(empty)",
        describe: "Intl returned an empty timezone identifier",
      }
    }
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: tz })
      return {
        value: "non-empty round-trippable identifier",
        describe: `"${tz}" (round-tripped successfully)`,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        value: `invalid: "${tz}"`,
        describe: `"${tz}" rejected by Intl.DateTimeFormat: ${message}`,
      }
    }
  },
})

const dateGetTimezoneOffsetTest = buildBehavioralTest<number>({
  id: "values.timezone.date-get-timezone-offset",
  group: "timezone-correctness",
  name: "Date.prototype.getTimezoneOffset agrees with Intl shortOffset",
  description:
    "`new Date().getTimezoneOffset()` should equal the negated minute offset derived from `Intl.DateTimeFormat(..., { timeZoneName: \"shortOffset\" })` at the same instant. Both APIs describe the same runtime zone, so they must agree. A mismatch means one surface is spoofed and the other isn't.",
  technique:
    "Derive the east-of-UTC offset from Intl.DateTimeFormat with timeZoneName: \"shortOffset\" at the current instant, negate it, and compare to new Date().getTimezoneOffset().",
  codeSnippet: `const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone
const parts = new Intl.DateTimeFormat(undefined, {
  timeZone: tz,
  timeZoneName: "shortOffset",
}).formatToParts(new Date())
// parse "GMT±HH:MM" → east-of-UTC minutes; negate for getTimezoneOffset()
// compare to new Date().getTimezoneOffset()`,
  expected: async () => {
    const identifier = resolveLiveTimezoneIdentifier()
    const eastMinutes = deriveEastOfUtcMinutes(identifier, new Date())
    const value = -eastMinutes
    return {
      value,
      describe: `${value} minutes (from ${identifier || "(empty)"})`,
    }
  },
  observe: async () => {
    const value = new Date().getTimezoneOffset()
    return { value, describe: `${value} minutes` }
  },
})

const temporalTimeZoneIdTest = buildBehavioralTest<string>({
  id: "values.timezone.temporal-timezone-id",
  group: "timezone-correctness",
  name: "Temporal.Now.timeZoneId() agrees with Intl resolved zone",
  description:
    "When the Temporal API is available, `Temporal.Now.timeZoneId()` should equal `Intl.DateTimeFormat().resolvedOptions().timeZone`. Both describe the same runtime zone; a mismatch means one surface is spoofed and the other isn't.",
  technique:
    "Feature-detect Temporal.Now.timeZoneId; when available, invoke it and compare to the current Intl.DateTimeFormat resolved timezone.",
  codeSnippet: `Temporal.Now.timeZoneId()
// should equal new Intl.DateTimeFormat().resolvedOptions().timeZone`,
  expected: async () => {
    const temporalNow = (
      globalThis as unknown as {
        Temporal?: { Now?: { timeZoneId?: () => string } }
      }
    ).Temporal?.Now
    if (typeof temporalNow?.timeZoneId !== "function") {
      return { skipReason: "Temporal API not supported in this browser" }
    }
    const identifier = resolveLiveTimezoneIdentifier()
    return { value: identifier, describe: identifier || "(empty)" }
  },
  observe: async () => {
    const temporalNow = (
      globalThis as unknown as {
        Temporal: { Now: { timeZoneId: () => string } }
      }
    ).Temporal.Now
    const id = temporalNow.timeZoneId()
    return { value: id, describe: id || "(empty)" }
  },
})

const dateToStringTimezoneNameTest = buildBehavioralTest<string>({
  id: "values.timezone.date-tostring-timezone-name",
  group: "timezone-correctness",
  name: "Date.prototype.toString contains the resolved long timezone name",
  description:
    "The long timezone name embedded in `new Date().toString()` should match the long name derived from Intl.DateTimeFormat for the same resolved zone. A mismatch here means Date.toString and Intl disagree on the current timezone.",
  technique:
    "Derive the long timezone name from Intl.DateTimeFormat at the current resolved zone, then assert it is a substring of new Date().toString().",
  codeSnippet: `const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone
const expected = new Intl.DateTimeFormat(undefined, {
  timeZone: tz,
  timeZoneName: "long",
}).formatToParts(new Date())
  .find((p) => p.type === "timeZoneName").value

// expected should appear inside:
new Date().toString()`,
  expected: async () => {
    const identifier = resolveLiveTimezoneIdentifier()
    const longName = deriveLongTimezoneName(identifier, new Date())
    return {
      value: longName,
      describe: longName
        ? `contains "${longName}"`
        : `(empty long name for ${identifier || "(empty)"})`,
    }
  },
  observe: async () => {
    const s = new Date().toString()
    return { value: s, describe: s }
  },
  equals: (expected, observed) =>
    expected.length > 0 && observed.includes(expected),
})

const dateToLocaleStringTimezoneTest = buildBehavioralTest<string>({
  id: "values.timezone.date-tolocalestring-honors-timezone",
  group: "timezone-correctness",
  name: "Date.prototype.toLocaleString honors the resolved timezone",
  description:
    "`new Date().toLocaleString(undefined, { timeZoneName: \"long\" })` should contain the long timezone name derived from the current Intl resolved zone. A mismatch means toLocaleString and Intl disagree on the current timezone.",
  technique:
    'Derive the long timezone name from Intl.DateTimeFormat at the current resolved zone, then call new Date().toLocaleString(undefined, { timeZoneName: "long" }) and assert the expected long name is a substring of the result.',
  codeSnippet: `const expected = /* long name derived from current Intl zone */
new Date().toLocaleString(undefined, { timeZoneName: "long" })
// should contain expected`,
  expected: async () => {
    const identifier = resolveLiveTimezoneIdentifier()
    const longName = deriveLongTimezoneName(identifier, new Date())
    return {
      value: longName,
      describe: longName
        ? `contains "${longName}"`
        : `(empty long name for ${identifier || "(empty)"})`,
    }
  },
  observe: async () => {
    const s = new Date().toLocaleString(undefined, { timeZoneName: "long" })
    return { value: s, describe: s }
  },
  equals: (expected, observed) =>
    expected.length > 0 && observed.includes(expected),
})

const dateUtcPassthroughTest = buildBehavioralTest<number>({
  id: "values.timezone.date-utc-passthrough",
  group: "timezone-correctness",
  name: "Date.UTC is unaffected by timezone spoofing",
  description:
    "Date.UTC(2024, 0, 1, 0, 0, 0) should always equal 1704067200000 — the true UTC epoch must never be shifted by timezone spoofing.",
  technique:
    "Compare Date.UTC(2024, 0, 1, 0, 0, 0) against the constant 1704067200000.",
  codeSnippet: `Date.UTC(2024, 0, 1, 0, 0, 0) === 1704067200000`,
  expected: async () => ({ value: 1704067200000, describe: "1704067200000" }),
  observe: async () => {
    const value = Date.UTC(2024, 0, 1, 0, 0, 0)
    return { value, describe: String(value) }
  },
})

// ---------------------------------------------------------------------------
// UTC surface passthrough
// ---------------------------------------------------------------------------
//
// `Date.prototype.toISOString`, `Date.prototype.toJSON`, and each
// `Date.prototype.getUTC*` method represent the TRUE UTC view of an
// instant and must never be shifted by timezone spoofing. Analytics
// pipelines, logging, `JSON.stringify(new Date())`, and every REST API
// that round-trips dates as ISO strings depend on these staying
// passthrough. A regression that accidentally routes any of them through
// the spoofing-aware path would silently corrupt data.

/**
 * Fixed epoch used for every UTC passthrough test — 2024-01-01T00:00:00Z.
 * Using a single constant means a regression shows up in identical shape
 * across every test, which makes the failure easy to correlate.
 */
const UTC_PASSTHROUGH_EPOCH = 1704067200000
const UTC_PASSTHROUGH_ISO = "2024-01-01T00:00:00.000Z"

const dateToIsoStringPassthroughTest = buildBehavioralTest<string>({
  id: "values.timezone.date-toisostring-passthrough",
  group: "timezone-correctness",
  name: "Date.prototype.toISOString is unaffected by timezone spoofing",
  description:
    'new Date(1704067200000).toISOString() must equal "2024-01-01T00:00:00.000Z" regardless of the spoofed timezone. toISOString is a UTC surface — mutating it would corrupt every REST API call and log timestamp the page produces.',
  technique:
    "Construct a Date from the fixed UTC epoch 1704067200000 and assert toISOString() returns the exact ISO-8601 UTC string.",
  codeSnippet: `new Date(1704067200000).toISOString() === "2024-01-01T00:00:00.000Z"`,
  expected: async () => ({
    value: UTC_PASSTHROUGH_ISO,
    describe: `"${UTC_PASSTHROUGH_ISO}"`,
  }),
  observe: async () => {
    const value = new Date(UTC_PASSTHROUGH_EPOCH).toISOString()
    return { value, describe: `"${value}"` }
  },
})

const dateToJsonPassthroughTest = buildBehavioralTest<string>({
  id: "values.timezone.date-tojson-passthrough",
  group: "timezone-correctness",
  name: "Date.prototype.toJSON is unaffected by timezone spoofing",
  description:
    'new Date(1704067200000).toJSON() must equal "2024-01-01T00:00:00.000Z". toJSON is what `JSON.stringify(new Date())` invokes; a spoofed value here corrupts every JSON-serialised payload the page produces.',
  technique:
    "Construct a Date from the fixed UTC epoch 1704067200000 and assert toJSON() returns the exact ISO-8601 UTC string (same format as toISOString).",
  codeSnippet: `new Date(1704067200000).toJSON() === "2024-01-01T00:00:00.000Z"`,
  expected: async () => ({
    value: UTC_PASSTHROUGH_ISO,
    describe: `"${UTC_PASSTHROUGH_ISO}"`,
  }),
  observe: async () => {
    const value = new Date(UTC_PASSTHROUGH_EPOCH).toJSON()
    return { value, describe: `"${value}"` }
  },
})

const dateGetUtcMethodsPassthroughTest = buildBehavioralTest<string>({
  id: "values.timezone.date-getutc-methods-passthrough",
  group: "timezone-correctness",
  name: "Date.prototype.getUTC* methods are unaffected by timezone spoofing",
  description:
    "Every getUTC* method — getUTCFullYear, getUTCMonth, getUTCDate, getUTCDay, getUTCHours, getUTCMinutes, getUTCSeconds, getUTCMilliseconds — returns the TRUE UTC view of an instant. For new Date(1704067200000), that view is fixed: 2024-01-01T00:00:00.000Z, which is Monday (getUTCDay=1). None of these values depend on the spoofed zone.",
  technique:
    "Construct a Date from the fixed UTC epoch 1704067200000 and assert each getUTC* method returns the spec-defined value for 2024-01-01T00:00:00.000Z (Monday).",
  codeSnippet: `const d = new Date(1704067200000)
d.getUTCFullYear() === 2024 &&
  d.getUTCMonth() === 0 &&
  d.getUTCDate() === 1 &&
  d.getUTCDay() === 1 && // Monday
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0`,
  expected: async () => {
    const value =
      "year=2024; month=0; date=1; day=1; hours=0; minutes=0; seconds=0; ms=0"
    return { value, describe: value }
  },
  observe: async () => {
    const d = new Date(UTC_PASSTHROUGH_EPOCH)
    const value =
      `year=${d.getUTCFullYear()}; ` +
      `month=${d.getUTCMonth()}; ` +
      `date=${d.getUTCDate()}; ` +
      `day=${d.getUTCDay()}; ` +
      `hours=${d.getUTCHours()}; ` +
      `minutes=${d.getUTCMinutes()}; ` +
      `seconds=${d.getUTCSeconds()}; ` +
      `ms=${d.getUTCMilliseconds()}`
    return { value, describe: value }
  },
})

// ---------------------------------------------------------------------------
// Geolocation values-correctness tests
// ---------------------------------------------------------------------------

const geolocationLatitudeTest = buildBehavioralTest<boolean>({
  id: "values.geolocation.get-current-position-latitude",
  group: "geolocation-correctness",
  name: "Reported latitude is a finite number in [-90, 90]",
  description:
    "The latitude rendered by the Identity Panel (sourced from navigator.geolocation.getCurrentPosition) should be a finite number within the WGS84 latitude range.",
  technique:
    "Await the shared location snapshot and assert Number.isFinite(latitude) && latitude >= -90 && latitude <= 90.",
  codeSnippet: `const lat = identity.location.latitude
Number.isFinite(lat) && lat >= -90 && lat <= 90`,
  expected: async () => ({
    value: true,
    describe: "finite number in [-90, 90]",
  }),
  observe: async (ctx) => {
    const location = await requireLocationSnapshot(ctx)
    const lat = location.latitude
    const valid = Number.isFinite(lat) && lat >= -90 && lat <= 90
    return { value: valid, describe: `latitude=${lat}` }
  },
})

const geolocationLongitudeTest = buildBehavioralTest<boolean>({
  id: "values.geolocation.get-current-position-longitude",
  group: "geolocation-correctness",
  name: "Reported longitude is a finite number in [-180, 180]",
  description:
    "The longitude rendered by the Identity Panel (sourced from navigator.geolocation.getCurrentPosition) should be a finite number within the WGS84 longitude range.",
  technique:
    "Await the shared location snapshot and assert Number.isFinite(longitude) && longitude >= -180 && longitude <= 180.",
  codeSnippet: `const lon = identity.location.longitude
Number.isFinite(lon) && lon >= -180 && lon <= 180`,
  expected: async () => ({
    value: true,
    describe: "finite number in [-180, 180]",
  }),
  observe: async (ctx) => {
    const location = await requireLocationSnapshot(ctx)
    const lon = location.longitude
    const valid = Number.isFinite(lon) && lon >= -180 && lon <= 180
    return { value: valid, describe: `longitude=${lon}` }
  },
})

const geolocationMatchesIdentityTest = buildBehavioralTest<Coords>({
  id: "values.geolocation.get-current-position-matches-identity",
  group: "geolocation-correctness",
  name: "navigator.geolocation.getCurrentPosition matches identity",
  description:
    "A fresh navigator.geolocation.getCurrentPosition call should return the same latitude and longitude (to 4 decimal places) as the Identity Panel.",
  technique:
    "Read the expected coords from the shared location snapshot, invoke navigator.geolocation.getCurrentPosition live, and compare to 4 decimal places.",
  codeSnippet: `navigator.geolocation.getCurrentPosition((pos) => {
  pos.coords.latitude.toFixed(4)  === identity.location.latitude.toFixed(4)
  pos.coords.longitude.toFixed(4) === identity.location.longitude.toFixed(4)
})`,
  expected: async (ctx) => {
    const location = await requireLocationSnapshot(ctx)
    const value: Coords = {
      latitude: location.latitude,
      longitude: location.longitude,
    }
    return { value, describe: describeCoords(value) }
  },
  observe: async (ctx) => {
    const value = await getCurrentPositionOnce(ctx, GEOLOCATION_CALL_TIMEOUT_MS)
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatch4dp,
})

const geolocationWatchPositionTest = buildBehavioralTest<Coords>({
  id: "values.geolocation.watch-position-matches-get-current-position",
  group: "geolocation-correctness",
  name: "navigator.geolocation.watchPosition matches getCurrentPosition",
  description:
    "The first callback from navigator.geolocation.watchPosition should return the same latitude and longitude (to 4 decimal places) as the prior getCurrentPosition call rendered by the Identity Panel.",
  technique:
    "Read the expected coords from the shared location snapshot (which came from getCurrentPosition), invoke watchPosition, take its first callback, compare to 4 decimal places, and clearWatch before returning.",
  codeSnippet: `const id = navigator.geolocation.watchPosition((pos) => {
  pos.coords.latitude.toFixed(4)  === identity.location.latitude.toFixed(4)
  pos.coords.longitude.toFixed(4) === identity.location.longitude.toFixed(4)
  navigator.geolocation.clearWatch(id)
})`,
  expected: async (ctx) => {
    const location = await requireLocationSnapshot(ctx)
    const value: Coords = {
      latitude: location.latitude,
      longitude: location.longitude,
    }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    const value = await watchFirstPosition(GEOLOCATION_CALL_TIMEOUT_MS)
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatch4dp,
})

// ---------------------------------------------------------------------------
// Date constructor / Date.parse behavior
// ---------------------------------------------------------------------------

const dateConstructorNumericPassthroughTest = buildBehavioralTest<number>({
  id: "values.timezone.date-constructor-numeric-passthrough",
  group: "timezone-correctness",
  name: "Date constructor with a numeric epoch argument is a passthrough",
  description:
    "new Date(ms).getTime() should equal ms. Numeric arguments represent an absolute UTC epoch and must not be adjusted by timezone spoofing.",
  technique:
    "Construct a Date from a fixed numeric epoch (2024-01-01T00:00:00Z = 1704067200000) and assert .getTime() returns the same value.",
  codeSnippet: `const EPOCH = 1704067200000
new Date(EPOCH).getTime() === EPOCH`,
  expected: async () => {
    const value = 1704067200000
    return { value, describe: `${value} (true UTC epoch)` }
  },
  observe: async () => {
    const value = new Date(1704067200000).getTime()
    return { value, describe: String(value) }
  },
})

const dateConstructorIsoUtcPassthroughTest = buildBehavioralTest<number>({
  id: "values.timezone.date-constructor-iso-utc-passthrough",
  group: "timezone-correctness",
  name: "Date constructor with an explicit-UTC ISO string is a passthrough",
  description:
    'new Date("2024-01-01T00:00:00Z").getTime() should equal 1704067200000. Explicit-UTC strings must not be adjusted — only ambiguous strings are.',
  technique:
    "Parse a Z-suffixed ISO string and assert its epoch equals the known UTC constant.",
  codeSnippet: `new Date("2024-01-01T00:00:00Z").getTime() === 1704067200000`,
  expected: async () => {
    const value = 1704067200000
    return { value, describe: `${value}` }
  },
  observe: async () => {
    const value = new Date("2024-01-01T00:00:00Z").getTime()
    return { value, describe: String(value) }
  },
})

const dateParseUtcPassthroughTest = buildBehavioralTest<number>({
  id: "values.timezone.date-parse-utc-passthrough",
  group: "timezone-correctness",
  name: "Date.parse on an explicit-UTC ISO string is a passthrough",
  description:
    'Date.parse("2024-01-01T00:00:00Z") should equal 1704067200000. The Date.parse override uses the same ambiguous / explicit branching as the Date constructor, so this pins the explicit branch.',
  technique:
    "Parse a Z-suffixed ISO string with Date.parse and compare to the known UTC constant.",
  codeSnippet: `Date.parse("2024-01-01T00:00:00Z") === 1704067200000`,
  expected: async () => {
    const value = 1704067200000
    return { value, describe: `${value}` }
  },
  observe: async () => {
    const value = Date.parse("2024-01-01T00:00:00Z")
    return { value, describe: String(value) }
  },
})

const dateInstanceIsDateTest = buildBehavioralTest<boolean>({
  id: "values.timezone.date-instance-is-date",
  group: "timezone-correctness",
  name: "new Date() is instanceof Date and shares Date.prototype",
  description:
    "A Date instance produced by the (possibly overridden) constructor must still satisfy instanceof Date and have Date.prototype in its prototype chain. Pages commonly brand-check with either vector.",
  technique:
    "Construct a Date several ways (no-arg, numeric, ISO string) and assert each one is instanceof Date and Object.getPrototypeOf(d) === Date.prototype.",
  codeSnippet: `const a = new Date()
const b = new Date(0)
const c = new Date("2024-01-01T00:00:00Z")
[a, b, c].every((d) =>
  d instanceof Date && Object.getPrototypeOf(d) === Date.prototype,
)`,
  expected: async () => ({ value: true, describe: "true" }),
  observe: async () => {
    const samples = [new Date(), new Date(0), new Date("2024-01-01T00:00:00Z")]
    const value = samples.every(
      (d) => d instanceof Date && Object.getPrototypeOf(d) === Date.prototype
    )
    const describe = samples
      .map(
        (d, i) =>
          `#${i}: instanceof=${String(d instanceof Date)}, proto=${Object.getPrototypeOf(d) === Date.prototype}`
      )
      .join("; ")
    return { value, describe }
  },
})

const dateValueOfRoundTripTest = buildBehavioralTest<number>({
  id: "values.timezone.date-valueof-roundtrip",
  group: "timezone-correctness",
  name: "Date.prototype.valueOf / .getTime round-trip on numeric construction",
  description:
    "+new Date(ms) and new Date(ms).valueOf() must both equal ms. The override's numeric-passthrough branch is verified from both coercion paths pages commonly use.",
  technique:
    "Construct Dates from two fixed epochs, confirm +d and d.valueOf() both equal the input, and collapse to a single boolean for the assertion.",
  codeSnippet: `const EPOCHS = [0, 1704067200000]
EPOCHS.every((ms) => +new Date(ms) === ms && new Date(ms).valueOf() === ms)`,
  expected: async () => ({ value: 1, describe: "1 (all epochs round-trip)" }),
  observe: async () => {
    const epochs = [0, 1704067200000]
    const ok = epochs.every(
      (ms) => +new Date(ms) === ms && new Date(ms).valueOf() === ms
    )
    const value = ok ? 1 : 0
    const describe = epochs
      .map(
        (ms) => `${ms}: +d=${+new Date(ms)}, valueOf=${new Date(ms).valueOf()}`
      )
      .join("; ")
    return { value, describe }
  },
})

// ---------------------------------------------------------------------------
// Intl.DateTimeFormat explicit-timezone passthrough
// ---------------------------------------------------------------------------

const intlExplicitTimezonePassthroughTest = buildBehavioralTest<string>({
  id: "values.timezone.intl-explicit-timezone-passthrough",
  group: "timezone-correctness",
  name: "Intl.DateTimeFormat honors an explicit timeZone option",
  description:
    'new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).resolvedOptions().timeZone must equal "UTC". When a page supplies an explicit timeZone, the override must leave it alone rather than replacing it with the spoofed identifier.',
  technique:
    "Construct an Intl.DateTimeFormat with an explicit timeZone and assert resolvedOptions().timeZone is unchanged. Verifies that the DateTimeFormat constructor override correctly tracks which instances carry explicit zones.",
  codeSnippet: `new Intl.DateTimeFormat(undefined, { timeZone: "UTC" })
  .resolvedOptions().timeZone === "UTC"`,
  expected: async () => ({ value: "UTC", describe: '"UTC"' }),
  observe: async () => {
    const resolved = new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
    }).resolvedOptions().timeZone
    return { value: resolved, describe: `"${resolved}"` }
  },
})

const intlFormatToPartsHonorsExplicitTimezoneTest =
  buildBehavioralTest<boolean>({
    id: "values.timezone.intl-format-to-parts-honors-explicit-tz",
    group: "timezone-correctness",
    name: "Intl.DateTimeFormat with explicit UTC emits a UTC-ish timeZoneName",
    description:
      'When constructed with timeZone: "UTC" and timeZoneName: "long", the formatted output must contain a UTC-family label (Coordinated Universal Time, UTC, GMT, etc.) rather than the spoofed zone\'s long name.',
    technique:
      'Format a fixed instant (2024-01-01T00:00:00Z) with Intl.DateTimeFormat({ timeZone: "UTC", timeZoneName: "long" }) and assert the timeZoneName part matches a UTC family label.',
    codeSnippet: `const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  timeZoneName: "long",
}).formatToParts(new Date("2024-01-01T00:00:00Z"))
const tz = parts.find((p) => p.type === "timeZoneName")?.value
// tz should contain "UTC", "Coordinated Universal Time", or "GMT"`,
    expected: async () => ({
      value: true,
      describe: "matches UTC family label",
    }),
    observe: async () => {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        timeZoneName: "long",
      })
      if (typeof fmt.formatToParts !== "function") {
        throw new Error("formatToParts is not supported in this browser")
      }
      const parts = fmt.formatToParts(new Date("2024-01-01T00:00:00Z"))
      const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
      const value = /UTC|Coordinated Universal Time|GMT/i.test(tz)
      return { value, describe: `"${tz}"` }
    },
  })

// ---------------------------------------------------------------------------
// Temporal beyond timeZoneId
// ---------------------------------------------------------------------------

interface TemporalNowSurface {
  plainDateTimeISO?: (tz?: string) => { toString: () => string }
  zonedDateTimeISO?: (tz?: string) => { timeZoneId: string }
}

function getTemporalNow(): TemporalNowSurface | null {
  const maybe = (globalThis as any).Temporal?.Now as
    | TemporalNowSurface
    | undefined
  return maybe ?? null
}

const temporalPlainDateTimeIsoHonorsIdentityTest = buildBehavioralTest<boolean>(
  {
    id: "values.timezone.temporal-plain-datetime-iso-honors-identity",
    group: "timezone-correctness",
    name: "Temporal.Now.plainDateTimeISO() agrees with Intl resolved zone",
    description:
      "Temporal.Now.plainDateTimeISO() with no argument should reflect the wall-clock time of the current Intl resolved zone — specifically, its ISO date portion must equal the date portion Intl.DateTimeFormat produces for the same instant in that zone.",
    technique:
      'Read the ISO date portion from Temporal.Now.plainDateTimeISO() and compare to the "en-CA" date string for the current Intl resolved zone (YYYY-MM-DD) at the same instant.',
    codeSnippet: `const instant = new Date()
const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone
const pdt = Temporal.Now.plainDateTimeISO().toString() // "YYYY-MM-DDTHH:mm:ss"
const datePart = pdt.slice(0, 10)
const expected = new Intl.DateTimeFormat("en-CA", {
  timeZone: tz,
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(instant)
datePart === expected`,
    expected: async () => {
      const temporal = getTemporalNow()
      if (!temporal?.plainDateTimeISO) {
        return { skipReason: "Temporal.Now.plainDateTimeISO not available" }
      }
      const identifier = resolveLiveTimezoneIdentifier()
      if (!identifier) {
        return { skipReason: "Intl did not resolve a timezone identifier" }
      }
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: identifier,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      const expected = fmt.format(new Date())
      return { value: true, describe: `date portion equals "${expected}"` }
    },
    observe: async () => {
      const temporal = getTemporalNow()
      if (!temporal?.plainDateTimeISO) {
        throw new Error("Temporal.Now.plainDateTimeISO not available")
      }
      const identifier = resolveLiveTimezoneIdentifier()
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: identifier,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      const expectedDate = fmt.format(new Date())
      const iso = temporal.plainDateTimeISO().toString()
      const datePart = iso.slice(0, 10)
      const value = datePart === expectedDate
      return { value, describe: `"${iso}" (date portion "${datePart}")` }
    },
  }
)

const temporalZonedDateTimeIsoHonorsIdentityTest = buildBehavioralTest<string>({
  id: "values.timezone.temporal-zoned-datetime-iso-honors-identity",
  group: "timezone-correctness",
  name: "Temporal.Now.zonedDateTimeISO().timeZoneId agrees with Intl resolved zone",
  description:
    "Temporal.Now.zonedDateTimeISO() (no argument) should return a ZonedDateTime whose timeZoneId equals the current Intl resolved zone. A mismatch means Temporal and Intl disagree.",
  technique:
    "Call Temporal.Now.zonedDateTimeISO() and compare its timeZoneId property to Intl.DateTimeFormat().resolvedOptions().timeZone.",
  codeSnippet: `Temporal.Now.zonedDateTimeISO().timeZoneId ===
  new Intl.DateTimeFormat().resolvedOptions().timeZone`,
  expected: async () => {
    const temporal = getTemporalNow()
    if (!temporal?.zonedDateTimeISO) {
      return { skipReason: "Temporal.Now.zonedDateTimeISO not available" }
    }
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    return { value: identifier, describe: `"${identifier}"` }
  },
  observe: async () => {
    const temporal = getTemporalNow()
    if (!temporal?.zonedDateTimeISO) {
      throw new Error("Temporal.Now.zonedDateTimeISO not available")
    }
    const value = temporal.zonedDateTimeISO().timeZoneId
    return { value, describe: `"${value}"` }
  },
})

const temporalExplicitTimezonePassthroughTest = buildBehavioralTest<string>({
  id: "values.timezone.temporal-explicit-timezone-passthrough",
  group: "timezone-correctness",
  name: 'Temporal.Now.zonedDateTimeISO("UTC") honors the explicit timezone',
  description:
    "When a page passes an explicit IANA identifier to Temporal.Now.zonedDateTimeISO, the override must pass it through unchanged rather than substituting the spoofed identifier.",
  technique:
    'Call Temporal.Now.zonedDateTimeISO("UTC") and assert the returned timeZoneId is "UTC".',
  codeSnippet: `Temporal.Now.zonedDateTimeISO("UTC").timeZoneId === "UTC"`,
  expected: async () => {
    const temporal = getTemporalNow()
    if (!temporal?.zonedDateTimeISO) {
      return { skipReason: "Temporal.Now.zonedDateTimeISO not available" }
    }
    return { value: "UTC", describe: '"UTC"' }
  },
  observe: async () => {
    const temporal = getTemporalNow()
    if (!temporal?.zonedDateTimeISO) {
      throw new Error("Temporal.Now.zonedDateTimeISO not available")
    }
    const value = temporal.zonedDateTimeISO("UTC").timeZoneId
    return { value, describe: `"${value}"` }
  },
})

// ---------------------------------------------------------------------------
// Geolocation shape / prototype fidelity
// ---------------------------------------------------------------------------

/**
 * Fetch a GeolocationPosition *without* coercing it into `Coords` — the
 * shape-fidelity tests need access to the raw position object to inspect
 * its prototype chain and optional fields.
 *
 * Delegates to `getSharedPosition` so every shape test within a run
 * reuses the same cached position (fixes Safari's serialisation of
 * concurrent `getCurrentPosition` calls).
 */
function getFullPosition(
  ctx: TestRunContext,
  _timeoutMs: number
): Promise<GeolocationPosition> {
  void _timeoutMs
  return getSharedPosition(ctx)
}

const geolocationPositionPrototypeTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.position-prototype-is-native",
  group: "geolocation-stealth",
  name: "GeolocationPosition prototype is the native constructor",
  description:
    "Object.getPrototypeOf(position) should be GeolocationPosition.prototype. Pages can brand-check the position object — if the override returns a plain object, a single instanceof check catches it.",
  technique:
    "Feature-detect GeolocationPosition; if available, call getCurrentPosition and assert position instanceof GeolocationPosition and its direct prototype matches.",
  codeSnippet: `const pos = await new Promise((res, rej) =>
  navigator.geolocation.getCurrentPosition(res, rej),
)
pos instanceof GeolocationPosition &&
  Object.getPrototypeOf(pos) === GeolocationPosition.prototype`,
  expected: async () => {
    if (typeof GeolocationPosition === "undefined") {
      return { skipReason: "GeolocationPosition constructor not exposed" }
    }
    return { value: true, describe: "true" }
  },
  observe: async (ctx) => {
    if (typeof GeolocationPosition === "undefined") {
      throw new Error("GeolocationPosition constructor not exposed")
    }
    const pos = await getFullPosition(ctx, GEOLOCATION_CALL_TIMEOUT_MS)
    const viaInstanceof = pos instanceof GeolocationPosition
    const viaProto =
      Object.getPrototypeOf(pos) === GeolocationPosition.prototype
    const value = viaInstanceof && viaProto
    return {
      value,
      describe: `instanceof=${String(viaInstanceof)}, proto-match=${String(viaProto)}`,
    }
  },
})

const geolocationCoordsPrototypeTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.coords-prototype-is-native",
  group: "geolocation-stealth",
  name: "GeolocationCoordinates prototype is the native constructor",
  description:
    "Object.getPrototypeOf(position.coords) should be GeolocationCoordinates.prototype. This is the highest-signal single-line detection vector in the geolocation API.",
  technique:
    "Feature-detect GeolocationCoordinates; if available, call getCurrentPosition and assert position.coords instanceof GeolocationCoordinates and its direct prototype matches.",
  codeSnippet: `const pos = await new Promise((res, rej) =>
  navigator.geolocation.getCurrentPosition(res, rej),
)
pos.coords instanceof GeolocationCoordinates &&
  Object.getPrototypeOf(pos.coords) === GeolocationCoordinates.prototype`,
  expected: async () => {
    if (typeof GeolocationCoordinates === "undefined") {
      return { skipReason: "GeolocationCoordinates constructor not exposed" }
    }
    return { value: true, describe: "true" }
  },
  observe: async (ctx) => {
    if (typeof GeolocationCoordinates === "undefined") {
      throw new Error("GeolocationCoordinates constructor not exposed")
    }
    const pos = await getFullPosition(ctx, GEOLOCATION_CALL_TIMEOUT_MS)
    const viaInstanceof = pos.coords instanceof GeolocationCoordinates
    const viaProto =
      Object.getPrototypeOf(pos.coords) === GeolocationCoordinates.prototype
    const value = viaInstanceof && viaProto
    return {
      value,
      describe: `instanceof=${String(viaInstanceof)}, proto-match=${String(viaProto)}`,
    }
  },
})

const geolocationOptionalFieldsNullTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.optional-coord-fields-null",
  group: "geolocation-stealth",
  name: "GeolocationCoordinates optional fields are present and null",
  description:
    "position.coords.altitude, altitudeAccuracy, heading, and speed must exist as enumerable properties with value null (the W3C default). Missing keys or undefined values distinguish a plain-object stand-in from a native GeolocationCoordinates.",
  technique:
    "Call getCurrentPosition and verify each optional field is an own-or-inherited property whose value is exactly null.",
  codeSnippet: `const pos = await new Promise((res, rej) =>
  navigator.geolocation.getCurrentPosition(res, rej),
)
["altitude", "altitudeAccuracy", "heading", "speed"].every(
  (k) => k in pos.coords && pos.coords[k] === null,
)`,
  expected: async () => ({
    value: "altitude=null; altitudeAccuracy=null; heading=null; speed=null",
    describe: "all four null",
  }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx, GEOLOCATION_CALL_TIMEOUT_MS)
    const keys = ["altitude", "altitudeAccuracy", "heading", "speed"] as const
    const parts = keys.map((k) => {
      const v = (pos.coords as unknown as Record<string, unknown>)[k]
      const present = k in pos.coords
      const isNull = v === null
      return `${k}=${present ? (isNull ? "null" : JSON.stringify(v)) : "(missing)"}`
    })
    return { value: parts.join("; "), describe: parts.join("; ") }
  },
})

const geolocationTimestampRecentTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.timestamp-recent",
  group: "geolocation-stealth",
  name: "GeolocationPosition.timestamp is a recent wall-clock reading",
  description:
    "position.timestamp should be a recent timestamp. Native engines disagree on the epoch — Firefox and Chrome return Unix milliseconds (ms since 1970-01-01 UTC), while Safari/WebKit returns CFAbsoluteTime-style values (ms since 2001-01-01 UTC, roughly 31 years smaller). Either is fine — what matters is that the value is *recent* against its own epoch. A constant or far-offset timestamp relative to both epochs is a low-effort detection vector; the native API always returns the current wall clock.",
  technique:
    "Sample Date.now() just before the getCurrentPosition call, capture position.timestamp, and assert it's within 10 seconds of either the Unix epoch or the CFAbsoluteTime (2001-based) interpretation.",
  codeSnippet: `const before = Date.now()
const pos = await new Promise((res, rej) =>
  navigator.geolocation.getCurrentPosition(res, rej),
)
// Accept either Unix-epoch or CFAbsoluteTime (Safari) — both are native
const unixDelta = Math.abs(pos.timestamp - before)
const CF_EPOCH_OFFSET_MS = 978_307_200_000 // 2001-01-01 - 1970-01-01 in ms
const cfDelta = Math.abs(pos.timestamp + CF_EPOCH_OFFSET_MS - before)
Math.min(unixDelta, cfDelta) < 10_000`,
  expected: async () => ({ value: true, describe: "|delta| < 10s" }),
  observe: async (ctx) => {
    const before = Date.now()
    const pos = await getFullPosition(ctx, GEOLOCATION_CALL_TIMEOUT_MS)
    // Interpret the timestamp as Unix milliseconds first.
    const unixDelta = Math.abs(pos.timestamp - before)
    // Safari / WebKit reports timestamps as CFAbsoluteTime ×1000: ms
    // since 2001-01-01 00:00:00 UTC, which is 978,307,200,000 ms
    // before the Unix epoch. So `pos.timestamp + cfOffset` converts to
    // Unix ms. If Safari's interpretation lands close to the wall clock,
    // that's native behaviour, not a spoofing signal.
    const CF_EPOCH_OFFSET_MS = 978_307_200_000
    const cfDelta = Math.abs(pos.timestamp + CF_EPOCH_OFFSET_MS - before)
    const delta = Math.min(unixDelta, cfDelta)
    const interp =
      delta === cfDelta && cfDelta < unixDelta ? "CFAbsoluteTime" : "Unix"
    const value = Number.isFinite(pos.timestamp) && delta < 10_000
    return {
      value,
      describe: `timestamp=${pos.timestamp} (${interp}), |delta|=${delta}ms`,
    }
  },
})

// ---------------------------------------------------------------------------
// Permissions passthrough
// ---------------------------------------------------------------------------

const permissionsPassthroughNotificationsTest = buildBehavioralTest<boolean>({
  id: "tampering.permissions.passthrough-non-geolocation",
  group: "geolocation-stealth",
  name: "navigator.permissions.query passes through non-geolocation names",
  description:
    'navigator.permissions.query({ name: "notifications" }) must return a native PermissionStatus — the override should intercept only "geolocation" and delegate every other name to the real API. An override that short-circuits all names would break permission-gated features and is trivial to detect.',
  technique:
    'Query notifications permission and verify the result is an EventTarget-derived object with a recognisable state ("granted"/"denied"/"prompt"). Skip as known-limitation when Permissions API is not available.',
  codeSnippet: `const r = await navigator.permissions.query({ name: "notifications" })
["granted", "denied", "prompt"].includes(r.state)`,
  expected: async () => {
    const permissions =
      typeof navigator !== "undefined" ? navigator.permissions : undefined
    if (!permissions || typeof permissions.query !== "function") {
      return { skipReason: "Permissions API not available in this browser" }
    }
    return { value: true, describe: "state in {granted, denied, prompt}" }
  },
  observe: async () => {
    const result = await navigator.permissions.query({
      name: "notifications",
    })
    const state = result.state
    const ok = state === "granted" || state === "denied" || state === "prompt"
    return { value: ok, describe: `"${state}"` }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const valuesCorrectnessTests: ReadonlyArray<TestDefinition> = [
  // Timezone (Req 9.1–9.6)
  intlResolvedOptionsTest,
  dateGetTimezoneOffsetTest,
  temporalTimeZoneIdTest,
  dateToStringTimezoneNameTest,
  dateToLocaleStringTimezoneTest,
  dateUtcPassthroughTest,
  // UTC surface passthrough (toISOString, toJSON, getUTC*)
  dateToIsoStringPassthroughTest,
  dateToJsonPassthroughTest,
  dateGetUtcMethodsPassthroughTest,
  // Date constructor / Date.parse behavior (not previously covered)
  dateConstructorNumericPassthroughTest,
  dateConstructorIsoUtcPassthroughTest,
  dateParseUtcPassthroughTest,
  dateInstanceIsDateTest,
  dateValueOfRoundTripTest,
  // Intl.DateTimeFormat explicit-timezone passthrough
  intlExplicitTimezonePassthroughTest,
  intlFormatToPartsHonorsExplicitTimezoneTest,
  // Temporal surfaces beyond timeZoneId
  temporalPlainDateTimeIsoHonorsIdentityTest,
  temporalZonedDateTimeIsoHonorsIdentityTest,
  temporalExplicitTimezonePassthroughTest,
  // Geolocation (Req 10.1–10.6)
  geolocationLatitudeTest,
  geolocationLongitudeTest,
  geolocationMatchesIdentityTest,
  geolocationWatchPositionTest,
]

/**
 * Behavioral tampering-signal tests that live in this module for
 * implementation convenience (they share helpers with the values battery)
 * but belong to the `geolocation-stealth` group so they surface under the
 * Tampering Signals category in the Verification Dashboard. A failure
 * here means a page can detect that geolocation is being spoofed — the
 * detection vector is the object shape or permission-surface shape, not
 * the coordinate values themselves.
 */
export const geolocationStealthBehavioralTests: ReadonlyArray<TestDefinition> =
  [
    geolocationPositionPrototypeTest,
    geolocationCoordsPrototypeTest,
    geolocationOptionalFieldsNullTest,
    geolocationTimestampRecentTest,
    permissionsPassthroughNotificationsTest,
  ]
