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
  name: "iframe.contentWindow.Intl.DateTimeFormat resolves the spoofed timezone",
  description:
    "A same-origin iframe's Intl.DateTimeFormat().resolvedOptions().timeZone should return the spoofed IANA identifier. If the iframe-patching infrastructure doesn't install the Intl override into the iframe's realm, a one-line read through iframe.contentWindow.Intl leaks the real system zone.",
  technique:
    "Mount an about:blank iframe, read iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone, and compare to the Identity Panel's timezone.identifier.",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone
// should equal identity.timezone.identifier`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const identifier = ctx.getIdentity().timezone.identifier
    if (!identifier) {
      return { skipReason: "Identity timezone identifier not available" }
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
  name: "iframe.contentWindow.Temporal.Now.timeZoneId matches the spoofed timezone",
  description:
    "When the Temporal API is available, `iframe.contentWindow.Temporal.Now.timeZoneId()` must return the spoofed IANA identifier — same guarantee we enforce on the top-level Temporal. Gated on Temporal availability (skips as known-limitation when the engine doesn't expose it).",
  technique:
    "Mount an about:blank iframe, feature-detect iframe.contentWindow.Temporal.Now.timeZoneId, invoke it, and compare to the Identity Panel's timezone.identifier.",
  codeSnippet: `iframe.contentWindow.Temporal.Now.timeZoneId()
// should equal identity.timezone.identifier`,
  expected: async (ctx) => {
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
    const identifier = ctx.getIdentity().timezone.identifier
    if (!identifier) {
      return { skipReason: "Identity timezone identifier not available" }
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
// Manifest
// ---------------------------------------------------------------------------

export const iframeRealmTests: ReadonlyArray<TestDefinition> = [
  iframeIntlTimezoneTest,
  iframeDateConstructorTest,
  iframeTemporalTimezoneTest,
]
