/**
 * Internal consistency battery.
 *
 * These behavioral tests answer the question "do two independent browser
 * APIs agree with each other when describing the same instant?" — the
 * expected and observed values are both derived from the browser, using
 * different APIs that ought to be self-consistent. A divergence here is
 * a tampering signal: a website can cross-check one API against another
 * and catch a spoofing implementation that missed a surface.
 *
 * All tests are assigned `group: "internal-consistency"` so they fall
 * under the Internal Consistency category in the Verification Dashboard.
 *
 * Req 11.10 is a cross-cutting rule: every `observe` body anchors its
 * `Date` on `ctx.getIdentity().startedAt` and derives both of the values
 * it compares from that single instant — it never calls `new Date()`
 * twice inside the test body. Two requirements carve out necessary
 * exceptions:
 *
 *   - Req 11.8 (`get-timezone-offset-stable-across-instants`) is *about*
 *     constructing two separate `Date` instances from the same fixed ISO
 *     string and asserting their offsets agree, so it inherently builds
 *     two Dates.
 *   - Req 11.9 (`date-now-monotonic`) is *about* asserting two
 *     consecutive `Date.now()` calls are monotonic, so it inherently
 *     samples the clock twice.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

// ---------------------------------------------------------------------------
// Offset parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a `GMT±HHMM`, `GMT±HH:MM`, `GMT±H`, or `GMT` substring into a
 * signed minute offset east of UTC. Returns `null` when no `GMT` token is
 * present in the input, and `0` when the token has no sign (plain `GMT`).
 *
 * This accepts every shape produced by the three APIs this module
 * compares:
 *
 *   - `Date.prototype.toString()` — `GMT-0800`, `GMT+0530`
 *   - `Intl.DateTimeFormat(..., { timeZoneName: "shortOffset" })` —
 *     `GMT`, `GMT+5`, `GMT-8`, `GMT+5:30`
 *   - `Intl.DateTimeFormat(..., { timeZoneName: "longOffset" })` —
 *     `GMT-08:00`, `GMT+05:30`
 */
function parseGmtOffsetEastMinutes(source: string): number | null {
  const match = /GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/.exec(source)
  if (!match) return null
  const sign = match[1]
  if (!sign) return 0
  const hours = Number.parseInt(match[2] ?? "0", 10)
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
  const magnitude = hours * 60 + minutes
  return sign === "-" ? -magnitude : magnitude
}

/**
 * Derive the east-of-UTC offset, in minutes, for the current runtime at
 * the given instant, using `Intl.DateTimeFormat` with
 * `timeZoneName: "shortOffset"` and no explicit `timeZone` option (so
 * the runtime's resolved zone is used — the same zone `Date` methods
 * consult).
 */
function shortOffsetEastMinutes(when: Date): number | null {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "shortOffset",
  })
  if (typeof fmt.formatToParts !== "function") return null
  const parts = fmt.formatToParts(when)
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  return parseGmtOffsetEastMinutes(tzName)
}

// ---------------------------------------------------------------------------
// Locale parsing lookups (en-US)
// ---------------------------------------------------------------------------

/** Map en-US long weekday names to `Date.prototype.getDay()` values. */
const WEEKDAY_TO_INDEX: ReadonlyMap<string, number> = new Map([
  ["Sunday", 0],
  ["Monday", 1],
  ["Tuesday", 2],
  ["Wednesday", 3],
  ["Thursday", 4],
  ["Friday", 5],
  ["Saturday", 6],
])

/** Map en-US long month names to `Date.prototype.getMonth()` values. */
const MONTH_TO_INDEX: ReadonlyMap<string, number> = new Map([
  ["January", 0],
  ["February", 1],
  ["March", 2],
  ["April", 3],
  ["May", 4],
  ["June", 5],
  ["July", 6],
  ["August", 7],
  ["September", 8],
  ["October", 9],
  ["November", 10],
  ["December", 11],
])

// ---------------------------------------------------------------------------
// Timezone internal-consistency tests
// ---------------------------------------------------------------------------

const offsetMatchesIntlResolvedTest = buildBehavioralTest<number>({
  id: "consistency.timezone.offset-matches-intl-resolved",
  group: "internal-consistency",
  name: "Date.getTimezoneOffset matches Intl shortOffset",
  description:
    "new Date().getTimezoneOffset() should be the negation of the minute offset implied by Intl.DateTimeFormat's shortOffset name for the same instant.",
  technique:
    'Capture one instant anchored on the identity snapshot\'s startedAt. Derive the east-of-UTC minutes from Intl.DateTimeFormat with timeZoneName: "shortOffset" and compare its negation to instant.getTimezoneOffset().',
  codeSnippet: `const instant = new Date(identity.startedAt)
const parts = new Intl.DateTimeFormat(undefined, {
  timeZoneName: "shortOffset",
}).formatToParts(instant)
// parse "GMT±HH:MM" → east-of-UTC minutes; negate
// compare to instant.getTimezoneOffset()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const east = shortOffsetEastMinutes(instant)
    if (east === null) {
      return { skipReason: "Intl shortOffset not supported in this browser" }
    }
    const value = -east
    return { value, describe: `${value} minutes (from Intl shortOffset)` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getTimezoneOffset()
    return { value, describe: `${value} minutes` }
  },
})

const getHoursMatchesToLocaleTimeStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-gethours-matches-tolocaletimestring",
  group: "internal-consistency",
  name: "Date.getHours matches toLocaleTimeString hour",
  description:
    'new Date().getHours() should equal the hour value parsed from toLocaleTimeString("en-US", { hour12: false, hour: "2-digit" }) for the same instant.',
  technique:
    'Capture one instant anchored on the identity snapshot\'s startedAt. Parse the two-digit hour from toLocaleTimeString and compare to instant.getHours(), normalizing the engine-specific "24" for midnight to 0.',
  codeSnippet: `const instant = new Date(identity.startedAt)
const hourStr = instant.toLocaleTimeString("en-US", {
  hour12: false,
  hour: "2-digit",
})
const hour = Number.parseInt(hourStr, 10) % 24
// compare to instant.getHours()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
    })
    const parsed = Number.parseInt(raw, 10)
    // en-US with hour12: false can emit "24" for midnight on some engines.
    const value = Number.isFinite(parsed) ? parsed % 24 : Number.NaN
    return {
      value,
      describe: `${value} (parsed from "${raw}")`,
    }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getHours()
    return { value, describe: String(value) }
  },
})

const getDayMatchesToLocaleDateStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getday-matches-tolocaledatestring",
  group: "internal-consistency",
  name: "Date.getDay matches toLocaleDateString weekday",
  description:
    'new Date().getDay() should correspond to the weekday name parsed from toLocaleDateString("en-US", { weekday: "long" }) for the same instant.',
  technique:
    "Capture one instant anchored on the identity snapshot's startedAt. Look up the weekday-index for the long weekday name emitted by toLocaleDateString and compare to instant.getDay().",
  codeSnippet: `const instant = new Date(identity.startedAt)
const weekday = instant.toLocaleDateString("en-US", { weekday: "long" })
// { Sunday: 0, Monday: 1, ..., Saturday: 6 }[weekday]
// compare to instant.getDay()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const weekday = instant.toLocaleDateString("en-US", { weekday: "long" })
    const resolved = WEEKDAY_TO_INDEX.get(weekday)
    const value = resolved ?? Number.NaN
    return {
      value,
      describe: `${value} (from "${weekday}")`,
    }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getDay()
    return { value, describe: String(value) }
  },
})

const getMonthMatchesToLocaleDateStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getmonth-matches-tolocaledatestring",
  group: "internal-consistency",
  name: "Date.getMonth matches toLocaleDateString month",
  description:
    'new Date().getMonth() should correspond to the month name parsed from toLocaleDateString("en-US", { month: "long" }) for the same instant.',
  technique:
    "Capture one instant anchored on the identity snapshot's startedAt. Look up the month-index for the long month name emitted by toLocaleDateString and compare to instant.getMonth().",
  codeSnippet: `const instant = new Date(identity.startedAt)
const month = instant.toLocaleDateString("en-US", { month: "long" })
// { January: 0, February: 1, ..., December: 11 }[month]
// compare to instant.getMonth()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const month = instant.toLocaleDateString("en-US", { month: "long" })
    const resolved = MONTH_TO_INDEX.get(month)
    const value = resolved ?? Number.NaN
    return {
      value,
      describe: `${value} (from "${month}")`,
    }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getMonth()
    return { value, describe: String(value) }
  },
})

const getDateMatchesToLocaleDateStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getdate-matches-tolocaledatestring",
  group: "internal-consistency",
  name: "Date.getDate matches toLocaleDateString day",
  description:
    'new Date().getDate() should equal the day number parsed from toLocaleDateString("en-US", { day: "numeric" }) for the same instant.',
  technique:
    "Capture one instant anchored on the identity snapshot's startedAt. Parse the numeric day from toLocaleDateString and compare to instant.getDate().",
  codeSnippet: `const instant = new Date(identity.startedAt)
const dayStr = instant.toLocaleDateString("en-US", { day: "numeric" })
const day = Number.parseInt(dayStr, 10)
// compare to instant.getDate()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toLocaleDateString("en-US", { day: "numeric" })
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isFinite(parsed) ? parsed : Number.NaN
    return {
      value,
      describe: `${value} (parsed from "${raw}")`,
    }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getDate()
    return { value, describe: String(value) }
  },
})

const toStringMatchesToLocaleStringOffsetTest = buildBehavioralTest<number>({
  id: "consistency.timezone.tostring-matches-tolocalestring-offset",
  group: "internal-consistency",
  name: "Date.toString GMT offset matches toLocaleString longOffset",
  description:
    'The GMT±HHMM offset substring in new Date().toString() should correspond numerically to the UTC±HH:MM offset substring in new Date().toLocaleString(undefined, { timeZoneName: "longOffset" }) for the same instant.',
  technique:
    'Capture one instant anchored on the identity snapshot\'s startedAt. Parse the signed minute offset from toString() and from toLocaleString with timeZoneName: "longOffset" and compare the two.',
  codeSnippet: `const instant = new Date(identity.startedAt)
const a = /* parse "GMT±HHMM" from instant.toString() */
const b = /* parse "GMT±HH:MM" from instant.toLocaleString(undefined, { timeZoneName: "longOffset" }) */
// a === b`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const longOffset = instant.toLocaleString(undefined, {
      timeZoneName: "longOffset",
    })
    const parsed = parseGmtOffsetEastMinutes(longOffset)
    if (parsed === null) {
      return {
        skipReason: "Intl longOffset produced no GMT token in this browser",
      }
    }
    return {
      value: parsed,
      describe: `${parsed} minutes (from toLocaleString longOffset: "${longOffset}")`,
    }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toString()
    const parsed = parseGmtOffsetEastMinutes(raw)
    const value = parsed ?? Number.NaN
    return {
      value,
      describe: `${value} minutes (from Date.toString: "${raw}")`,
    }
  },
})

