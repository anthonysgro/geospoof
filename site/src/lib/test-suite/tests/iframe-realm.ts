/**
 * Iframe-realm timezone/date coverage.
 *
 * A same-origin iframe has its own realm — its own `Date` global, its
 * own `Intl.DateTimeFormat`, its own `Temporal.Now` (when available).
 * Every override installed on the top-level window's prototypes must
 * also be installed into each same-origin iframe's prototypes, or a
 * page can trivially bypass timezone spoofing by reading through an
 * iframe:
 *
 *     const iframe = document.createElement("iframe")
 *     iframe.src = "about:blank"
 *     document.body.appendChild(iframe)
 *     const realZone =
 *       iframe.contentWindow.Intl.DateTimeFormat()
 *         .resolvedOptions().timeZone  // ← leaks the real zone
 *     const realTime =
 *       new iframe.contentWindow.Date("2024-01-01T12:00:00").getTime()
 *     const realTz =
 *       iframe.contentWindow.Temporal?.Now.timeZoneId()
 *
 * Each of these three tests mounts an `about:blank` iframe, grabs the
 * corresponding value through `iframe.contentWindow`, and compares to
 * what the Identity Panel reports (for Intl/Temporal) or to what the
 * top-level `Date` reports (for Date construction).
 *
 * Tests live in the `timezone-stealth` group so they surface under
 * Tampering Signals in the dashboard. A failure here is a real bypass
 * vector — a page that reads through a same-origin iframe sees the
 * un-spoofed system values.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

const IFRAME_LOAD_TIMEOUT_MS = 3_000

/**
 * Resolve the current top-level timezone identifier live. See the
 * identical helper in values-correctness.ts — we duplicate here rather
 * than export+import to keep each test module self-contained.
 */
function resolveLiveTimezoneIdentifier(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  } catch {
    return ""
  }
}

/**
 * Create a hidden `about:blank` iframe, mount it, wait for load, and
 * return it. Callers are responsible for calling `.remove()` in a
 * `finally` block to avoid leaking the iframe into the DOM.
 *
 * Some browsers fire `load` synchronously for `about:blank` (Firefox in
 * particular), so we probe `contentDocument.readyState` immediately
 * before attaching the listener as a fast path.
 */
async function mountAboutBlankIframe(): Promise<HTMLIFrameElement> {
  if (typeof document === "undefined" || !document.body) {
    throw new Error("document.body not available")
  }
  const iframe = document.createElement("iframe")
  iframe.src = "about:blank"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.display = "none"
  iframe.style.width = "1px"
  iframe.style.height = "1px"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  // Fast path: already loaded.
  if (iframe.contentDocument?.readyState === "complete") return iframe

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      iframe.removeEventListener("load", onLoad)
      reject(
        new Error(`iframe did not load within ${IFRAME_LOAD_TIMEOUT_MS}ms`)
      )
    }, IFRAME_LOAD_TIMEOUT_MS)
    function onLoad() {
      clearTimeout(timer)
      iframe.removeEventListener("load", onLoad)
      resolve()
    }
    iframe.addEventListener("load", onLoad)
  })
  return iframe
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const iframeIntlTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.iframe-realm.intl-timezone-spoofed",
  group: "timezone-stealth",
  name: "iframe.contentWindow.Intl.DateTimeFormat agrees with top-level Intl",
  description:
    "A same-origin iframe's Intl.DateTimeFormat().resolvedOptions().timeZone should return the same IANA identifier as the top-level window. If the iframe-patching infrastructure doesn't install the Intl override into the iframe's realm, a one-line read through iframe.contentWindow.Intl leaks the real system zone while the top-level shows the spoofed zone — trivial to detect.",
  technique:
    "Mount an about:blank iframe, read iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone, and compare to the top-level Intl.DateTimeFormat().resolvedOptions().timeZone.",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone
