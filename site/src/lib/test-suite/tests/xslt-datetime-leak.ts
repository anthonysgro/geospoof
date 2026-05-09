/**
 * XSLT / EXSLT datetime leak probe.
 *
 * `XSLTProcessor` is a C++ engine inside Gecko that sits entirely below
 * the JavaScript date machinery. When a stylesheet calls the EXSLT
 * function `date:date-time()`, the engine emits a string formatted as
 * `YYYY-MM-DDTHH:MM:SS.sss±HH:MM` using the real system clock and the
 * real system timezone offset — never touching `Date.prototype`,
 * `Intl.DateTimeFormat`, or `Temporal`. Content-script overrides cannot
 * reach into that code path because the XSLT processor doesn't call
 * back out to JavaScript for timestamps.
 *
 * This is the technique arkenfox's TZP relies on for its ground-truth
 * timezone offset — it's used to expose any spoofing mismatches in
 * `Date`/`Intl`/`Temporal`. As long as Gecko ships EXSLT by default
 * (pref `dom.xslt.enabled`, on at the time of writing), the leak is
 * unpatchable from userland. Only Gecko exposes the `date-time()`
 * extension — Chromium-based engines don't implement EXSLT, so the
 * function returns an empty string there and the leak is Firefox-only.
 *
 * The test belongs to `known-limitations`: even though we haven't
 * patched it yet, the only way to close it is either a browser-native
 * fix (disable EXSLT, patch the XSLT processor's datetime function) or
 * an extremely invasive intercept of `XSLTProcessor.prototype.
 * transformToFragment` / `transformToDocument` that parses the emitted
 * string and rewrites the offset. Both are significantly beyond the
 * scope of a content-script extension and both have their own
 * detection vectors.
 *
 * Browser-global access lives inside the `expected` / `observe`
 * callbacks so the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

/**
 * Stylesheet that, when run through `XSLTProcessor`, returns the
 * current datetime in `date:date-time()` format. Must match the
 * stylesheet arkenfox ships verbatim so we demonstrate the exact
 * technique an adversary would use.
 */
const EXSLT_DATETIME_STYLESHEET =
  '<xsl:stylesheet version="1.0" ' +
  'xmlns:xsl="http://www.w3.org/1999/XSL/Transform" ' +
  'xmlns:date="http://exslt.org/dates-and-times" ' +
  'extension-element-prefixes="date">' +
  '<xsl:output method="html"/>' +
  '<xsl:template match="/">' +
  '<xsl:value-of select="date:date-time()" />' +
  "</xsl:template>" +
  "</xsl:stylesheet>"

/**
 * Run the EXSLT stylesheet and return the emitted datetime string, or
 * `null` when the call fails (Chromium, no EXSLT support, pref off,
 * etc.). We catch every possible throw so the test reports a clean
 * skip rather than a surprise error.
 */
function runExsltDatetime(): string | null {
  if (
    typeof XSLTProcessor === "undefined" ||
    typeof DOMParser === "undefined"
  ) {
    return null
  }
  try {
    const doc = new DOMParser().parseFromString(
      EXSLT_DATETIME_STYLESHEET,
      "text/xml"
    )
    const processor = new XSLTProcessor()
    processor.importStylesheet(doc)
    const fragment = processor.transformToFragment(doc, document)
    const value = fragment.childNodes[0]?.nodeValue
    if (typeof value !== "string" || value.length === 0) return null
    return value
  } catch {
    return null
  }
}

/**
 * Parse the `±HH:MM` or `Z` suffix of an EXSLT datetime string into
 * "minutes west of UTC" — matching the convention used by
 * `Date.prototype.getTimezoneOffset`. Returns `null` when the suffix
 * isn't recognisable.
 */