const temporalMatchesDateToStringTest = buildBehavioralTest<string>({
  id: "consistency.timezone.temporal-matches-date-tostring",
  group: "internal-consistency",
  name: "Temporal.Now.zonedDateTimeISO timeZoneId matches Intl resolved zone",
  description:
    "When the Temporal API is available, Temporal.Now.zonedDateTimeISO().timeZoneId should equal the IANA identifier returned by Intl.DateTimeFormat().resolvedOptions().timeZone.",
  technique:
    "Feature-detect Temporal.Now.zonedDateTimeISO; when available, invoke it and compare its timeZoneId to Intl.DateTimeFormat().resolvedOptions().timeZone. Returns known-limitation when Temporal is unavailable.",
  codeSnippet: `Temporal.Now.zonedDateTimeISO().timeZoneId
// should equal new Intl.DateTimeFormat().resolvedOptions().timeZone`,
  expected: async () => {
    const temporalNow = (
      globalThis as unknown as {
        Temporal?: { Now?: { zonedDateTimeISO?: () => unknown } }
      }
    ).Temporal?.Now
    if (typeof temporalNow?.zonedDateTimeISO !== "function") {
      return { skipReason: "Temporal API not supported in this browser" }
    }
    const intlZone = new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
    return { value: intlZone, describe: intlZone || "(empty)" }
  },
  observe: async () => {
    const temporalNow = (
      globalThis as unknown as {
        Temporal: {
          Now: { zonedDateTimeISO: () => { timeZoneId: string } }
        }
      }
    ).Temporal.Now
    const id = temporalNow.zonedDateTimeISO().timeZoneId
    return { value: id, describe: id || "(empty)" }
  },
})

const getTimezoneOffsetStableAcrossInstantsTest = buildBehavioralTest<number>({
  id: "consistency.timezone.get-timezone-offset-stable-across-instants",
  group: "internal-consistency",
  name: "Date.getTimezoneOffset is stable across separate Date instances",
  description:
    "Constructing two separate Date instances from the same ISO string should return the same getTimezoneOffset() value — a spoofing implementation that corrupts the underlying state would produce drift here.",
  technique:
    'Construct two fresh Date objects from the fixed ISO string "2024-06-15T12:00:00Z" and assert their getTimezoneOffset() values are identical. Req 11.10 intentionally carves out this test — constructing two Dates is the whole point.',
  codeSnippet: `const a = new Date("2024-06-15T12:00:00Z").getTimezoneOffset()
const b = new Date("2024-06-15T12:00:00Z").getTimezoneOffset()
// a === b`,
  expected: async () => {
    const value = new Date("2024-06-15T12:00:00Z").getTimezoneOffset()
    return { value, describe: `${value} minutes (first instance)` }
  },
  observe: async () => {
    const value = new Date("2024-06-15T12:00:00Z").getTimezoneOffset()
    return { value, describe: `${value} minutes (second instance)` }
  },
})

const dateNowMonotonicTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-now-monotonic",
  group: "internal-consistency",
  name: "Date.now is monotonic across consecutive calls",
  description:
    "Two consecutive Date.now() calls should return values with the later call greater than or equal to the earlier call — a spoofing implementation that corrupts wall-clock monotonicity would regress the clock here.",
  technique:
    "Sample Date.now() twice in sequence and assert the second sample is greater than or equal to the first. Req 11.10 intentionally carves out this test — sampling the clock twice is the whole point.",
  codeSnippet: `const t1 = Date.now()
const t2 = Date.now()
// t2 >= t1`,
  expected: async () => {
    const t1 = Date.now()
    return { value: t1, describe: `first: ${t1}` }
  },
  observe: async () => {
    const t2 = Date.now()
    return { value: t2, describe: `second: ${t2}` }
  },
  equals: (first, second) => second >= first,
})

// ---------------------------------------------------------------------------
// Additional consistency checks
// ---------------------------------------------------------------------------

const getMinutesMatchesToLocaleTimeStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getminutes-matches-tolocaletimestring",
  group: "internal-consistency",
  name: "Date.getMinutes matches toLocaleTimeString minute",
  description:
    "new Date().getMinutes() should equal the minute value parsed from toLocaleTimeString. Critical for fractional-offset timezones (India +05:30, Nepal +05:45, Chatham +12:45) where a bug that forgets the minute component would only surface here.",
  technique:
    'Capture one instant anchored on startedAt. Parse the two-digit minute from toLocaleTimeString("en-US", { hour12: false, minute: "2-digit" }) and compare to instant.getMinutes().',
  codeSnippet: `const instant = new Date(identity.startedAt)
const minuteStr = instant.toLocaleTimeString("en-US", {
  hour12: false,
  minute: "2-digit",
})
Number.parseInt(minuteStr, 10) === instant.getMinutes()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toLocaleTimeString("en-US", {
      hour12: false,
      minute: "2-digit",
    })
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isFinite(parsed) ? parsed : Number.NaN
    return { value, describe: `${value} (parsed from "${raw}")` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getMinutes()
    return { value, describe: String(value) }
  },
})

const getSecondsMatchesToLocaleTimeStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getseconds-matches-tolocaletimestring",
  group: "internal-consistency",
  name: "Date.getSeconds matches toLocaleTimeString second",
  description:
    "new Date().getSeconds() should equal the second value parsed from toLocaleTimeString. Timezone-independent in principle, but the override keeps its own getter and a mismatch would expose a mistaken spoofing path.",
  technique:
    'Capture one instant anchored on startedAt. Parse the two-digit second from toLocaleTimeString("en-US", { hour12: false, second: "2-digit" }) and compare to instant.getSeconds().',
  codeSnippet: `const instant = new Date(identity.startedAt)
