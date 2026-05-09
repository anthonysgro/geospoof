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
import { getSharedPosition } from "../helpers/shared-position"
import { coordsMatchApprox } from "../helpers/coords"
import type { TestDefinition, TestRunContext } from "../types"

const GEO_CALL_TIMEOUT_MS = 5_000
/**
 * Longer budget for calls against a different Geolocation instance
 * than the top-level `navigator.geolocation` (e.g. the sandbox-iframe
 * test). Chrome can take up to ~10s to complete a fresh
 * `getCurrentPosition` call with no cached position; Safari
 * serialises CoreLocation requests across the run, so a back-to-back
 * live call on a separate instance can also take several seconds.
 * 15s leaves enough headroom for either engine. The runner's 10s
 * per-test ceiling is a soft ceiling — runs that exceed it still
 * resolve the result correctly, they just get reported as timed
 * out. 15s gives us a single clean outcome rather than a runner
 * timeout partway through.
 */
const GEO_IFRAME_CALL_TIMEOUT_MS = 15_000
const IFRAME_LOAD_TIMEOUT_MS = 3_000

interface Coords {
  latitude: number
  longitude: number
}

function describeCoords(c: Coords): string {
  return `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
}

/**
 * Resolve the Coords that a given `Geolocation` reference will yield,
 * using the run-shared position when possible to avoid Safari's
 * back-to-back `getCurrentPosition` serialisation timeouts.
 *
 * The detection-vector question these indirection tests ask is: "does
 * this alternate way of obtaining the geolocation object return a
 * reference that produces DIFFERENT coordinates than the top-level
 * `navigator.geolocation`?" The answer is reference-based:
 *
 *   - If the reference obtained via indirection is `===` to
 *     `navigator.geolocation`, it cannot produce different coordinates
 *     by definition — we hand back the run's shared position without
 *     a live call. This keeps the test sub-millisecond and avoids
 *     Safari CoreLocation queue serialisation, which can push a
 *     fresh live call past the 5-second budget when multiple
 *     back-to-back indirection tests run in sequence.
 *
 *   - If the reference is a different object (e.g. the sandbox-iframe
 *     test, where the iframe has its own `navigator.geolocation`
 *     instance), we DO need a live call on that specific reference
 *     because the whole point of the test is to verify that alternate
 *     reference's output.
 *
 * Takes the run context so we can consult the shared-position cache
 * when the fast path is applicable.
 */
async function resolveCoordsFromReference(
  geo: Geolocation,
  ctx: TestRunContext,
  timeoutMs: number
): Promise<Coords> {
  if (geo === navigator.geolocation) {
    const pos = await getSharedPosition(ctx)
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    }
  }
  return callGetCurrentPosition(geo, timeoutMs)
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
        {
          // Chrome + `maximumAge: Infinity` with no cached position
          // can hang indefinitely — the cache lookup never falls
          // through to an actual acquisition. Match the options
          // Identity Panel uses for the top-level call: force a
          // fresh fix (`maximumAge: 0`) and use the high-accuracy
          // path. Firefox and Safari are unaffected by these
          // options; Chrome resolves in 1-3s instead of hanging.
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        }
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
  observe: async (ctx) => {
    const geo = eval("navigator.geolocation") as Geolocation
    if (!geo) {
      throw new Error("eval did not return navigator.geolocation")
    }
    const value = await resolveCoordsFromReference(
      geo,
      ctx,
      GEO_CALL_TIMEOUT_MS
    )
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatchApprox,
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
  observe: async (ctx) => {
    const getter = new Function("return navigator.geolocation") as () =>
      | Geolocation
      | undefined
    const geo = getter()
    if (!geo) {
      throw new Error(
        "Function constructor did not return navigator.geolocation"
      )
    }
    const value = await resolveCoordsFromReference(
      geo,
      ctx,
      GEO_CALL_TIMEOUT_MS
    )
    return { value, describe: describeCoords(value) }
  },
  equals: coordsMatchApprox,
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
      // Use a longer timeout here than the other indirection tests:
      // the sandbox-iframe test MUST call the iframe's own Geolocation
      // instance (it's a different object than `navigator.geolocation`
      // — that's the whole point of the test), so the
      // `resolveCoordsFromReference` fast path doesn't apply. Safari
      // serialises back-to-back CoreLocation requests across the run
      // and a fresh call here can take several seconds. 8s keeps us
      // under the runner's 10s per-test ceiling with headroom.
      const value = await callGetCurrentPosition(
        geo,
        GEO_IFRAME_CALL_TIMEOUT_MS
      )
      return { value, describe: describeCoords(value) }
    } finally {
      try {
        iframe.remove()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  },
  equals: coordsMatchApprox,
})

// ---------------------------------------------------------------------------
// Descriptor-shape checks (ntgrtchcks-style — adapted from webbrowsertools'
// `Object.getOwnPropertyDescriptor(navigator, key)` pattern)
// ---------------------------------------------------------------------------

/**
 * Build a descriptor-shape test for a prototype-inherited method.
 *
 * The real detection vector isn't "is there an own descriptor" — it's
 * "does the own descriptor differ from the native baseline". Different
 * engines put these methods in different places:
 *
 *   - Firefox and Chrome install the three Geolocation methods on
 *     `Geolocation.prototype` (and `Permissions.prototype.query` on the
 *     Permissions prototype). An own-descriptor lookup on the instance
 *     returns `undefined`.
 *   - Safari's native WebIDL binding installs the same methods as own
 *     properties on the instance with `writable=false,
 *     configurable=false, enumerable=true`.
 *
 * To handle both, we grab the native descriptor shape from a freshly
 * mounted about:blank iframe (its navigator is pristine — the
 * extension's content script hasn't touched it), snapshot that as the
 * baseline, then compare the top-level's descriptor to it. If they
 * match, the override is indistinguishable from native for this engine.
 * If the top-level's descriptor drifts (e.g. we wrote an own property
 * where native has none, or our writable/configurable/enumerable flags
 * differ), that's a genuine detection signal.
 */
function buildNativeDescriptorParityTest(
  id: string,
  name: string,
  /**
   * Given a Window, return the object that owns the descriptor under
   * test — e.g. `window.navigator.geolocation`. Returns null when the
   * object isn't available.
   */
  resolveTarget: (win: Window) => object | null | undefined,
  targetDescribe: string,
  prop: string
): TestDefinition {
  return buildBehavioralTest<string>({
    id,
    group: "geolocation-stealth",
    name,
    description: `Object.getOwnPropertyDescriptor(${targetDescribe}, "${prop}") should match the native shape observed in a pristine iframe realm. Native engines differ here — Firefox and Chrome return undefined (the method lives on the prototype), while Safari returns a descriptor with writable=false, configurable=false, enumerable=true (the WebIDL binding installs methods on the instance). A mismatch between the top-level descriptor and the pristine iframe baseline is the actual tampering signal — it means GeoSpoof's override drifted from what the engine natively ships.`,
    technique: `Mount an about:blank iframe, read Object.getOwnPropertyDescriptor(${targetDescribe}, "${prop}") from both the iframe (native baseline) and the top-level page, and assert the top-level matches the baseline.`,
    codeSnippet: `const iframe = document.createElement("iframe")
iframe.src = "about:blank"
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const nativeDesc = Object.getOwnPropertyDescriptor(
  iframe.contentWindow.${targetDescribe},
  "${prop}",
)
const liveDesc = Object.getOwnPropertyDescriptor(
  ${targetDescribe},
  "${prop}",
)
describeDesc(liveDesc) === describeDesc(nativeDesc)`,
    expected: async () => {
      const win = await getPristineIframeWindow()
      try {
        const target = resolveTarget(win)
        if (!target) {
          return {
            skipReason: `pristine iframe's ${targetDescribe} is unavailable`,
          }
        }
        const nativeDesc = Object.getOwnPropertyDescriptor(target, prop)
        return {
          value: describeDescriptor(nativeDesc),
          describe: describeDescriptor(nativeDesc),
        }
      } finally {
        disposePristineIframe()
      }
    },
    observe: async () => {
      if (typeof window === "undefined") {
        throw new Error("window is not available")
      }
      const target = resolveTarget(window)
      if (!target) {
        throw new Error(`${targetDescribe} is not available`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, prop)
      return {
        value: describeDescriptor(descriptor),
        describe: describeDescriptor(descriptor),
      }
    },
  })
}

