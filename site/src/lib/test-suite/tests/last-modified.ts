/**
 * `document.lastModified` ground-truth timezone tests.
 *
 * `Document.prototype.lastModified` returns a string formatted as
 * `"MM/DD/YYYY HH:MM:SS"` in the document's local timezone. Unlike
 * `Date` / `Intl` / `Temporal`, it reads directly from the browser's
 * document-metadata layer rather than going through any JS-engine
 * date machinery — which means it's a favorite ground-truth source
 * for fingerprinting tools like TZP. A page can compare the offset
 * derived from `document.lastModified` against `new Date().toString()`
 * to detect timezone spoofing.
 *
 * Three API surfaces expose this getter:
 *
 *   1. `document.lastModified` (top-level document)
 *   2. `new DOMParser().parseFromString("", "text/html").lastModified`
 *   3. `Document.parseHTMLUnsafe("").lastModified` (where available)
 *   4. `iframe.contentDocument.lastModified`
 *
 * All four must emit a timestamp whose offset — when compared to
 * `new Date().toISOString()` as ground-truth UTC — matches the spoofed
 * timezone. We derive the "expected" offset from the Identity snapshot's
 * IANA identifier via Intl.DateTimeFormat with `timeZoneName:
 * "shortOffset"`, and check that each lastModified surface produces the
 * same offset. A mismatch means the override missed that surface.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

const IFRAME_LOAD_TIMEOUT_MS = 3_000

/**
 * Parse the native `"MM/DD/YYYY HH:MM:SS"` format into wall-clock
 * components. Returns `null` when the format doesn't match.
 */
function parseLastModified(str: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(str)
  if (!match) return null
  const month = Number.parseInt(match[1], 10) - 1
  const day = Number.parseInt(match[2], 10)
  const year = Number.parseInt(match[3], 10)
  const hour = Number.parseInt(match[4], 10)
  const minute = Number.parseInt(match[5], 10)
  const second = Number.parseInt(match[6], 10)
  return { year, month, day, hour, minute, second }
}

/**
 * Convert an IANA timezone identifier to its east-of-UTC offset in
 * minutes at a given instant, using Intl.DateTimeFormat with
 * `timeZoneName: "shortOffset"`. Returns `null` when the identifier
 * is unusable.
 */
function getOffsetMinutes(timezoneId: string, when: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: timezoneId,
      timeZoneName: "shortOffset",
    })
    if (typeof fmt.formatToParts !== "function") return null
    const parts = fmt.formatToParts(when)
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    const match = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(tzName)
    if (!match) return null
    const sign = match[1]
    if (!sign) return 0
    const hours = Number.parseInt(match[2], 10)
    const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
    return (sign === "-" ? -1 : 1) * (hours * 60 + minutes)
  } catch {
    return null
  }
}

/**
 * Derive the east-of-UTC offset in minutes that the given
 * `lastModified` string represents, using `now` as the UTC anchor.
 * The lastModified string is interpreted as wall-clock time in the
 * timezone we're trying to identify; the offset is computed as the
 * difference between that wall-clock time and the UTC `now`.
 *
 * We round to the nearest 15 minutes so clock skew between when the
 * test captured `now` and when the browser produced `lastModified`
 * doesn't pollute the comparison. Real-world offsets are always at
 * 15-minute granularity anyway (no modern timezone has a 7-minute
 * offset).
 */
function deriveOffsetFromLastModified(str: string, now: Date): number | null {
  const parts = parseLastModified(str)
  if (!parts) return null
  // Build the wall-clock instant as UTC so the difference gives offset.
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const diffMinutes = (wallClockAsUtc - now.getTime()) / 60000
  // Round to nearest 15 minutes. Normalize -0 to +0 so Object.is
  // comparisons succeed for UTC+0 zones (Atlantic/Reykjavik,
  // Africa/Abidjan, Europe/London in winter, etc.), where
  // `lastModified` is always a few seconds earlier than `now`:
  // `Math.round(-0.0055) * 15` yields -0, which Object.is treats as
  // distinct from the +0 produced on the expected side.
  const rounded = Math.round(diffMinutes / 15) * 15
  return rounded === 0 ? 0 : rounded
}

/** Wait for an iframe to fire its `load` event or time out. */
function waitForIframeLoad(
  iframe: HTMLIFrameElement,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = iframe.contentDocument
    if (doc && doc.readyState === "complete") {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      iframe.removeEventListener("load", onLoad)
      reject(new Error(`iframe did not load within ${timeoutMs}ms`))
    }, timeoutMs)
    function onLoad() {
      clearTimeout(timer)
      iframe.removeEventListener("load", onLoad)
      resolve()
    }
    iframe.addEventListener("load", onLoad)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Resolve the current timezone identifier live. See the identical
 * helper in values-correctness.ts — we duplicate here rather than
 * export+import to keep each test module self-contained and avoid
 * dynamic-import ordering concerns.
 */
function resolveLiveTimezoneIdentifier(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  } catch {
    return ""
  }
}