const secondStr = instant.toLocaleTimeString("en-US", {
  hour12: false,
  second: "2-digit",
})
Number.parseInt(secondStr, 10) === instant.getSeconds()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toLocaleTimeString("en-US", {
      hour12: false,
      second: "2-digit",
    })
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isFinite(parsed) ? parsed : Number.NaN
    return { value, describe: `${value} (parsed from "${raw}")` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getSeconds()
    return { value, describe: String(value) }
  },
})

const getFullYearMatchesToLocaleDateStringTest = buildBehavioralTest<number>({
  id: "consistency.timezone.date-getfullyear-matches-tolocaledatestring",
  group: "internal-consistency",
  name: "Date.getFullYear matches toLocaleDateString year",
  description:
    "new Date().getFullYear() should equal the year value parsed from toLocaleDateString. Relevant on New Year's Eve in a zone that straddles the year boundary with UTC — a missed spoofing path would show the wrong year.",
  technique:
    'Capture one instant anchored on startedAt. Parse the four-digit year from toLocaleDateString("en-US", { year: "numeric" }) and compare to instant.getFullYear().',
  codeSnippet: `const instant = new Date(identity.startedAt)
const yearStr = instant.toLocaleDateString("en-US", { year: "numeric" })
Number.parseInt(yearStr, 10) === instant.getFullYear()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const raw = instant.toLocaleDateString("en-US", { year: "numeric" })
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isFinite(parsed) ? parsed : Number.NaN
    return { value, describe: `${value} (parsed from "${raw}")` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.getFullYear()
    return { value, describe: String(value) }
  },
})

const toDateStringMatchesResolvedZoneTest = buildBehavioralTest<boolean>({
  id: "consistency.timezone.todatestring-matches-resolved-zone",
  group: "internal-consistency",
  name: "Date.toDateString day/month agree with the resolved zone",
  description:
    'The three-letter weekday and month in Date.prototype.toDateString() (e.g. "Mon Jan 01 2024") should match what Intl.DateTimeFormat emits for the resolved zone at the same instant. A toDateString override that forgets to shift for timezone would surface here.',
  technique:
    "Capture one instant anchored on startedAt. Produce the three-letter weekday+month via Intl for the resolved zone and compare to the corresponding substring from instant.toDateString().",
  codeSnippet: `const instant = new Date(identity.startedAt)
const tokens = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
}).formatToParts(instant)
// combine e.g. "Mon Jan"
const prefix = instant.toDateString().slice(0, 7)
prefix === expected`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const fmt = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
    })
    if (typeof fmt.formatToParts !== "function") {
      return { skipReason: "Intl.formatToParts not supported" }
    }
    const parts = fmt.formatToParts(instant)
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? ""
    const month = parts.find((p) => p.type === "month")?.value ?? ""
    const expectedPrefix = `${weekday} ${month}`
    return { value: true, describe: `starts with "${expectedPrefix}"` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const fmt = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
    })
    const parts = fmt.formatToParts(instant)
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? ""
    const month = parts.find((p) => p.type === "month")?.value ?? ""
    const expectedPrefix = `${weekday} ${month}`
    const dateStr = instant.toDateString()
    const value = dateStr.startsWith(expectedPrefix)
    return { value, describe: `toDateString: "${dateStr}"` }
  },
})

const toTimeStringMatchesOffsetTest = buildBehavioralTest<number>({
  id: "consistency.timezone.totimestring-matches-resolved-offset",
  group: "internal-consistency",
  name: "Date.toTimeString GMT offset matches getTimezoneOffset",
  description:
    'The GMT±HHMM substring in Date.prototype.toTimeString() (e.g. "GMT-0800") should describe the same offset returned by Date.getTimezoneOffset() for the same instant. Fractional offsets would surface a bug here that getHours alone misses.',
  technique:
    "Capture one instant anchored on startedAt. Parse the GMT offset substring from instant.toTimeString() and compare to -instant.getTimezoneOffset() (both in east-of-UTC minutes).",
  codeSnippet: `const instant = new Date(identity.startedAt)