/**
 * Canonical rendering of a `PropertyDescriptor` so two descriptors
 * compare equal via string equality.
 */
function describeDescriptor(desc: PropertyDescriptor | undefined): string {
  if (desc === undefined) return "undefined"
  if ("value" in desc) {
    return `data(writable=${String(desc.writable)}, configurable=${String(desc.configurable)}, enumerable=${String(desc.enumerable)})`
  }
  return `accessor(get=${desc.get ? "fn" : "undefined"}, set=${desc.set ? "fn" : "undefined"}, configurable=${String(desc.configurable)}, enumerable=${String(desc.enumerable)})`
}

/**
 * Reusable pristine about:blank iframe.
 *
 * We only need one iframe per run to read native baselines from. The
 * iframe is created lazily on first access and disposed when the last
 * caller is done. Holding on to the same iframe across multiple
 * descriptor tests avoids 4+ redundant mount/unmount cycles.
 */
let pristineIframe: HTMLIFrameElement | null = null
let pristineRefs = 0

async function getPristineIframeWindow(): Promise<Window> {
  pristineRefs += 1
  if (pristineIframe?.contentWindow) {
    return pristineIframe.contentWindow
  }
  const iframe = document.createElement("iframe")
  iframe.src = "about:blank"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.display = "none"
  document.body.appendChild(iframe)
  await new Promise<void>((resolve, reject) => {
    const doc = iframe.contentDocument
    if (doc && doc.readyState === "complete") {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      iframe.removeEventListener("load", onLoad)
      reject(new Error("pristine iframe did not load within 3000ms"))
    }, IFRAME_LOAD_TIMEOUT_MS)
    function onLoad() {
      clearTimeout(timer)
      iframe.removeEventListener("load", onLoad)
      resolve()
    }
    iframe.addEventListener("load", onLoad)
  })
  pristineIframe = iframe
  const win = iframe.contentWindow
  if (!win) {
    throw new Error("pristine iframe has no contentWindow after load")
  }
  return win
}

