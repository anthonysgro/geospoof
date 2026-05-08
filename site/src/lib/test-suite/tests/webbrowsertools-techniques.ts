/**
 * Webbrowsertools-style detection techniques.
 *
 * This battery adapts the detection methods published by
 * webbrowsertools.com's "What is my Geolocation" page
 * (https://webbrowsertools.com/geolocation/). That page exposes a menu
 * of six techniques a detection script might use to fetch geolocation:
 *
 *   1. `navigator.geolocation` — direct
 *   2. hidden `<iframe>.contentWindow.navigator.geolocation` — element
 *   3. `eval("navigator.geolocation")` — string indirection
 *   4. `new Function("return navigator.geolocation")()` — Function constructor
 *   5. `clonedData` — early resolution during HTML parse
 *   6. `sandbox="allow-same-origin"` iframe — sandboxed contentWindow
 *
 * (1) is already covered by values-correctness; (2) is covered by the
 * iframe-behavioral battery. We add (3), (4), (6) here as behavioral
 * tests, and add a descriptor-shape check adapted from the same page's
 * `ntgrtchcks` integrity routine: native DOM methods live on their
 * interface prototypes; an `Object.getOwnPropertyDescriptor` on the
 * *instance* being defined is itself a tampering signal.
 *
 * Method (5) — early resolution at `<head>` parse time — cannot be
 * reproduced by a test that runs after mount, so we skip it; the
 * extension injects at `document_start` which is designed to beat this
 * race, but verifying that requires a top-level page setup outside the
 * verification-dashboard lifecycle.
 *
 * All tests are assigned `group: "geolocation-stealth"` so they surface
 * under Tampering Signals in the dashboard. Each test failing here is
 * the *interesting* case — it means a page using the corresponding
 * technique can detect that we're spoofing.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import { requireLocationSnapshot } from "../helpers/location"
import type { TestDefinition } from "../types"

const GEO_CALL_TIMEOUT_MS = 5_000
const IFRAME_LOAD_TIMEOUT_MS = 3_000

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
 * Call `getCurrentPosition` on the provided geolocation surface and
 * resolve with the coords. Shared by every indirection path below —
 * only how we *obtain* `geo` varies between tests.
 */
function callGetCurrentPosition(
  geo: Geolocation,
  timeoutMs: number
): Promise<Coords> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(`getCurrentPosition did not resolve within ${timeoutMs}ms`)
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
              err.message || `getCurrentPosition error code ${err.code}`
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

// ---------------------------------------------------------------------------
// Indirection techniques (3) and (4)
// ---------------------------------------------------------------------------

const evalIndirectionTest = buildBehavioralTest<Coords>({
  id: "tampering.geolocation.eval-indirection-returns-spoofed",
  group: "geolocation-stealth",
  name: 'eval("navigator.geolocation") returns spoofed coordinates',
  description:
    'A page that resolves navigator.geolocation via eval should still hit the spoofed coords. Webbrowsertools exposes this as their "[moderate] use eval to find JS properties" method — the hope is that a spoofer which caches a static reference to navigator.geolocation could be bypassed by re-resolving it dynamically.',
  technique:
    'Use the indirect `eval("navigator.geolocation")` string to obtain the geolocation object, then call getCurrentPosition on it and compare to the identity snapshot to 4 decimal places.',
  codeSnippet: `const geo = eval("navigator.geolocation")
const pos = await new Promise((res, rej) =>
  geo.getCurrentPosition(res, rej),
)
pos.coords matches identity.location`,
  expected: async (ctx) => {
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    const geo = eval("navigator.geolocation") as Geolocation
    if (!geo) {
      throw new Error("eval did not return navigator.geolocation")
    }
    const value = await callGetCurrentPosition(geo, GEO_CALL_TIMEOUT_MS)
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatch4dp,
})

const functionConstructorIndirectionTest = buildBehavioralTest<Coords>({
  id: "tampering.geolocation.function-constructor-indirection-returns-spoofed",
  group: "geolocation-stealth",
  name: "new Function(...)() indirection returns spoofed coordinates",
  description:
    'A page that resolves navigator.geolocation via the Function constructor should still hit the spoofed coords. Webbrowsertools exposes this as their "[moderate] use Function constructor" method — same reasoning as the eval path, but via Function() instead of eval() to avoid CSP eval restrictions.',
  technique:
    'Call `new Function("return navigator.geolocation")()` to obtain the geolocation object, then call getCurrentPosition on it and compare to the identity snapshot to 4 decimal places.',
  codeSnippet: `const geo = new Function("return navigator.geolocation")()
const pos = await new Promise((res, rej) =>
  geo.getCurrentPosition(res, rej),
)
pos.coords matches identity.location`,
  expected: async (ctx) => {
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    const getter = new Function("return navigator.geolocation") as () =>
      | Geolocation
      | undefined
    const geo = getter()
    if (!geo) {
      throw new Error(
        "Function constructor did not return navigator.geolocation"
      )
    }
    const value = await callGetCurrentPosition(geo, GEO_CALL_TIMEOUT_MS)
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatch4dp,
})

// ---------------------------------------------------------------------------
// Sandbox iframe technique (6)
// ---------------------------------------------------------------------------

/**
 * Create a `sandbox="allow-same-origin"` iframe (no `allow-scripts`) so
 * scripts cannot run inside the iframe, but the parent retains
 * same-origin access to the iframe's `navigator` object. Webbrowsertools
 * ships this as their "aggressive iframe[sandbox].contentWindow"
 * method: the iframe's pristine navigator.geolocation is accessed from
 * the parent's execution context.
 */
function mountSandboxIframe(): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("document.body not available"))
      return
    }
    const iframe = document.createElement("iframe")
    iframe.setAttribute("sandbox", "allow-same-origin")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.display = "none"
    const timer = setTimeout(() => {
      iframe.removeEventListener("load", onLoad)
      iframe.remove()
      reject(
        new Error(
          `sandbox iframe did not load within ${IFRAME_LOAD_TIMEOUT_MS}ms`
        )
      )
    }, IFRAME_LOAD_TIMEOUT_MS)
    function onLoad() {
      clearTimeout(timer)
      iframe.removeEventListener("load", onLoad)
      resolve(iframe)
    }
    iframe.addEventListener("load", onLoad)
    document.body.appendChild(iframe)
    // Some browsers fire `load` synchronously for about:blank; double-check
    // contentDocument in case we missed the event.
    if (iframe.contentDocument?.readyState === "complete") {
      clearTimeout(timer)
      iframe.removeEventListener("load", onLoad)
      resolve(iframe)
    }
  })
}