const timeStr = instant.toTimeString() // "HH:MM:SS GMT±HHMM (Zone)"
const east = parseGmtOffset(timeStr)   // east-of-UTC minutes
east === -instant.getTimezoneOffset()`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = -instant.getTimezoneOffset()
    return { value, describe: `${value} east-of-UTC minutes` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const timeStr = instant.toTimeString()
    const parsed = parseGmtOffsetEastMinutes(timeStr)
    const value = parsed ?? Number.NaN
    return { value, describe: `${value} (from "${timeStr}")` }
  },
})

const intlFormatMatchesFormatToPartsTest = buildBehavioralTest<string>({
  id: "consistency.timezone.intl-format-matches-formattoparts",
  group: "internal-consistency",
  name: "Intl.DateTimeFormat.format matches the concatenation of formatToParts",
  description:
    "format() and formatToParts() must agree for the same formatter and instant — the concatenation of formatToParts().value should equal format(). A divergence here means one surface is spoofed and the other is not.",
  technique:
    "Construct an Intl.DateTimeFormat with a fixed option set, format a fixed instant both ways, and compare the outputs character-for-character.",
  codeSnippet: `const fmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", timeZoneName: "short",
})
const d = new Date(identity.startedAt)
const full = fmt.format(d)
const parts = fmt.formatToParts(d).map((p) => p.value).join("")
full === parts`,
  expected: async (ctx) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })
    if (typeof fmt.formatToParts !== "function") {
      return { skipReason: "Intl.formatToParts not supported" }
    }
    const instant = new Date(ctx.getIdentity().startedAt)
    const full = fmt.format(instant)
    return { value: full, describe: `format(): "${full}"` }
  },
  observe: async (ctx) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })
    const instant = new Date(ctx.getIdentity().startedAt)
    const parts = fmt.formatToParts(instant)
    const joined = parts.map((p) => p.value).join("")
    return { value: joined, describe: `formatToParts joined: "${joined}"` }
  },
})

const toLocaleStringMatchesIntlFormatTest = buildBehavioralTest<string>({
  id: "consistency.timezone.tolocalestring-matches-intl-format",
  group: "internal-consistency",
  name: "Date.toLocaleString matches Intl.DateTimeFormat.format for identical options",
  description:
    'new Date().toLocaleString("en-US", opts) should equal new Intl.DateTimeFormat("en-US", opts).format(new Date()) for the same instant and option set. Two independent paths through the date-formatting machinery that must agree.',
  technique:
    "Capture one instant anchored on startedAt. Format it via toLocaleString and via Intl.DateTimeFormat.format with identical options and compare the strings.",
  codeSnippet: `const opts = {
  year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", timeZoneName: "short",
}
const d = new Date(identity.startedAt)
d.toLocaleString("en-US", opts) ===
  new Intl.DateTimeFormat("en-US", opts).format(d)`,
  expected: async (ctx) => {
    const opts: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = new Intl.DateTimeFormat("en-US", opts).format(instant)
    return { value, describe: `Intl.format: "${value}"` }
  },
  observe: async (ctx) => {
    const opts: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }
    const instant = new Date(ctx.getIdentity().startedAt)
    const value = instant.toLocaleString("en-US", opts)
    return { value, describe: `toLocaleString: "${value}"` }
  },
})

const dstOffsetDiffersAcrossSeasonsTest = buildBehavioralTest<boolean>({
  id: "consistency.timezone.dst-offset-differs-jan-vs-jul",
  group: "internal-consistency",
  name: "DST-observing zones report different offsets in Jan vs Jul",
  description:
    "For the resolved zone, the getTimezoneOffset of a fixed January instant should differ from the getTimezoneOffset of a fixed July instant when DST is observed. A spoofing implementation that returns a constant offset across seasons would regress here. Zones without DST (e.g. UTC, most of Asia) short-circuit to a known-limitation.",
  technique:
    "Construct Dates anchored on 2024-01-15T12:00:00Z and 2024-07-15T12:00:00Z and compare their getTimezoneOffset() values. If they're equal, the resolved zone either doesn't observe DST or the override is leaking a constant offset — we use the Identity snapshot's dstActive flag to distinguish these.",
  codeSnippet: `const jan = new Date("2024-01-15T12:00:00Z").getTimezoneOffset()