function disposePristineIframe(): void {
  pristineRefs -= 1
  if (pristineRefs > 0) return
  if (pristineIframe) {
    try {
      pristineIframe.remove()
    } catch {
      // cleanup never masks the primary result/error
    }
    pristineIframe = null
  }
}

const getCurrentPositionNoOwnDescriptorTest = buildNativeDescriptorParityTest(
  "tampering.geolocation.getcurrentposition-has-no-own-descriptor",
  "navigator.geolocation getCurrentPosition descriptor matches native",
  (win) => win.navigator.geolocation ?? null,
  "navigator.geolocation",
  "getCurrentPosition"
)

const watchPositionNoOwnDescriptorTest = buildNativeDescriptorParityTest(
  "tampering.geolocation.watchposition-has-no-own-descriptor",
  "navigator.geolocation watchPosition descriptor matches native",
  (win) => win.navigator.geolocation ?? null,
  "navigator.geolocation",
  "watchPosition"
)

const clearWatchNoOwnDescriptorTest = buildNativeDescriptorParityTest(
  "tampering.geolocation.clearwatch-has-no-own-descriptor",
  "navigator.geolocation clearWatch descriptor matches native",
  (win) => win.navigator.geolocation ?? null,
  "navigator.geolocation",
  "clearWatch"
)

const permissionsQueryNoOwnDescriptorTest = buildNativeDescriptorParityTest(
  "tampering.permissions.query-has-no-own-descriptor",
  "navigator.permissions query descriptor matches native",
  (win) => win.navigator.permissions ?? null,
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
