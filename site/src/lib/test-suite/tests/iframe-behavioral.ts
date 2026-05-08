/**
 * Iframe behavioral battery.
 *
 * These tests answer the question "does the iframe-patching
 * infrastructure actually work end-to-end?" — not just "is its shape
 * indistinguishable from native" (which the extension-presence accessor
 * battery already covers).
 *
 * The injected script wraps four code paths through which a page can get
 * a fresh same-origin iframe into the DOM:
 *
 *   1. Static access:     the HTMLIFrameElement.contentWindow getter
 *      fires after the element is already in the tree. This test creates
 *      the iframe, appends it, then reads contentWindow.navigator.geolocation.
 *   2. Node.appendChild:  wrapped via dom-insertion.ts — the wrapper
 *      scans the inserted subtree synchronously after the native call.
 *   3. Element.innerHTML: the setter wrapper scans the parent subtree
 *      after the native setter runs, catching nested iframes.
 *   4. MutationObserver fallback: the final safety net if the other
 *      wrappers somehow miss an insertion.
 *
 * Every test creates an `about:blank` same-origin iframe, calls
 * `iframe.contentWindow.navigator.geolocation.getCurrentPosition`, and
 * asserts the returned coordinates match the Identity Panel's snapshot to
 * 4 decimal places. A mismatch (or a real-geolocation response) means a
 * code path missed iframe patching — a detection vector, so these tests
 * live in the `geolocation-stealth` group and surface under Tampering
 * Signals in the Verification Dashboard.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks, so
 * the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import { requireLocationSnapshot } from "../helpers/location"
import type { TestDefinition } from "../types"

/** Max time to wait for the iframe to finish loading. */
const IFRAME_LOAD_TIMEOUT_MS = 3_000
/** Max time the getCurrentPosition call inside the iframe is allowed to take. */
const IFRAME_GEO_TIMEOUT_MS = 5_000

interface Coords {
  latitude: number
  longitude: number
}

function coordsMatch4dp(a: Coords, b: Coords): boolean {
  return (
    a.latitude.toFixed(4) === b.latitude.toFixed(4) &&
    a.longitude.toFixed(4) === b.longitude.toFixed(4)
  )
}

function describeCoords(c: Coords): string {
  return `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
}

/**
 * Wait for an iframe to dispatch its `load` event (or time out). Works
 * for both `src="about:blank"` iframes and iframes whose document is
 * ready synchronously (Firefox behavior) — we check `contentDocument`
 * immediately before attaching the listener.
 */
function waitForIframeLoad(
  iframe: HTMLIFrameElement,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded (Firefox sometimes returns a ready document for
    // about:blank synchronously).
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

/**
 * Call `getCurrentPosition` inside the iframe's window and resolve with
 * the returned coords. Rejects with a descriptive error when the iframe
 * has no geolocation API, when permission is denied, or when the call
 * times out.
 */
function getCurrentPositionInWindow(
  win: Window,
  timeoutMs: number
): Promise<Coords> {
  return new Promise((resolve, reject) => {
    const geo = win.navigator?.geolocation
    if (!geo) {
      reject(new Error("iframe window has no navigator.geolocation"))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          `iframe getCurrentPosition did not resolve within ${timeoutMs}ms`
        )
      )
    }, timeoutMs)
    try {
      geo.getCurrentPosition(
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
            new Error(
              err.message || `iframe getCurrentPosition error code ${err.code}`
            )
          )
        },
        { timeout: timeoutMs }
      )
    } catch (err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * Create an `about:blank` iframe, run `mount(parent, iframe)` to attach
 * it, wait for load, call getCurrentPosition inside its window, and tear
 * the iframe down. The try/finally guarantees we never leak an iframe
 * into the page, even if the call throws.
 */
async function probeIframeGeolocation(
  mount: (parent: HTMLElement, iframe: HTMLIFrameElement) => void
): Promise<Coords> {
  if (typeof document === "undefined" || !document.body) {
    throw new Error("document.body not available")
  }
  const parent = document.createElement("div")
  parent.style.display = "none"
  parent.setAttribute("aria-hidden", "true")
  document.body.appendChild(parent)

  const iframe = document.createElement("iframe")
  iframe.src = "about:blank"
  iframe.style.width = "1px"
  iframe.style.height = "1px"
  iframe.style.border = "0"
  iframe.setAttribute("aria-hidden", "true")

  try {
    mount(parent, iframe)
    await waitForIframeLoad(iframe, IFRAME_LOAD_TIMEOUT_MS)
    const win = iframe.contentWindow
    if (!win) {
      throw new Error("iframe has no contentWindow after load")
    }
    return await getCurrentPositionInWindow(win, IFRAME_GEO_TIMEOUT_MS)
  } finally {
    try {
      parent.remove()
    } catch {
      // Never let cleanup mask the primary result/error.
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const iframeContentWindowGetsPatchedGeolocationTest =
  buildBehavioralTest<Coords>({
    id: "consistency.iframe.contentwindow-geolocation-spoofed",
    group: "geolocation-stealth",
    name: "iframe.contentWindow.navigator.geolocation returns spoofed coords",
    description:
      "After a same-origin iframe is appended to the DOM, reading iframe.contentWindow.navigator.geolocation and calling getCurrentPosition must return the same coordinates as the top-level identity. Verifies the HTMLIFrameElement.contentWindow getter wrapper patches the iframe's geolocation before the page sees it.",
    technique:
      "Create an about:blank iframe, appendChild it to a throwaway container, wait for load, call contentWindow.navigator.geolocation.getCurrentPosition, and compare to the identity snapshot to 4 decimal places.",
    codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
container.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const pos = await new Promise((res, rej) =>
  iframe.contentWindow.navigator.geolocation.getCurrentPosition(res, rej),
)
pos.coords matches identity.location`,
    expected: async (ctx) => {
      if (typeof HTMLIFrameElement === "undefined") {
        return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
      }
      const loc = await requireLocationSnapshot(ctx)
      const value = { latitude: loc.latitude, longitude: loc.longitude }
      return { value, describe: describeCoords(value) }
    },
    observe: async () => {
      const value = await probeIframeGeolocation((parent, iframe) => {
        parent.appendChild(iframe)
      })
      return { value, describe: describeCoords(value) }
    },
    equals: coordsMatch4dp,
  })