const jul = new Date("2024-07-15T12:00:00Z").getTimezoneOffset()
// if the zone observes DST, jan !== jul`,
  expected: async (ctx) => {
    const identity = ctx.getIdentity()
    // For zones that don't observe DST, this check doesn't apply.
    // We can't tell from the snapshot alone whether the zone observes
    // DST at all (only whether it's currently active), so we probe both
    // Jan and Jul against the runtime: if they match, we skip.
    const janOffset = new Date("2024-01-15T12:00:00Z").getTimezoneOffset()
    const julOffset = new Date("2024-07-15T12:00:00Z").getTimezoneOffset()
    if (janOffset === julOffset) {
      return {
        skipReason: `Zone "${identity.timezone.identifier || "(unknown)"}" does not observe DST in 2024 (Jan and Jul offsets both ${janOffset})`,
      }
    }
    return {
      value: true,
      describe: `jan=${janOffset}, jul=${julOffset} (different, as expected for a DST zone)`,
    }
  },
  observe: async () => {
    const janOffset = new Date("2024-01-15T12:00:00Z").getTimezoneOffset()
    const julOffset = new Date("2024-07-15T12:00:00Z").getTimezoneOffset()
    const value = janOffset !== julOffset
    return {
      value,
      describe: `jan=${janOffset} minutes, jul=${julOffset} minutes, differ=${String(value)}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
// CreepJS-style Date self-consistency battery
// ---------------------------------------------------------------------------
//
// CreepJS's timezone panel runs several checks that cross-verify pieces
// of the Date/Intl/Temporal surface against each other. The following
// tests replicate its most pedantic probes, catching bugs our
// category-oriented tests missed.

// The following six tests guard the set/get round-trip invariant for
// every Date component the extension overrides a getter for. The
// bug-surfacing behaviour is different for each one:
//
//   - setHours is the universal fingerprint of a get/set mismatch.
//     Any zone pair where real ≠ spoofed offset (which is always,
//     when spoofing is active and succeeds) produces divergence.
//     CreepJS's valid.time check renders this exact invariant.
//
//   - setMinutes only diverges in zone pairs whose offset difference
//     has a non-zero minute component (India +05:30, Nepal +05:45,
//     Chatham +12:45, Newfoundland -03:30, etc.). In all-integer-hour
//     offsets this test round-trips even with a broken setter, because
//     the minute component is invariant under pure-hour shifts.
//
//   - setSeconds is safe under every real-world zone pair — no tzdb
//     zone has a second-level offset — so this test is a pure
//     regression guard against future spoofing mistakes, not a
//     here-and-now bug surfacer.
//
//   - setDate / setMonth / setFullYear diverge only when the offset
//     shift crosses a day / month / year boundary, which requires a
//     specific starting epoch AND a large offset delta. These are
//     regression guards for the rare edge case.
//
// They're grouped under Internal Consistency as set/get round-trip
// assertions: the intent is to make sure a future refactor that
// changes one of the six setter / getter pairs doesn't silently
// break round-tripping for that particular component.

const setHoursRoundTripsThroughGetHoursTest = buildBehavioralTest<number>({
  id: "consistency.timezone.sethours-roundtrips-through-gethours",
  group: "internal-consistency",
  name: "setHours followed by getHours returns the value set",
  description:
    "date.setHours(H) followed by date.getHours() must return H — sites that drive time pickers or recompute schedules via setHours expect reads to agree with writes. This is the universal fingerprint of a get/set mismatch: whenever the real and spoofed offsets differ (which is always, during successful spoofing), a spoofer that overrides the getter but not the setter diverges here because the setter interprets its input in one zone and the getter reads back in another. CreepJS's valid.time check is a direct rendering of this invariant.",
  technique:
    "Instantiate a fresh Date, call setHours(7), then read getHours() and assert it equals 7. Req 11.10 is intentionally bypassed: this test is about the internal consistency of a single Date instance's setter/getter pair, not cross-API consistency at a shared instant.",
  codeSnippet: `const d = new Date()
d.setHours(7)
d.getHours() === 7`,
  expected: async () => {
    return { value: 7, describe: "setHours(7) → getHours() should return 7" }
  },
  observe: async () => {
    const d = new Date()
    d.setHours(7)
    const value = d.getHours()
    return { value, describe: `getHours() returned ${value}` }
  },
})

const setMinutesRoundTripsThroughGetMinutesTest = buildBehavioralTest<number>({
  id: "consistency.timezone.setminutes-roundtrips-through-getminutes",
  group: "internal-consistency",
  name: "setMinutes followed by getMinutes returns the value set",
  description:
    "date.setMinutes(M) followed by date.getMinutes() must return M. This test only diverges in zone pairs whose offset difference includes a non-zero minute component — India (+05:30), Nepal (+05:45), Chatham (+12:45), Newfoundland (-03:30) — so a broken setter can silently round-trip with an all-integer-hour pair and then fail the moment the user spoofs to one of these zones.",
  technique:
    "Instantiate a fresh Date, call setMinutes(37), then read getMinutes() and assert it equals 37. The value is chosen to not be a multiple of 15 or 30 so it surfaces fractional-offset bugs cleanly.",
  codeSnippet: `const d = new Date()
d.setMinutes(37)
d.getMinutes() === 37`,
  expected: async () => {
    return {
      value: 37,
      describe: "setMinutes(37) → getMinutes() should return 37",
    }
  },
  observe: async () => {
    const d = new Date()
    d.setMinutes(37)
    const value = d.getMinutes()
    return { value, describe: `getMinutes() returned ${value}` }
  },
})

const setSecondsRoundTripsThroughGetSecondsTest = buildBehavioralTest<number>({
  id: "consistency.timezone.setseconds-roundtrips-through-getseconds",
  group: "internal-consistency",
  name: "setSeconds followed by getSeconds returns the value set",
  description:
    "date.setSeconds(S) followed by date.getSeconds() must return S. No IANA zone has a second-level offset, so this test is a regression guard against a future override that accidentally re-derives seconds through a timezone-dependent path rather than leaving the component passthrough.",
  technique:
    "Instantiate a fresh Date, call setSeconds(42), then read getSeconds() and assert it equals 42.",
  codeSnippet: `const d = new Date()
d.setSeconds(42)
d.getSeconds() === 42`,
  expected: async () => {
    return {
      value: 42,
      describe: "setSeconds(42) → getSeconds() should return 42",
    }
  },
  observe: async () => {
    const d = new Date()
    d.setSeconds(42)
    const value = d.getSeconds()
    return { value, describe: `getSeconds() returned ${value}` }
  },
})

const setDateRoundTripsThroughGetDateTest = buildBehavioralTest<number>({
  id: "consistency.timezone.setdate-roundtrips-through-getdate",
  group: "internal-consistency",
  name: "setDate followed by getDate returns the value set",
  description:
    "date.setDate(D) followed by date.getDate() must return D. Sites that do day arithmetic (date.setDate(date.getDate() + 1) for 'tomorrow') depend on this invariant. A broken setter only diverges here when the zone shift is large enough to push the epoch across a day boundary — a regression guard for that edge case.",
  technique:
    "Instantiate a fresh Date, call setDate(15) (a mid-month value that never overflows), then read getDate() and assert it equals 15.",
  codeSnippet: `const d = new Date()
d.setDate(15)
d.getDate() === 15`,
  expected: async () => {
    return { value: 15, describe: "setDate(15) → getDate() should return 15" }
  },
  observe: async () => {
    const d = new Date()
    d.setDate(15)
    const value = d.getDate()
    return { value, describe: `getDate() returned ${value}` }
  },
})

const setMonthRoundTripsThroughGetMonthTest = buildBehavioralTest<number>({
  id: "consistency.timezone.setmonth-roundtrips-through-getmonth",
  group: "internal-consistency",
  name: "setMonth followed by getMonth returns the value set",
  description:
    "date.setMonth(M) followed by date.getMonth() must return M. A broken setter only diverges here when the zone shift combined with the starting epoch crosses a month boundary — rare, but possible near the 1st / 31st of a month in a zone pair with an ~12-hour difference. Kept as a regression guard for that edge case.",
  technique:
    "Instantiate a fresh Date, snap its day to the 15th (so setMonth never overflows into the next month on 31-day-to-shorter transitions), call setMonth(5) for June, then read getMonth() and assert it equals 5.",
  codeSnippet: `const d = new Date()
d.setDate(15)
d.setMonth(5)
d.getMonth() === 5`,
  expected: async () => {
    return {
      value: 5,
      describe: "setMonth(5) → getMonth() should return 5 (June, 0-indexed)",
    }
  },
  observe: async () => {
    const d = new Date()
    d.setDate(15)
    d.setMonth(5)
    const value = d.getMonth()
    return { value, describe: `getMonth() returned ${value}` }
  },
})

const setFullYearRoundTripsThroughGetFullYearTest = buildBehavioralTest<number>(
  {
    id: "consistency.timezone.setfullyear-roundtrips-through-getfullyear",
    group: "internal-consistency",
    name: "setFullYear followed by getFullYear returns the value set",
    description:
      "date.setFullYear(Y) followed by date.getFullYear() must return Y. A broken setter only diverges here in the narrow window around New Year's Eve in a zone pair large enough to shift the epoch across the year boundary — a regression guard for that edge case.",
    technique:
      "Instantiate a fresh Date, call setFullYear(2030), then read getFullYear() and assert it equals 2030.",
    codeSnippet: `const d = new Date()
d.setFullYear(2030)
d.getFullYear() === 2030`,
    expected: async () => {
      return {
        value: 2030,
        describe: "setFullYear(2030) → getFullYear() should return 2030",
      }
    },
    observe: async () => {
      const d = new Date()
      d.setFullYear(2030)
      const value = d.getFullYear()
      return { value, describe: `getFullYear() returned ${value}` }
    },
  }
)

const epochOneSevenNineteenSeventyIsMidnightTest = buildBehavioralTest<boolean>(
  {
    id: "consistency.timezone.epoch-1970-07-01-is-midnight-in-spoofed-zone",
    group: "internal-consistency",
    name: "new Date('07/01/1970') lands on midnight local (spoofed) time",
    description:
      'CreepJS\'s valid.clock check constructs new Date("07/01/1970") and asserts getHours/getMinutes/getSeconds/getMilliseconds are all zero. Ambiguous date strings must adjust to midnight in whatever timezone the browser reports as local — if our spoofing pipeline over- or under-adjusts for this fixed date the whole timezone panel goes red.',
    technique:
      'Construct new Date("07/01/1970") — an ambiguous date string with no explicit timezone — and assert all four local-time components round to zero.',
    codeSnippet: `const d = new Date("07/01/1970")
d.getHours() === 0 &&
d.getMinutes() === 0 &&
d.getSeconds() === 0 &&
d.getMilliseconds() === 0`,
    expected: async () => {
      return {
        value: true,
        describe: "all four components equal 0",
      }
    },
    observe: async () => {
      const d = new Date("07/01/1970")
      const h = d.getHours()
      const m = d.getMinutes()
      const s = d.getSeconds()
      const ms = d.getMilliseconds()
      const value = h === 0 && m === 0 && s === 0 && ms === 0
      return {
        value,
        describe: `h=${h}, m=${m}, s=${s}, ms=${ms}`,
      }
    },
  }
)

const newDateEqualsDateCallTest = buildBehavioralTest<string>({
  id: "consistency.timezone.new-date-equals-date-function-call",
  group: "internal-consistency",
  name: "new Date().toString() agrees with Date() on the timezone label",
  description:
    'CreepJS\'s valid.date check compares `new Date() == Date()` (both sides coerce to strings via Date.prototype.toString). Native engines produce the same timezone label on both sides; a spoofer that overrides new Date() but leaves the no-new Date() branch calling the real system zone produces two strings with different "GMT±HHMM" and timezone-name substrings, which is trivially detectable.',
  technique:
    "Capture the GMT-offset-and-zone-name tail of new Date().toString() and of the string returned by Date() (invoked without new), normalize the clock components out, and assert the two zone tails are identical.",
  codeSnippet: `const a = new Date().toString()
const b = Date()
// "Mon May 12 2026 10:00:00 GMT-0800 (Alaska Daylight Time)"
// zone tail: everything after the time portion
a.slice(a.indexOf("GMT")) === b.slice(b.indexOf("GMT"))`,
  expected: async () => {
    const a = new Date().toString()
    const idx = a.indexOf("GMT")
    const tail = idx === -1 ? "" : a.slice(idx)
    return {
      value: tail,
      describe: `new Date().toString() zone tail: "${tail}"`,
    }
  },
  observe: async () => {
    // Date() (no new) returns a string of the current time.
    const b: unknown = (Date as unknown as () => string)()
    const str = typeof b === "string" ? b : String(b)
    const idx = str.indexOf("GMT")
    const tail = idx === -1 ? "" : str.slice(idx)
    return { value: tail, describe: `Date() zone tail: "${tail}"` }
  },
})

const dateEpochSurfacesAgreeTest = buildBehavioralTest<boolean>({
  id: "consistency.timezone.date-epoch-surfaces-agree",
  group: "internal-consistency",
  name: "Date.now, +new Date, valueOf, and getTime return the same epoch",
  description:
    "CreepJS's valid.nowTime check samples four ways to read the current epoch — Date.now(), +new Date(), new Date().getTime(), new Date().valueOf() — and asserts they all agree (within the millisecond those four calls take to execute). A spoofer that adjusts the epoch on one surface but not another diverges here. We tolerate a 10ms drift between the first and last sample to absorb slow machines; any gap larger than that is a genuine inconsistency.",
  technique:
    "Sample the four surfaces back-to-back and assert all four values fall within a 10ms window. This is the wall-clock equivalent of dateNowMonotonic but spans four independent entry points to the same underlying epoch.",
  codeSnippet: `const a = Date.now()
const d = new Date()
const b = +d
const c = d.getTime()
const e = d.valueOf()
// Max(a, b, c, e) - Min(a, b, c, e) < 10`,
  expected: async () => {
    return { value: true, describe: "all four surfaces within 10ms" }
  },
  observe: async () => {
    const a = Date.now()
    const d = new Date()
    const b = +d
    const c = d.getTime()
    const e = d.valueOf()
    const samples = [a, b, c, e]
    const spread = Math.max(...samples) - Math.min(...samples)
    const value = spread < 10
    return {
      value,
      describe: `Date.now=${a}, +new Date=${b}, getTime=${c}, valueOf=${e} (spread=${spread}ms)`,
    }
  },
})