const sandboxIframeTest = buildBehavioralTest<Coords>({
  id: "tampering.iframe.sandbox-allow-same-origin-returns-spoofed",
  group: "geolocation-stealth",
  name: "sandboxed iframe contentWindow returns spoofed coordinates",
  description:
    "A sandbox=\"allow-same-origin\" iframe (no allow-scripts) cannot run the extension's injected script inside it. The parent still has same-origin access to the iframe's pristine navigator.geolocation. Webbrowsertools uses this as their most aggressive bypass — a spoofer that only patches the top-level navigator and doesn't wrap HTMLIFrameElement accessors will leak the real coordinates here.",
  technique:
    'Create an iframe with sandbox="allow-same-origin" (no allow-scripts), append it to document.body, wait for load, call contentWindow.navigator.geolocation.getCurrentPosition from the parent, and compare to the identity snapshot.',
  codeSnippet: `const iframe = document.createElement("iframe")
iframe.setAttribute("sandbox", "allow-same-origin")
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const pos = await new Promise((res, rej) =>
  iframe.contentWindow.navigator.geolocation.getCurrentPosition(res, rej),
)
pos.coords matches identity.location`,
  expected: async (ctx) => {
    if (typeof HTMLIFrameElement === "undefined") {
      return { skipReason: "HTMLIFrameElement not available" }
    }
    const loc = await requireLocationSnapshot(ctx)
    const value = { latitude: loc.latitude, longitude: loc.longitude }
    return { value, describe: describeCoords(value) }
  },
  observe: async () => {
    const iframe = await mountSandboxIframe()
    try {
      const win = iframe.contentWindow
      if (!win) {
        throw new Error("sandbox iframe has no contentWindow after load")
      }
      const geo = win.navigator?.geolocation
      if (!geo) {
        throw new Error("sandbox iframe has no navigator.geolocation")
      }
      const value = await callGetCurrentPosition(geo, GEO_CALL_TIMEOUT_MS)
      return { value, describe: describeCoords(value) }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
  equals: coordsMatch4dp,
})

// ---------------------------------------------------------------------------
// Descriptor-shape checks (ntgrtchcks-style — adapted from webbrowsertools'
// `Object.getOwnPropertyDescriptor(navigator, key)` pattern)
// ---------------------------------------------------------------------------

/**
 * Build a descriptor-absence test for a prototype-inherited method. If
 * `navigator.geolocation.getCurrentPosition` is the native method, it
 * lives on `Geolocation.prototype` and an own-property lookup on the
 * instance returns `undefined`. Anything else means the override was
 * installed by shadowing the prototype on the instance — a
 * one-line-detectable tampering signal.
 */
function buildNoOwnDescriptorTest(
  id: string,
  name: string,
  target: () => object | null | undefined,
  targetDescribe: string,
  prop: string
): TestDefinition {
  return buildBehavioralTest<boolean>({
    id,
    group: "geolocation-stealth",
    name,
    description: `Object.getOwnPropertyDescriptor(${targetDescribe}, "${prop}") should be undefined when ${prop} is inherited from its prototype (as it is in every native browser). A defined descriptor means ${prop} was shadowed onto the instance — the classic Object.defineProperty-based spoofing pattern that webbrowsertools.com flags via its ntgrtchcks integrity checks.`,
    technique: `Resolve ${targetDescribe} synchronously, call Object.getOwnPropertyDescriptor for "${prop}", and assert the result is undefined.`,
    codeSnippet: `Object.getOwnPropertyDescriptor(${targetDescribe}, "${prop}") === undefined`,
    expected: async () => ({ value: true, describe: "undefined" }),
    observe: async () => {
      const obj = target()
      if (!obj) {
        throw new Error(`${targetDescribe} is not available`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop)
      const value = descriptor === undefined
      return {
        value,
        describe:
          descriptor === undefined
            ? "undefined"
            : `defined (writable=${String(descriptor.writable)}, configurable=${String(descriptor.configurable)}, enumerable=${String(descriptor.enumerable)})`,
      }
    },
  })
}

const getCurrentPositionNoOwnDescriptorTest = buildNoOwnDescriptorTest(
  "tampering.geolocation.getcurrentposition-has-no-own-descriptor",
  "navigator.geolocation has no own getCurrentPosition descriptor",
  () =>
    typeof navigator !== "undefined" ? (navigator.geolocation ?? null) : null,
  "navigator.geolocation",
  "getCurrentPosition"
)

const watchPositionNoOwnDescriptorTest = buildNoOwnDescriptorTest(
  "tampering.geolocation.watchposition-has-no-own-descriptor",
  "navigator.geolocation has no own watchPosition descriptor",
  () =>
    typeof navigator !== "undefined" ? (navigator.geolocation ?? null) : null,
  "navigator.geolocation",
  "watchPosition"
)

const clearWatchNoOwnDescriptorTest = buildNoOwnDescriptorTest(
  "tampering.geolocation.clearwatch-has-no-own-descriptor",
  "navigator.geolocation has no own clearWatch descriptor",
  () =>
    typeof navigator !== "undefined" ? (navigator.geolocation ?? null) : null,
  "navigator.geolocation",
  "clearWatch"
)

const permissionsQueryNoOwnDescriptorTest = buildNoOwnDescriptorTest(
  "tampering.permissions.query-has-no-own-descriptor",
  "navigator.permissions has no own query descriptor",
  () =>
    typeof navigator !== "undefined" ? (navigator.permissions ?? null) : null,
  "navigator.permissions",
  "query"
)

// ---------------------------------------------------------------------------
// Prototype stays native (defense-in-depth: even if we shadow the instance,
// the prototype should still contain the real native method)
// ---------------------------------------------------------------------------

const geolocationPrototypeRemainsNativeTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.prototype-methods-remain-native",
  group: "geolocation-stealth",
  name: "Geolocation.prototype methods still toString to native code",
  description:
    "Even if the injected script shadows getCurrentPosition on the navigator.geolocation instance, Geolocation.prototype should still hold the real native method. A page that inspects the prototype directly (e.g. for restoration attempts or for comparing instance vs prototype) sees native toString output here.",
  technique:
    'Feature-detect Geolocation.prototype; for getCurrentPosition, watchPosition, and clearWatch, confirm the prototype descriptor\'s value.toString() contains "[native code]".',
  codeSnippet: `["getCurrentPosition", "watchPosition", "clearWatch"].every((k) => {
  const d = Object.getOwnPropertyDescriptor(Geolocation.prototype, k)
  return typeof d?.value === "function"
    && d.value.toString().includes("[native code]")
})`,
  expected: async () => {
    if (typeof Geolocation === "undefined") {
      return { skipReason: "Geolocation interface not exposed" }
    }
    return { value: true, describe: "all three are native" }
  },
  observe: async () => {
    if (typeof Geolocation === "undefined") {
      throw new Error("Geolocation interface not exposed")
    }
    const keys = ["getCurrentPosition", "watchPosition", "clearWatch"] as const
    const report = keys.map((k) => {
      const d = Object.getOwnPropertyDescriptor(Geolocation.prototype, k)
      const fn = d?.value as ((...args: Array<unknown>) => unknown) | undefined
      const str = typeof fn === "function" ? fn.toString() : "(missing)"
      const isNative = str.includes("[native code]")
      return { k, isNative, str }
    })
    const value = report.every((r) => r.isNative)
    return {
      value,
      describe: report
        .map((r) => `${r.k}=${r.isNative ? "native" : "NON-NATIVE"}`)
        .join("; "),
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const webbrowsertoolsTechniquesTests: ReadonlyArray<TestDefinition> = [
  // Indirection bypasses — should PASS (any reference path hits the same override)
  evalIndirectionTest,
  functionConstructorIndirectionTest,
  // Sandbox iframe — interesting one; relies on contentWindow getter wrapper
  sandboxIframeTest,
  // Descriptor-shape detections (ntgrtchcks-inspired) — will fail against any
  // Object.defineProperty-based override on the instance
  getCurrentPositionNoOwnDescriptorTest,
  watchPositionNoOwnDescriptorTest,
  clearWatchNoOwnDescriptorTest,
  permissionsQueryNoOwnDescriptorTest,
  // Prototype cleanliness — should PASS since overrides don't touch prototype
  geolocationPrototypeRemainsNativeTest,
]