// should equal new Intl.DateTimeFormat().resolvedOptions().timeZone`,
  expected: async () => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    return { value: identifier, describe: `"${identifier}"` }
  },
  observe: async () => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const iframeIntl = (win as unknown as { Intl?: typeof Intl }).Intl
      if (!iframeIntl?.DateTimeFormat) {
        throw new Error("iframe has no Intl.DateTimeFormat")
      }
      const tz =
        new iframeIntl.DateTimeFormat().resolvedOptions().timeZone ?? ""
      return { value: tz, describe: `"${tz}"` }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
})

const iframeDateConstructorTest = buildBehavioralTest<number>({
  id: "tampering.iframe-realm.date-constructor-spoofed",
  group: "timezone-stealth",
  name: "iframe.contentWindow.Date constructor honors the spoofed timezone",
  description:
    '`new iframe.contentWindow.Date("2024-01-01T12:00:00")` (an ambiguous local-time string) should produce the same epoch as the top-level `new Date("2024-01-01T12:00:00")`. If the iframe\'s Date global is still the pristine native constructor, the iframe parses the string against the real system zone while the top-level window parses it against the spoofed zone — a one-line detection that reveals both zones at once.',
  technique:
    'Mount an about:blank iframe, construct `new iframe.contentWindow.Date("2024-01-01T12:00:00")` and the equivalent `new Date("2024-01-01T12:00:00")` at the top level, and compare their `getTime()` values.',
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const AMBIGUOUS = "2024-01-01T12:00:00"  // no timezone suffix
new iframe.contentWindow.Date(AMBIGUOUS).getTime()
  === new Date(AMBIGUOUS).getTime()`,
  expected: async () => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const value = new Date("2024-01-01T12:00:00").getTime()
    return { value, describe: `${value} (top-level Date.getTime())` }
  },
  observe: async () => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const IframeDate = (win as unknown as { Date?: DateConstructor }).Date
      if (typeof IframeDate !== "function") {
        throw new Error("iframe has no Date constructor")
      }
      const value = new IframeDate("2024-01-01T12:00:00").getTime()
      return { value, describe: `${value} (iframe Date.getTime())` }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
})

const iframeTemporalTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.iframe-realm.temporal-timezone-spoofed",
  group: "timezone-stealth",
  name: "iframe.contentWindow.Temporal.Now.timeZoneId agrees with top-level",
  description:
    "When the Temporal API is available, `iframe.contentWindow.Temporal.Now.timeZoneId()` must return the same IANA identifier as the top-level Intl resolved zone. A mismatch means the iframe realm's Temporal still sees the real zone while the top-level has been spoofed. Gated on Temporal availability (skips as known-limitation when the engine doesn't expose it).",
  technique:
    "Mount an about:blank iframe, feature-detect iframe.contentWindow.Temporal.Now.timeZoneId, invoke it, and compare to Intl.DateTimeFormat().resolvedOptions().timeZone at the top level.",
  codeSnippet: `iframe.contentWindow.Temporal.Now.timeZoneId()
// should equal new Intl.DateTimeFormat().resolvedOptions().timeZone`,
  expected: async () => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    // Feature-detect on the top-level first so we don't waste an iframe
    // mount for browsers that don't ship Temporal at all.
    const topTemporal = (
      globalThis as unknown as {
        Temporal?: { Now?: { timeZoneId?: () => string } }
      }
    ).Temporal
    if (typeof topTemporal?.Now?.timeZoneId !== "function") {
      return { skipReason: "Temporal API not supported in this browser" }
    }
    const identifier = resolveLiveTimezoneIdentifier()
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    return { value: identifier, describe: `"${identifier}"` }
  },
  observe: async () => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const iframeTemporal = (
        win as unknown as {
          Temporal?: { Now?: { timeZoneId?: () => string } }
        }
      ).Temporal
      if (typeof iframeTemporal?.Now?.timeZoneId !== "function") {
        throw new Error("iframe Temporal.Now.timeZoneId not exposed")
      }
      const value = iframeTemporal.Now.timeZoneId()
      return { value, describe: `"${value}"` }
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
// Date.prototype methods inside iframe realms
// ---------------------------------------------------------------------------
//
// Each iframe realm has its own Date.prototype, independent of the
// top-level's. `patchIframeWindow` installs the full set of per-method
// overrides (getTimezoneOffset, the formatters, the getters, the
// setters) into each same-origin iframe's Date.prototype via the
// parameterized installers exported from `date-*.ts`. Without that
// section-6 patcher, a page could trivially bypass timezone spoofing
// by going through the iframe's Date globals — `new iframe.contentWindow
// .Date().getHours()` would return the real system zone's hour.
//
// The tests below exercise the patched surface: they construct a Date
// through the iframe realm, call a per-method override, and assert the
// result matches top-level spoofed state. Each test is jitter-proof —
// both Dates anchor on the identity snapshot's startedAt epoch so a
// second-boundary crossing between the two reads can't flake the
// comparison.
//
// All four are assigned `group: "timezone-stealth"` so a failure
// surfaces as a real detection signal under Tampering Signals. The
// set/get round-trip test is kept in `internal-consistency` because
// it's an invariant check, not a bypass vector.

const iframeDateGetHoursTest = buildBehavioralTest<number>({
  id: "tampering.iframe-realm.date-gethours-spoofed",
  group: "timezone-stealth",
  name: "new iframe.contentWindow.Date().getHours() agrees with top-level",
  description:
    "A Date constructed through an iframe's Date global must have its getHours resolved in the spoofed zone, matching the top-level's getHours. The iframe patcher installs the per-method Date.prototype overrides into each same-origin iframe realm, so both surfaces compute hours in the same zone. A failure here means the iframe-realm Date.prototype.getHours override didn't install.",
  technique:
    "Mount an about:blank iframe, construct a top-level Date and an iframe-realm Date from the same fixed epoch (ctx.getIdentity().startedAt) so inter-call timing jitter cannot flake the test, and assert the two hour values match.",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const e = identity.startedAt
new iframe.contentWindow.Date(e).getHours() === new Date(e).getHours()`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const value = new Date(ctx.getIdentity().startedAt).getHours()
    return { value, describe: `${value} (top-level getHours at startedAt)` }
  },
  observe: async (ctx) => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const IframeDate = (win as unknown as { Date?: DateConstructor }).Date
      if (typeof IframeDate !== "function") {
        throw new Error("iframe has no Date constructor")
      }
      const value = new IframeDate(ctx.getIdentity().startedAt).getHours()
      return { value, describe: `${value} (iframe getHours at startedAt)` }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
})

const iframeDateToStringTest = buildBehavioralTest<string>({
  id: "tampering.iframe-realm.date-tostring-spoofed-zone-name",
  group: "timezone-stealth",
  name: "iframe.contentWindow.Date.prototype.toString carries the spoofed zone name",
  description:
    'The GMT-offset-and-zone-name tail of `new iframe.contentWindow.Date().toString()` must match the tail from `new Date().toString()`. Both are formatted through the spoofed Date.prototype.toString override, which the iframe patcher installs on the iframe realm. A mismatch means the iframe-realm toString override didn\'t install and the iframe-realm Date formats in the real system zone while the top-level formats in the spoofed zone.',
  technique:
    'Mount an about:blank iframe, anchor both Date instances on the same fixed epoch (ctx.getIdentity().startedAt) to eliminate inter-call jitter, then capture and compare the "GMT±HHMM (Zone Name)" substring of both toString outputs.',
  codeSnippet: `const e = identity.startedAt
const a = new Date(e).toString()
const b = new iframe.contentWindow.Date(e).toString()
a.slice(a.indexOf("GMT")) === b.slice(b.indexOf("GMT"))`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const full = new Date(ctx.getIdentity().startedAt).toString()
    const idx = full.indexOf("GMT")
    const tail = idx === -1 ? "" : full.slice(idx)
    return { value: tail, describe: `"${tail}" (top-level toString tail)` }
  },
  observe: async (ctx) => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const IframeDate = (win as unknown as { Date?: DateConstructor }).Date
      if (typeof IframeDate !== "function") {
        throw new Error("iframe has no Date constructor")
      }
      const full = new IframeDate(ctx.getIdentity().startedAt).toString()
      const idx = full.indexOf("GMT")
      const tail = idx === -1 ? "" : full.slice(idx)
      return { value: tail, describe: `"${tail}" (iframe toString tail)` }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
})

const iframeDateGetTimezoneOffsetTest = buildBehavioralTest<number>({
  id: "tampering.iframe-realm.date-gettimezoneoffset-spoofed",
  group: "timezone-stealth",
  name: "new iframe.contentWindow.Date().getTimezoneOffset agrees with top-level",
  description:
    "The numeric offset returned by `iframe.contentWindow.Date.prototype.getTimezoneOffset` must equal the top-level spoofed offset from the identity snapshot. The iframe patcher installs a realm-local copy of the override. A failure means the iframe realm still reports the real system offset — a trivial one-line read that leaks both zones at once.",
  technique:
    "Mount an about:blank iframe, read `new iframe.contentWindow.Date(startedAt).getTimezoneOffset()` at the identity snapshot's anchor instant, and compare to the top-level spoofed offset on the identity snapshot.",
  codeSnippet: `const e = identity.startedAt
new iframe.contentWindow.Date(e).getTimezoneOffset() === identity.timezone.offsetMinutes`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const value = ctx.getIdentity().timezone.offsetMinutes
    return {
      value,
      describe: `${value} minutes (top-level spoofed offset)`,
    }
  },
  observe: async (ctx) => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const IframeDate = (win as unknown as { Date?: DateConstructor }).Date
      if (typeof IframeDate !== "function") {
        throw new Error("iframe has no Date constructor")
      }
      const value = new IframeDate(
        ctx.getIdentity().startedAt
      ).getTimezoneOffset()
      return {
        value,
        describe: `${value} minutes (iframe getTimezoneOffset)`,
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

const iframeDateSetHoursRoundTripTest = buildBehavioralTest<number>({
  id: "consistency.iframe-realm.date-sethours-roundtrip",
  group: "internal-consistency",
  name: "iframe.contentWindow.Date setHours/getHours round-trip",
  description:
    "date.setHours(H) followed by date.getHours() on an iframe-realm Date must return H. This is the CreepJS valid.time invariant applied inside the iframe realm. With the iframe patcher installing matched setter + getter overrides on the iframe's Date.prototype, the round-trip holds in the spoofed zone. This test is the regression guard that catches a future refactor where only setHours or only getHours gets re-installed in the iframe realm.",
  technique:
    "Mount an about:blank iframe, construct `new iframe.contentWindow.Date()`, call `.setHours(7)`, read back `.getHours()`, and assert it equals 7.",
  codeSnippet: `const d = new iframe.contentWindow.Date()
d.setHours(7)
d.getHours() === 7`,
  expected: async () => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    return { value: 7, describe: "setHours(7) → getHours() should return 7" }
  },
  observe: async () => {
    const iframe = await mountAboutBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error("iframe has no contentWindow after load")
      const IframeDate = (win as unknown as { Date?: DateConstructor }).Date
      if (typeof IframeDate !== "function") {
        throw new Error("iframe has no Date constructor")
      }
      const d = new IframeDate()
      d.setHours(7)
      const value = d.getHours()
      return { value, describe: `getHours() returned ${value}` }
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

export const iframeRealmTests: ReadonlyArray<TestDefinition> = [
  iframeIntlTimezoneTest,
  iframeDateConstructorTest,
  iframeTemporalTimezoneTest,
  iframeDateGetHoursTest,
  iframeDateToStringTest,
  iframeDateGetTimezoneOffsetTest,
  iframeDateSetHoursRoundTripTest,
]