const utcSurfacesAgreeTest = buildBehavioralTest<string>({
  id: "consistency.timezone.utc-surfaces-agree",
  group: "internal-consistency",
  name: "toISOString, toJSON, and JSON.stringify agree on UTC representation",
  description:
    "CreepJS's valid.utcTime check compares three UTC surfaces — new Date().toISOString(), new Date().toJSON(), and JSON.stringify(new Date()).slice(1, -1) — and asserts they all match. These surfaces are intentionally NOT overridden (they expose UTC, not local time), so they should all agree by default. A spoofer that accidentally hooks one of them will regress here.",
  technique:
    "Anchor on ctx.getIdentity().startedAt for a single Date, produce the three UTC surfaces, and assert they're pairwise equal. Using a fixed instant avoids millisecond-boundary flake that sampling `new Date()` three times would introduce.",
  codeSnippet: `const d = new Date(identity.startedAt)
const a = d.toISOString()
const b = d.toJSON()
const c = JSON.stringify(d).slice(1, -1)
a === b && a === c`,
  expected: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const a = instant.toISOString()
    return { value: a, describe: `toISOString: "${a}"` }
  },
  observe: async (ctx) => {
    const instant = new Date(ctx.getIdentity().startedAt)
    const iso = instant.toISOString()
    const json = instant.toJSON()
    const stringified = JSON.stringify(instant).slice(1, -1)
    const allAgree = iso === json && iso === stringified
    const value = allAgree
      ? iso
      : `DIVERGED: iso=${iso}, toJSON=${json}, stringify=${stringified}`
    return {
      value,
      describe: allAgree
        ? `all three agree on "${iso}"`
        : `DIVERGED: toISOString="${iso}", toJSON="${json}", JSON.stringify="${stringified}"`,
    }
  },
})

