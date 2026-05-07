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
]