const iframeAppendChildPatchesGeolocationTest = buildBehavioralTest<Coords>({
  id: "consistency.iframe.appendchild-patches-geolocation",
  group: "geolocation-stealth",
  name: "appendChild-mounted iframe has spoofed geolocation",
  description:
    "The Node.prototype.appendChild wrapper must patch the iframe's geolocation before the page can observe it. Cross-validates the dom-insertion wrapper against the contentWindow getter — if appendChild's synchronous scan misses the iframe but contentWindow patches on access, both still converge on spoofed coords; if either path leaks the real location, this test fails.",
  technique:
    "Create an iframe, use document.body.appendChild directly, wait for load, call getCurrentPosition inside the iframe, and compare to the identity snapshot.",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe) // wrapped path
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
// coords from iframe.contentWindow.navigator.geolocation match identity`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    const value = await probeIframeGeolocation((parent, iframe) => {
      // Force the wrapped Node.prototype.appendChild path explicitly.
      Node.prototype.appendChild.call(parent, iframe)
    })
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatch4dp,
})

const iframeInnerHTMLPatchesGeolocationTest = buildBehavioralTest<Coords>({
  id: "consistency.iframe.innerhtml-patches-geolocation",
  group: "geolocation-stealth",
  name: "innerHTML-injected iframe has spoofed geolocation",
  description:
    "Setting innerHTML to a string containing an iframe must trigger the Element.innerHTML setter wrapper, which scans the parent subtree and patches any discovered iframes. Verifies the string-based injection path, which bypasses the Node-level wrappers.",
  technique:
    "Create a container, set container.innerHTML to a fragment containing an about:blank iframe, wait for the iframe to load, then call getCurrentPosition inside the iframe and compare to the identity snapshot.",
  codeSnippet: `const container = document.createElement("div")
document.body.appendChild(container)
container.innerHTML = '<iframe src="about:blank"></iframe>'
const iframe = container.querySelector("iframe")
// coords from iframe.contentWindow.navigator.geolocation match identity`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new Error("document.body not available")
    }
    const parent = document.createElement("div")
    parent.style.display = "none"
    parent.setAttribute("aria-hidden", "true")
    document.body.appendChild(parent)
    try {
      parent.innerHTML =
        '<iframe src="about:blank" aria-hidden="true"></iframe>'
      const iframe = parent.querySelector("iframe")
      if (!iframe) {
        throw new Error("innerHTML did not materialise an <iframe>")
      }
      await waitForIframeLoad(iframe, IFRAME_LOAD_TIMEOUT_MS)
      const win = iframe.contentWindow
      if (!win) {
        throw new Error("iframe has no contentWindow after innerHTML load")
      }
      const value = await getCurrentPositionInWindow(win, IFRAME_GEO_TIMEOUT_MS)
      return { value, describe: describeCoords(value) }
    } finally {
      try {
        parent.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
  equals: coordsMatch4dp,
})

const iframeSrcdocPatchesGeolocationTest = buildBehavioralTest<Coords>({
  id: "consistency.iframe.srcdoc-patches-geolocation",
  group: "geolocation-stealth",
  name: "srcdoc-mounted iframe has spoofed geolocation",
  description:
    'An iframe with `srcdoc="..."` loads its own document synchronously from the attribute, bypassing the typical about:blank/network-src load sequence. The contentWindow getter wrapper must still patch the iframe before the page can read from it, or a srcdoc iframe becomes a leak vector.',
  technique:
    "Create an iframe with a srcdoc attribute, append it, wait for load, call getCurrentPosition inside, compare to the identity snapshot.",
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.srcdoc = "<!doctype html><html></html>"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
// coords from iframe.contentWindow.navigator.geolocation match identity`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new Error("document.body not available")
    }
    const parent = document.createElement("div")
    parent.style.display = "none"
    parent.setAttribute("aria-hidden", "true")
    document.body.appendChild(parent)
    try {
      const iframe = document.createElement("iframe")
      iframe.setAttribute("aria-hidden", "true")
      iframe.style.width = "1px"
      iframe.style.height = "1px"
      iframe.style.border = "0"
      // Minimal valid HTML so the iframe document reaches "complete".
      iframe.srcdoc = "<!doctype html><html><head></head><body></body></html>"
      parent.appendChild(iframe)
      await waitForIframeLoad(iframe, IFRAME_LOAD_TIMEOUT_MS)
      const win = iframe.contentWindow
      if (!win) {
        throw new Error("srcdoc iframe has no contentWindow after load")
      }
      const value = await getCurrentPositionInWindow(win, IFRAME_GEO_TIMEOUT_MS)
      return { value, describe: describeCoords(value) }
    } finally {
      try {
        parent.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
  equals: coordsMatch4dp,
})

const iframeDocumentWritePatchesGeolocationTest = buildBehavioralTest<Coords>({
  id: "consistency.iframe.document-write-patches-geolocation",
  group: "geolocation-stealth",
  name: "document.write-injected iframe has spoofed geolocation",
  description:
    '`document.write("<iframe>")` hands the HTML string to the document parser rather than going through DOM-insertion methods. The contentWindow getter wrapper must still patch the iframe, or `document.write` becomes an uncovered injection path. This test writes into the iframe\'s own document (using an outer host iframe) rather than the top-level page — calling document.write on a loaded top-level document would wipe the test suite.',
  technique:
    "Mount an outer about:blank iframe, call document.write on its document to inject a nested iframe, wait for load, call getCurrentPosition inside the nested iframe, compare to the identity snapshot.",
  codeSnippet: `const outer = document.createElement("iframe")
outer.src = "about:blank"
document.body.appendChild(outer)
await new Promise((r) => outer.addEventListener("load", r, { once: true }))
outer.contentDocument.open()
outer.contentDocument.write('<iframe src="about:blank"></iframe>')
outer.contentDocument.close()
const nested = outer.contentDocument.querySelector("iframe")
// coords from nested.contentWindow.navigator.geolocation match identity`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available (likely SSR)" }
    }
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new Error("document.body not available")
    }
    const host = document.createElement("div")
    host.style.display = "none"
    host.setAttribute("aria-hidden", "true")
    document.body.appendChild(host)

    const outer = document.createElement("iframe")
    outer.src = "about:blank"
    outer.setAttribute("aria-hidden", "true")
    outer.style.width = "1px"
    outer.style.height = "1px"
    outer.style.border = "0"

    try {
      host.appendChild(outer)
      await waitForIframeLoad(outer, IFRAME_LOAD_TIMEOUT_MS)
      // Re-read contentDocument after each step. In some browsers
      // (notably Firefox), calling .open()/.write()/.close() replaces
      // the iframe's document, and a cached reference can point to the
      // stale one — querySelector on the stale doc returns null even
      // though the write succeeded.
      {
        const outerDocPre = outer.contentDocument
        if (!outerDocPre) {
          throw new Error("outer iframe has no contentDocument after load")
        }
        outerDocPre.open()
        outerDocPre.write(
          '<iframe src="about:blank" aria-hidden="true"></iframe>'
        )
        outerDocPre.close()
      }
      const outerDocPost = outer.contentDocument
      if (!outerDocPost) {
        throw new Error(
          "outer iframe has no contentDocument after document.write"
        )
      }
      // Use tag-name matching rather than `instanceof HTMLIFrameElement` —
      // the written iframe lives in the outer iframe's realm, so its
      // constructor is `outer.contentWindow.HTMLIFrameElement`, not our
      // top-level `HTMLIFrameElement`, and cross-realm instanceof returns
      // false. An element whose `tagName` is "IFRAME" is what we want
      // regardless of which realm allocated it.
      const nested = outerDocPost.querySelector("iframe")
      if (!nested || nested.tagName !== "IFRAME") {
        throw new Error(
          `document.write did not materialise a nested iframe (outerDoc.body.innerHTML="${outerDocPost.body?.innerHTML ?? "(no body)"}")`
        )
      }
      await waitForIframeLoad(nested, IFRAME_LOAD_TIMEOUT_MS)
      const win = nested.contentWindow
      if (!win) {
        throw new Error("nested iframe has no contentWindow after load")
      }
      const value = await getCurrentPositionInWindow(win, IFRAME_GEO_TIMEOUT_MS)
      return { value, describe: describeCoords(value) }
    } finally {
      try {
        host.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
  equals: coordsMatch4dp,
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const iframeBehavioralTests: ReadonlyArray<TestDefinition> = [
  iframeContentWindowGetsPatchedGeolocationTest,
  iframeAppendChildPatchesGeolocationTest,
  iframeInnerHTMLPatchesGeolocationTest,
  iframeSrcdocPatchesGeolocationTest,
  iframeDocumentWritePatchesGeolocationTest,
]