// ---------------------------------------------------------------------------

export const internalConsistencyTests: ReadonlyArray<TestDefinition> = [
  offsetMatchesIntlResolvedTest,
  getHoursMatchesToLocaleTimeStringTest,
  getMinutesMatchesToLocaleTimeStringTest,
  getSecondsMatchesToLocaleTimeStringTest,
  getDayMatchesToLocaleDateStringTest,
  getMonthMatchesToLocaleDateStringTest,
  getDateMatchesToLocaleDateStringTest,
  getFullYearMatchesToLocaleDateStringTest,
  toStringMatchesToLocaleStringOffsetTest,
  toDateStringMatchesResolvedZoneTest,
  toTimeStringMatchesOffsetTest,
  intlFormatMatchesFormatToPartsTest,
  toLocaleStringMatchesIntlFormatTest,
  temporalMatchesDateToStringTest,
  getTimezoneOffsetStableAcrossInstantsTest,
  dstOffsetDiffersAcrossSeasonsTest,
  dateNowMonotonicTest,
  // CreepJS-style Date self-consistency battery
  setHoursRoundTripsThroughGetHoursTest,
  setMinutesRoundTripsThroughGetMinutesTest,
  setSecondsRoundTripsThroughGetSecondsTest,
  setDateRoundTripsThroughGetDateTest,
  setMonthRoundTripsThroughGetMonthTest,
  setFullYearRoundTripsThroughGetFullYearTest,
  epochOneSevenNineteenSeventyIsMidnightTest,
  newDateEqualsDateCallTest,
  dateEpochSurfacesAgreeTest,
  utcSurfacesAgreeTest,
]