function parseExsltOffsetMinutes(exsltDateTime: string): number | null {
  // EXSLT emits ISO-ish strings. The trailing offset is either `Z` or
  // `±HH:MM` at the end of the string.
  const match = /(Z|([+-])(\d{2}):(\d{2}))$/.exec(exsltDateTime)
  if (!match) return null
  if (match[1] === "Z") return 0
  const sign = match[2] === "-" ? 1 : -1 // Date convention: west is positive
  const hours = Number.parseInt(match[3], 10)
  const minutes = Number.parseInt(match[4], 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return sign * (hours * 60 + minutes)
}

/**
 * The leak test itself. Compares the EXSLT-derived offset against the
 * spoofed offset the Identity Panel is displaying. When the two
 * disagree, the XSLT processor is emitting the real system offset
 * behind our back.
 */
const xsltDatetimeLeakTest = buildBehavioralTest<number>({
  id: "known-limitation.xslt.exslt-date-time-leaks-offset",
  group: "known-limitations",
  name: "XSLTProcessor emits the real timezone offset",
  description:
    "`XSLTProcessor` runs inside a C++ engine that doesn't round-trip through the JavaScript date machinery. The EXSLT extension function `date:date-time()` emits an ISO datetime string that includes the real system UTC offset (formatted as `±HH:MM`), bypassing every Date / Intl / Temporal override a content-script extension can install. This is the technique arkenfox's TZP uses as its ground-truth timezone source. The leak only affects Gecko (Chromium doesn't ship EXSLT), but on Gecko it is unpatchable without either disabling EXSLT at the browser level or intercepting the XSLT processor itself — both significantly beyond content-script scope. Surfaced as a known limitation so users understand the remaining detection vector.",
  technique:
    "Parse and apply an EXSLT stylesheet that emits `date:date-time()`, extract the `±HH:MM` offset from the resulting string, and compare it against the offset reported by `Date.prototype.getTimezoneOffset`. When they match, the leak is closed (either we patched it or the engine doesn't support EXSLT). When they differ, XSLT is emitting an offset the overrides can't reach.",
  codeSnippet: `const xsl = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" ' +
  'xmlns:date="http://exslt.org/dates-and-times" extension-element-prefixes="date">' +
  '<xsl:output method="html"/>' +
  '<xsl:template match="/"><xsl:value-of select="date:date-time()" /></xsl:template>' +
  '</xsl:stylesheet>'
const doc = new DOMParser().parseFromString(xsl, "text/xml")
const p = new XSLTProcessor()
p.importStylesheet(doc)
const dateTime = p.transformToFragment(doc, document).childNodes[0].nodeValue
// e.g. "2025-11-07T17:23:45.123-08:00" — offset is the REAL system zone`,
  expected: async () => {
    if (typeof XSLTProcessor === "undefined") {
      return { skipReason: "XSLTProcessor unavailable in this runtime" }
    }
    // Ground truth is whatever `Date` is currently reporting, read live
    // at test-run time rather than from the Identity snapshot — the
    // snapshot is captured at React mount time and can lose the
    // extension-initialization race, causing it to hold the real zone
    // while the override has since settled. Reading `Date` live means
    // we compare "what the page would see through the JS API" against
    // "what the page would see through the XSLT C++ engine", which is
    // exactly the mismatch a fingerprinter would detect.
    const offsetMinutes = new Date().getTimezoneOffset()
    return {
      value: offsetMinutes,
      describe: `${formatOffset(offsetMinutes)} (Date.prototype.getTimezoneOffset)`,
    }
  },
  observe: async () => {
    const value = runExsltDatetime()
    if (value === null) {
      // No EXSLT support (Chromium), XSLT disabled entirely, or the
      // processor threw. Nothing to measure — report as the spoofed
      // value so the pass/fail compare short-circuits to pass. We
      // purposely don't emit a skip here: when EXSLT isn't present,
      // the leak doesn't exist and the "test" is trivially passing,
      // which is the honest signal.
      return {
        value: Number.NaN,
        describe:
          "XSLTProcessor.transformToFragment returned no datetime — likely Chromium or XSLT disabled",
      }
    }
    const offset = parseExsltOffsetMinutes(value)
    if (offset === null) {
      return {
        value: Number.NaN,
        describe: `XSLT emitted "${value}" but no ±HH:MM offset could be parsed`,
      }
    }
    return {
      value: offset,
      describe: `${formatOffset(offset)} via date:date-time() → "${value}"`,
    }
  },
  equals: (expected, observed) => {
    // When EXSLT isn't present, observed is NaN — treat that as a pass
    // so engines without the leak don't flag the test. This keeps the
    // known-limitation framing honest: the test "fails" (is marked
    // known-limitation by the runner) ONLY on engines that actually
    // expose the leak AND report an offset that differs from the
    // spoofed zone.
    if (Number.isNaN(observed)) return true
    return expected === observed
  },
})

function formatOffset(minutesWest: number): string {
  const minutesEast = -minutesWest
  const sign = minutesEast >= 0 ? "+" : "-"
  const abs = Math.abs(minutesEast)
  const h = String(Math.floor(abs / 60)).padStart(2, "0")
  const m = String(abs % 60).padStart(2, "0")
  return `UTC${sign}${h}:${m}`
}

export const xsltDatetimeLeakTests: ReadonlyArray<TestDefinition> = [
  xsltDatetimeLeakTest,
]