const topLevelLastModifiedTest = buildBehavioralTest<number>({
  id: "tampering.lastmodified.document-top-level",
  group: "geolocation-stealth",
  name: "document.lastModified reports the resolved timezone offset",
  description:
    "`document.lastModified` is a getter on Document.prototype that returns a wall-clock string in the document's local timezone. It bypasses every Date/Intl/Temporal override because it reads directly from the browser's document-metadata layer — making it a favorite ground-truth source for tools like TZP. This test rounds the offset to the nearest 15 minutes so clock skew between the test's reference `now` and the browser's internal timestamp doesn't cause a false negative.",
  technique:
    "Read document.lastModified, parse the wall-clock components, compute the offset against a fresh UTC anchor, and compare to the offset implied by the current Intl resolved zone (rounded to 15 minutes).",
  codeSnippet: `const str = document.lastModified  // "MM/DD/YYYY HH:MM:SS"
const wallClockAsUtc = Date.UTC(year, month-1, day, hour, minute, second)
const offsetMinutes = (wallClockAsUtc - Date.now()) / 60000
// should equal the offset implied by the current Intl resolved zone`,
  expected: async () => {
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    const offset = getOffsetMinutes(identifier, new Date())
    if (offset === null) {
      return { skipReason: "Intl shortOffset not supported in this browser" }
    }
    const rounded = Math.round(offset / 15) * 15
    return {
      value: rounded,
      describe: `${rounded} minutes east (from ${identifier})`,
    }
  },
  observe: async () => {
    const now = new Date()
    const str = document.lastModified
    const offset = deriveOffsetFromLastModified(str, now)
    if (offset === null) {
      throw new Error(`document.lastModified format unexpected: "${str}"`)
    }
    return {
      value: offset,
      describe: `${offset} minutes east (from "${str}")`,
    }
  },
})

const domParserLastModifiedTest = buildBehavioralTest<number>({
  id: "tampering.lastmodified.domparser",
  group: "geolocation-stealth",
  name: "DOMParser document.lastModified reports the resolved timezone offset",
  description:
    "A `Document` parsed via DOMParser gets its own `lastModified` — it's not the same document instance as the top-level page, but it goes through the same Document.prototype.lastModified getter. A fingerprinter reading DOMParser-generated documents would bypass any override that was installed only on the top-level document instance rather than on the prototype.",
  technique:
    "Call new DOMParser().parseFromString('', 'text/html') to get a Document, read its lastModified, compute the offset, compare to the current Intl resolved zone (rounded to 15 minutes).",
  codeSnippet: `const doc = new DOMParser().parseFromString("", "text/html")
const str = doc.lastModified
// offset should equal the current Intl resolved zone's offset`,
  expected: async () => {
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    if (typeof DOMParser === "undefined") {
      return { skipReason: "DOMParser not available" }
    }
    const offset = getOffsetMinutes(identifier, new Date())
    if (offset === null) {
      return { skipReason: "Intl shortOffset not supported in this browser" }
    }
    const rounded = Math.round(offset / 15) * 15
    return {
      value: rounded,
      describe: `${rounded} minutes east (from ${identifier})`,
    }
  },
  observe: async () => {
    const now = new Date()
    const doc = new DOMParser().parseFromString("", "text/html")
    const str = doc.lastModified
    const offset = deriveOffsetFromLastModified(str, now)
    if (offset === null) {
      throw new Error(`DOMParser doc.lastModified format unexpected: "${str}"`)
    }
    return {
      value: offset,
      describe: `${offset} minutes east (from "${str}")`,
    }
  },
})

const iframeLastModifiedTest = buildBehavioralTest<number>({
  id: "tampering.lastmodified.iframe-contentdocument",
  group: "geolocation-stealth",
  name: "iframe.contentDocument.lastModified reports the resolved timezone offset",
  description:
    "Each same-origin iframe has its own `Document.prototype`, so `iframe.contentDocument.lastModified` goes through the iframe realm's accessor. An override that's installed only on the top-level Document.prototype — and not replicated into the iframe realm — would leak the real system timezone through this path. TZP uses this surface as one of its three cross-frame truth sources.",
  technique:
    "Mount an about:blank iframe, read iframe.contentDocument.lastModified, parse the wall-clock components, compute the offset, and compare to the current Intl resolved zone (rounded to 15 minutes).",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const str = iframe.contentDocument.lastModified
// offset should equal the current Intl resolved zone's offset`,
  expected: async () => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    const offset = getOffsetMinutes(identifier, new Date())
    if (offset === null) {
      return { skipReason: "Intl shortOffset not supported in this browser" }
    }
    const rounded = Math.round(offset / 15) * 15
    return {
      value: rounded,
      describe: `${rounded} minutes east (from ${identifier})`,
    }
  },
  observe: async () => {
    const iframe = document.createElement("iframe")
    iframe.src = "about:blank"
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.display = "none"
    iframe.style.width = "1px"
    iframe.style.height = "1px"
    iframe.style.border = "0"
    document.body.appendChild(iframe)
    try {
      await waitForIframeLoad(iframe, IFRAME_LOAD_TIMEOUT_MS)
      const iframeDoc = iframe.contentDocument
      if (!iframeDoc) {
        throw new Error("iframe has no contentDocument after load")
      }
      const now = new Date()
      const str = iframeDoc.lastModified
      const offset = deriveOffsetFromLastModified(str, now)
      if (offset === null) {
        throw new Error(
          `iframe.contentDocument.lastModified format unexpected: "${str}"`
        )
      }
      return {
        value: offset,
        describe: `${offset} minutes east (from "${str}")`,
      }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const lastModifiedTests: ReadonlyArray<TestDefinition> = [
  topLevelLastModifiedTest,
  domParserLastModifiedTest,
  iframeLastModifiedTest,
]
