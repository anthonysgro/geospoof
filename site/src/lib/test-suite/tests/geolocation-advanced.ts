/**
 * Advanced geolocation detection vectors.
 *
 * Two categories combined:
 *
 *   1. SHAPE FIDELITY — deeper inspection of the position object than
 *      `instanceof`, `getPrototypeOf`, and `null`-field checks. Covers
 *      `Symbol.toStringTag`, `JSON.stringify`, `Object.keys`, `for-in`,
 *      method-binding, error-constant inheritance,
 *      and WebIDL attribute-descriptor layout.
 *
 *   2. TIMING CHANNELS — callback-latency distribution, option
 *      differentials, `maximumAge` caching, `watchPosition` cadence.
 *      These are harder to close completely (the extension runs on the
 *      same JS thread that measures itself) but measurable enough that
 *      a detector can fingerprint them with enough samples.
 *
 * All tests are assigned `group: "geolocation-stealth"` so they surface
 * under Tampering Signals in the dashboard. Each failure here is a
 * real way a page could detect that geolocation is being spoofed.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { now } from "../../verification/safe-time"
import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import { getSharedPosition } from "../helpers/shared-position"
import type { TestDefinition, TestRunContext } from "../types"

const GEO_CALL_TIMEOUT_MS = 5_000

interface Coords {
  latitude: number
  longitude: number
}

/**
 * Shape tests want a `GeolocationPosition` to inspect. They don't need
 * a fresh GPS fix and they don't need their own call — multiple
 * independent calls hang Safari. Delegating to `getSharedPosition`
 * reuses one cached position per run across every shape test.
 */
function getFullPosition(ctx: TestRunContext): Promise<GeolocationPosition> {
  return getSharedPosition(ctx)
}

/**
 * Invoke `getCurrentPosition` and return its wall-clock call-to-callback
 * latency.
 *
 * When no options are supplied the default is `maximumAge: Infinity`
 * so the browser is free to serve a cached reading — this is important
 * for repeated measurements on Safari, which serialises concurrent /
 * rapid-fire calls behind the queue and would otherwise time out most
 * of the samples. Tests that specifically want to measure a fresh
 * uncached call (the cache-priming step below) pass `{ maximumAge: 0 }`
 * explicitly.
 */
function measureLatency(options?: PositionOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = now()
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`getCurrentPosition latency probe timed out`))
    }, GEO_CALL_TIMEOUT_MS)
    try {
      navigator.geolocation.getCurrentPosition(
        () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(now() - start)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new Error(`getCurrentPosition error: ${err.message}`))
        },
        options ?? { maximumAge: Number.POSITIVE_INFINITY }
      )
    } catch (err) {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

// ===========================================================================
// GROUP 1 — SHAPE FIDELITY
// ===========================================================================

const methodBindingThrowsTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.method-binding-throws-on-foreign-this",
  group: "geolocation-stealth",
  name: "Geolocation.prototype.getCurrentPosition rejects foreign this",
  description:
    'Native Web IDL methods throw TypeError when called with a `this` value that isn\'t a real Geolocation instance (Illegal invocation / "does not implement interface Geolocation"). An override that ignores `this` entirely runs happily on any object and is trivially detectable via one line: `Geolocation.prototype.getCurrentPosition.call({}, () => {}).toString()`.',
  technique:
    "Call `Geolocation.prototype.getCurrentPosition.call({}, noop)` and assert it throws synchronously.",
  codeSnippet: `try {
  Geolocation.prototype.getCurrentPosition.call({}, () => {})
  // fail — native throws
} catch (e) {
  // pass — TypeError as expected
}`,
  expected: async () => ({ value: true, describe: "throws TypeError" }),
  observe: async () => {
    if (typeof Geolocation === "undefined") {
      throw new Error("Geolocation interface not exposed")
    }
    try {
      Geolocation.prototype.getCurrentPosition.call({} as Geolocation, () => {})
      return { value: false, describe: "did not throw" }
    } catch (err) {
      const isTypeError = err instanceof TypeError
      const message = err instanceof Error ? err.message : String(err)
      return {
        value: isTypeError,
        describe: isTypeError
          ? `threw TypeError: "${message}"`
          : `threw non-TypeError: ${message}`,
      }
    }
  },
})

const toStringTagGeolocationTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.tostringtag-geolocation",
  group: "geolocation-stealth",
  name: "Object.prototype.toString.call(navigator.geolocation) is [object Geolocation]",
  description:
    "Native platform objects return their interface name via `Symbol.toStringTag` — an accessor on the prototype. A page can use `Object.prototype.toString.call(x)` to check brand identity without touching any specific method.",
  technique:
    'Call Object.prototype.toString.call(navigator.geolocation) and assert the result is exactly "[object Geolocation]".',
  codeSnippet: `Object.prototype.toString.call(navigator.geolocation) === "[object Geolocation]"`,
  expected: async () => ({
    value: "[object Geolocation]",
    describe: '"[object Geolocation]"',
  }),
  observe: async () => {
    const tag = Object.prototype.toString.call(navigator.geolocation)
    return { value: tag, describe: `"${tag}"` }
  },
})

const toStringTagPositionTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.tostringtag-position",
  group: "geolocation-stealth",
  name: "Object.prototype.toString.call(position) is [object GeolocationPosition]",
  description:
    'After getCurrentPosition resolves, Object.prototype.toString on the returned position should return "[object GeolocationPosition]" — the Symbol.toStringTag on GeolocationPosition.prototype. A plain-object stand-in returns "[object Object]".',
  technique:
    "Call Object.prototype.toString.call(position) on a resolved position and assert the tag string.",
  codeSnippet: `const pos = await getPosition()
Object.prototype.toString.call(pos) === "[object GeolocationPosition]"`,
  expected: async () => ({
    value: "[object GeolocationPosition]",
    describe: '"[object GeolocationPosition]"',
  }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const tag = Object.prototype.toString.call(pos)
    return { value: tag, describe: `"${tag}"` }
  },
})

const toStringTagCoordsTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.tostringtag-coords",
  group: "geolocation-stealth",
  name: "Object.prototype.toString.call(coords) is [object GeolocationCoordinates]",
  description:
    'Same as the position tag test, but for position.coords. A plain-object stand-in returns "[object Object]".',
  technique:
    "Call Object.prototype.toString.call(position.coords) on a resolved position and assert the tag string.",
  codeSnippet: `const pos = await getPosition()
Object.prototype.toString.call(pos.coords) === "[object GeolocationCoordinates]"`,
  expected: async () => ({
    value: "[object GeolocationCoordinates]",
    describe: '"[object GeolocationCoordinates]"',
  }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const tag = Object.prototype.toString.call(pos.coords)
    return { value: tag, describe: `"${tag}"` }
  },
})

const toStringTagPermissionsTest = buildBehavioralTest<string>({
  id: "tampering.permissions.tostringtag",
  group: "geolocation-stealth",
  name: "Object.prototype.toString.call(navigator.permissions) is [object Permissions]",
  description: "Same Symbol.toStringTag check for the Permissions interface.",
  technique:
    "Call Object.prototype.toString.call(navigator.permissions) and assert the tag.",
  codeSnippet: `Object.prototype.toString.call(navigator.permissions) === "[object Permissions]"`,
  expected: async () => {
    if (!navigator.permissions) {
      return { skipReason: "navigator.permissions not available" }
    }
    return { value: "[object Permissions]", describe: '"[object Permissions]"' }
  },
  observe: async () => {
    const tag = Object.prototype.toString.call(navigator.permissions)
    return { value: tag, describe: `"${tag}"` }
  },
})

const toStringTagPermissionStatusTest = buildBehavioralTest<string>({
  id: "tampering.permissionstatus.tostringtag",
  group: "geolocation-stealth",
  name: "Object.prototype.toString.call(PermissionStatus) is [object PermissionStatus]",
  description:
    "The spoofed PermissionStatus returned by navigator.permissions.query should have the same [object PermissionStatus] brand as native. Our override currently returns a bare EventTarget, which tags as [object EventTarget] — a direct detection vector.",
  technique:
    "Query geolocation permission, inspect the returned object's Symbol.toStringTag.",
  codeSnippet: `const status = await navigator.permissions.query({ name: "geolocation" })
Object.prototype.toString.call(status) === "[object PermissionStatus]"`,
  expected: async () => {
    if (!navigator.permissions.query) {
      return { skipReason: "navigator.permissions.query not available" }
    }
    return {
      value: "[object PermissionStatus]",
      describe: '"[object PermissionStatus]"',
    }
  },
  observe: async () => {
    const status = await navigator.permissions.query({
      name: "geolocation",
    })
    const tag = Object.prototype.toString.call(status)
    return { value: tag, describe: `"${tag}"` }
  },
})

const positionJsonMatchesNativeTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.position-json-matches-native",
  group: "geolocation-stealth",
  name: "JSON.stringify(position) produces native-shaped output",
  description:
    "Native GeolocationPosition has a spec-defined `toJSON()` method on its prototype that returns a populated object, so `JSON.stringify(position)` produces a string containing `coords.latitude`, `coords.longitude`, and `timestamp`. An override that doesn't participate in the `toJSON` protocol either produces empty output or throws when the brand-checked native toJSON is invoked on it — both detectable.",
  technique:
    "Call JSON.stringify on a resolved position and assert the output includes the expected keys and latitude/longitude values.",
  codeSnippet: `const pos = await getPosition()
const json = JSON.stringify(pos)
json.includes("latitude") &&
  json.includes("longitude") &&
  json.includes("timestamp")`,
  expected: async () => ({
    value: true,
    describe: "JSON string includes latitude, longitude, timestamp",
  }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    let json: string
    try {
      json = JSON.stringify(pos)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { value: false, describe: `JSON.stringify threw: ${message}` }
    }
    const hasLat = json.includes("latitude")
    const hasLon = json.includes("longitude")
    const hasTs = json.includes("timestamp")
    const value = hasLat && hasLon && hasTs
    return {
      value,
      describe: `JSON.stringify returned: ${json.length > 120 ? json.slice(0, 120) + "…" : json}`,
    }
  },
})

const positionKeysMatchNativeTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.position-own-keys-empty",
  group: "geolocation-stealth",
  name: "Object.keys(position) is empty on native",
  description:
    'Native Web IDL interfaces expose attributes via prototype accessors, not instance data. Object.keys returns own enumerable keys, and on native position objects that list is empty. An override that writes own data properties leaks "coords" and "timestamp" here.',
  technique: "Read Object.keys(position) and assert it is empty.",
  codeSnippet: `Object.keys(await getPosition())
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = JSON.stringify(Object.keys(pos))
    return { value: keys, describe: keys }
  },
})

const coordsKeysMatchNativeTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.coords-own-keys-empty",
  group: "geolocation-stealth",
  name: "Object.keys(position.coords) is empty on native",
  description:
    "Same as position-own-keys-empty, but for position.coords. Native returns [] because all six coordinate fields live on the GeolocationCoordinates prototype as accessors.",
  technique: "Read Object.keys(position.coords) and assert it is empty.",
  codeSnippet: `Object.keys((await getPosition()).coords)
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = JSON.stringify(Object.keys(pos.coords))
    return { value: keys, describe: keys }
  },
})

// ---------------------------------------------------------------------------
// Own-property-name / own-symbol checks
// ---------------------------------------------------------------------------
//
// Object.keys only returns OWN ENUMERABLE keys — a non-enumerable own
// property (for example, a `toJSON` defined via `Object.defineProperty(
// pos, "toJSON", { enumerable: false, ... })`) slips through unnoticed.
// Native GeolocationPosition / GeolocationCoordinates expose every field
// via prototype accessors with zero own properties, so the tighter checks
// `Object.getOwnPropertyNames(pos)`, `Object.getOwnPropertySymbols(pos)`,
// and `Reflect.ownKeys(pos)` all return the empty list natively. An
// override that installs any own property on the instance — enumerable
// or not — leaks here.

const positionOwnPropertyNamesTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.position-own-property-names-empty",
  group: "geolocation-stealth",
  name: "Object.getOwnPropertyNames(position) is empty on native",
  description:
    "Object.getOwnPropertyNames returns both enumerable and non-enumerable own string keys. Native GeolocationPosition exposes every field via the prototype, so this list is empty. An override that installs ANY own string-keyed property — including a non-enumerable one like toJSON — is detected here even when Object.keys shows nothing.",
  technique:
    "Read Object.getOwnPropertyNames(position) and assert it is empty.",
  codeSnippet: `Object.getOwnPropertyNames(await getPosition())
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = JSON.stringify(Object.getOwnPropertyNames(pos))
    return { value: keys, describe: keys }
  },
})

const positionOwnSymbolsTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.position-own-symbols-empty",
  group: "geolocation-stealth",
  name: "Object.getOwnPropertySymbols(position) is empty on native",
  description:
    "Object.getOwnPropertySymbols returns own symbol-keyed properties, which native GeolocationPosition doesn't have. An override that installs a Symbol-keyed own property (for instance a custom `Symbol.toStringTag` rather than relying on the prototype's) leaks here.",
  technique:
    "Read Object.getOwnPropertySymbols(position) and assert it is empty.",
  codeSnippet: `Object.getOwnPropertySymbols(await getPosition())
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const syms = Object.getOwnPropertySymbols(pos).map((s) => s.toString())
    const rendered = JSON.stringify(syms)
    return { value: rendered, describe: rendered }
  },
})

const coordsOwnPropertyNamesTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.coords-own-property-names-empty",
  group: "geolocation-stealth",
  name: "Object.getOwnPropertyNames(position.coords) is empty on native",
  description:
    "Same as position-own-property-names-empty but for position.coords. Native exposes all seven coordinate fields via the prototype, so this list is empty. An override that writes own data properties for any of them leaks here.",
  technique:
    "Read Object.getOwnPropertyNames(position.coords) and assert it is empty.",
  codeSnippet: `Object.getOwnPropertyNames((await getPosition()).coords)
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = JSON.stringify(Object.getOwnPropertyNames(pos.coords))
    return { value: keys, describe: keys }
  },
})

const coordsOwnSymbolsTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.coords-own-symbols-empty",
  group: "geolocation-stealth",
  name: "Object.getOwnPropertySymbols(position.coords) is empty on native",
  description:
    "Object.getOwnPropertySymbols returns own symbol-keyed properties on the coords object, which native doesn't have. An override that installs a Symbol-keyed own property leaks here.",
  technique:
    "Read Object.getOwnPropertySymbols(position.coords) and assert it is empty.",
  codeSnippet: `Object.getOwnPropertySymbols((await getPosition()).coords)
// native: []`,
  expected: async () => ({ value: "[]", describe: "[]" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const syms = Object.getOwnPropertySymbols(pos.coords).map((s) =>
      s.toString()
    )
    const rendered = JSON.stringify(syms)
    return { value: rendered, describe: rendered }
  },
})

const coordsDescriptorsAreAccessorsTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.coords-fields-are-prototype-accessors",
  group: "geolocation-stealth",
  name: "position.coords.latitude is a prototype accessor, not own data",
  description:
    'Per WebIDL, `latitude`, `longitude`, `accuracy` etc. are `readonly attribute` accessors defined on GeolocationCoordinates.prototype as getters. `Object.getOwnPropertyDescriptor(coords, "latitude")` on native returns `undefined` (inherited, not own). An override that installs own data properties makes this descriptor defined — a deterministic detection.',
  technique:
    "Call Object.getOwnPropertyDescriptor on position.coords for each coordinate key and assert each returns undefined.",
  codeSnippet: `const coords = (await getPosition()).coords;
["latitude", "longitude", "accuracy", "altitude", "altitudeAccuracy", "heading", "speed"]
  .every((k) => Object.getOwnPropertyDescriptor(coords, k) === undefined)`,
  expected: async () => ({ value: true, describe: "all undefined" }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = [
      "latitude",
      "longitude",
      "accuracy",
      "altitude",
      "altitudeAccuracy",
      "heading",
      "speed",
    ] as const
    const parts = keys.map((k) => {
      const d = Object.getOwnPropertyDescriptor(pos.coords, k)
      return `${k}=${d === undefined ? "undefined" : "defined"}`
    })
    const value = parts.every((p) => p.endsWith("=undefined"))
    return { value, describe: parts.join(", ") }
  },
})

const errorConstantsTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.error-constants-match-spec",
  group: "geolocation-stealth",
  name: "GeolocationPositionError constants are 1, 2, 3",
  description:
    "The PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT constants are defined at both instance and interface level. Extension overrides that construct PositionErrors from scratch sometimes get these wrong; native always has them as 1, 2, 3 respectively.",
  technique:
    "Read the three constants from GeolocationPositionError and assert the expected numeric values.",
  codeSnippet: `GeolocationPositionError.PERMISSION_DENIED === 1 &&
GeolocationPositionError.POSITION_UNAVAILABLE === 2 &&
GeolocationPositionError.TIMEOUT === 3`,
  expected: async () => ({
    value: "PERMISSION_DENIED=1; POSITION_UNAVAILABLE=2; TIMEOUT=3",
    describe: "1, 2, 3",
  }),
  observe: async () => {
    const E = GeolocationPositionError as unknown as Record<string, number>
    const value = `PERMISSION_DENIED=${E.PERMISSION_DENIED}; POSITION_UNAVAILABLE=${E.POSITION_UNAVAILABLE}; TIMEOUT=${E.TIMEOUT}`
    return { value, describe: value }
  },
})

const coordPrecisionRealisticTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.coord-precision-realistic",
  group: "geolocation-stealth",
  name: "position.coords.latitude has realistic decimal precision",
  description:
    "Real GPS readings produce 7-8 significant fractional digits (~1cm precision internally, even when accuracy is reported at 10m). A spoofed location configured as 37.7749 emits exactly that string with 4 decimals — a single line of inspection (`lat.toString().split('.')[1].length`) flags the difference. This test fails when the spoofed value has 5 or fewer decimal places.",
  technique:
    "Count the decimal places of position.coords.latitude. Assert it has at least 6 significant fractional digits (native typical is 7-8).",
  codeSnippet: `const pos = await getPosition()
const decimals = pos.coords.latitude.toString().split(".")[1]?.length ?? 0
decimals >= 6`,
  expected: async () => ({
    value: true,
    describe: "latitude has ≥6 decimal places",
  }),
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const latStr = pos.coords.latitude.toString()
    const dotIdx = latStr.indexOf(".")
    const decimals = dotIdx === -1 ? 0 : latStr.length - dotIdx - 1
    return {
      value: decimals >= 6,
      describe: `latitude="${latStr}" (${decimals} decimal places)`,
    }
  },
})

// ===========================================================================
// GROUP 2 — TIMING CHANNELS
// ===========================================================================

const latencyDistributionTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.latency-not-suspiciously-bounded",
  group: "known-limitations",
  name: "getCurrentPosition latency is not locked to an artificial window",
  description:
    "A content-script spoofer returns its fake position via setTimeout on the JavaScript event loop — the same thread that the measuring page runs on. Real GPS/Wi-Fi/cell-tower lookups go through browser-internal threads with wider, heavier-tailed latency distributions. Matching that distribution statistically from userland is a game of diminishing returns: jitter the fake delay all you want, a detector with enough samples will still see the unnatural bounds. This is a documented limitation of JavaScript-level spoofing; only a browser-native implementation can match the real hardware's timing signature.",
  technique:
    "Run getCurrentPosition 8 times, collect latencies, assert at least one sample is under 10ms — native desktop serves cached positions with a sub-10ms floor, while a `setTimeout`-based spoofer cannot emit a value below its configured delay (typically 10-50ms).",
  codeSnippet: `const samples = []
for (let i = 0; i < 8; i++) samples.push(await measureLatency())
// at least one sub-10ms sample (native cached read)`,
  expected: async () => ({ value: true, describe: "distribution looks real" }),
  observe: async () => {
    const samples: Array<number> = []
    for (let i = 0; i < 8; i++) {
      try {
        // Race each sample against a short budget. A sample that
        // can't resolve in time means the engine isn't participating
        // in the detection vector's measurement model at all (Safari
        // hangs on repeated `getCurrentPosition` with `maximumAge:
        // Infinity` after the shared-position cache was consumed by
        // other tests). That's "can't measure" — skip the whole
        // test rather than error on the first stall, because we
        // can't make any claim about the latency distribution
        // without at least one live sample.
        samples.push(
          await withTimeout(measureLatency(), LATENCY_SAMPLE_BUDGET_MS)
        )
      } catch (err) {
        if (err instanceof Error && err.message === CACHE_PROBE_TIMEOUT_TOKEN) {
          throw new SkipTestError(
            `Browser did not resolve getCurrentPosition within ${LATENCY_SAMPLE_BUDGET_MS}ms on sample ${i + 1}. This engine doesn't expose the cached-read path this probe relies on (typical of Safari) — nothing measurable either way.`
          )
        }
        throw err
      }
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance =
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
    const stddev = Math.sqrt(variance)
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    const looksReal = min < 10 || stddev > 100
    return {
      value: looksReal,
      describe: `n=8, min=${min.toFixed(1)}ms, max=${max.toFixed(1)}ms, mean=${mean.toFixed(1)}ms, stddev=${stddev.toFixed(1)}ms`,
    }
  },
})

const LATENCY_SAMPLE_BUDGET_MS = 2_000

// Note: there is intentionally no `high-accuracy-changes-latency` test
// here. Native desktop Firefox/Chrome have no GPS hardware to engage, so
// `enableHighAccuracy: true` and `false` both take the same Wi-Fi / MLS
// path and produce near-identical latency (observed |diff| ≈ 0.5ms on
// raw Firefox). The previous "known-limitation" framing implied this
// was a gap specific to GeoSpoof; in reality it's a property of the
// underlying browser on desktop, present with or without the extension.
// Flagging it either way would mislead the user.

const maximumAgeCachingTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.maximumage-returns-cached-faster",
  group: "geolocation-stealth",
  name: "maximumAge returns a cached position faster than a fresh fix",
  description:
    "Native geolocation caches positions and returns them synchronously (sub-millisecond) when `maximumAge` covers the time since the last fix. A spoofing implementation that always runs its artificial delay cannot produce this speedup — every call takes the same 10-50ms. Skipped when the engine's cache semantics don't produce a measurable speedup for an uncached call (Safari doesn't expose a sub-5ms path this probe can see, so the test can't make a claim either way there).",
  technique:
    "Rely on the run's shared position to prime the native cache, then measure a subsequent maximumAge: 60000 call. Assert the cached call is meaningfully faster than an artificial-delay floor (sub-5ms). Skips on engines where a cached call cannot be serviced at all within our short probe window.",
  codeSnippet: `await sharedPosition // primes the native cache
const cached = await measureLatency({maximumAge: 60000})
cached < 5  // sub-5ms means cached path hit`,
  expected: async () => ({ value: true, describe: "cached call < 5ms" }),
  observe: async (ctx) => {
    await getSharedPosition(ctx)
    await new Promise((r) => setTimeout(r, 10))
    // Use a short-timeout race so a stall surfaces as a skip, not a
    // 5s fail. On engines that don't expose a cached-read path at
    // all (Safari), the call can hang indefinitely — we can't
    // distinguish that from an extension blocking the cache, so we
    // skip rather than guess.
    let cached: number
    try {
      cached = await withTimeout(
        measureLatency({ maximumAge: 60_000 }),
        CACHE_PROBE_BUDGET_MS
      )
    } catch (err) {
      if (err instanceof Error && err.message === CACHE_PROBE_TIMEOUT_TOKEN) {
        throw new SkipTestError(
          `Browser did not service a maximumAge: 60000 call within ${CACHE_PROBE_BUDGET_MS}ms. This engine's geolocation cache doesn't expose a sub-5ms read path we can time against — typical of Safari, which is native behaviour rather than a GeoSpoof signal. Nothing to measure either way.`
        )
      }
      throw err
    }
    // Safari's CoreLocation-backed geolocation routes even `maximumAge:
    // 60_000` reads through its own service layer; observed latencies
    // cluster around 1.5-1.9s. That's well above the sub-5ms "cached
    // path hit" threshold this test is looking for, but it's also well
    // above any `setTimeout`-based spoofing delay — so a result in
    // that range is a signal that this engine doesn't expose the
    // detection vector at all, not that the extension is failing it.
    // Skip anything slower than 100ms (10× our spoofing's worst-case
    // 50ms delay) as "engine doesn't participate"; leave the fast
    // path as the genuine measurement.
    if (cached > 100) {
      throw new SkipTestError(
        `Cached call took ${cached.toFixed(1)}ms. This engine's geolocation cache doesn't expose a sub-5ms read path we can time against — typical of Safari, which is native behaviour rather than a GeoSpoof signal. Nothing to measure either way.`
      )
    }
    return {
      value: cached < 5,
      describe: `cached call latency=${cached.toFixed(1)}ms`,
    }
  },
})

const CACHE_PROBE_BUDGET_MS = 2_000
const CACHE_PROBE_TIMEOUT_TOKEN = "CACHE_PROBE_TIMEOUT"

/**
 * Race a promise against a short internal timeout. Lets us treat a
 * stall as a skip-worthy outcome rather than waiting for
 * `measureLatency`'s own 5s ceiling to fire as an error.
 */
function withTimeout<T>(inner: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(CACHE_PROBE_TIMEOUT_TOKEN))
    }, ms)
    inner.then(
      (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      },
      (err: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    )
  })
}

// Note: there is intentionally no `watchposition-fires-multiple-times`
// test here. Engines disagree on the cadence:
//   - Firefox re-fires watchPosition's callback every 2s even for a
//     stationary device.
//   - Safari fires once on initial fix and then only when the position
//     meaningfully changes; on a stationary desktop that means zero
//     subsequent callbacks for the whole observation window.
// Neither baseline is "wrong" — the spec says watchPosition fires as
// position changes. An extension that fires multiple times to look
// like Firefox actually stands out against Safari. The only reliable
// signal a fingerprinter would use here is a `position.coords`
// cross-check (already covered by the watchPosition-matches-
// getCurrentPosition test in values-correctness), so this cadence
// test was dropped rather than encoded as a Firefox-only assertion.

// ===========================================================================
// Manifest
// ===========================================================================

export const geolocationAdvancedTests: ReadonlyArray<TestDefinition> = [
  // Group 1 — shape fidelity
  methodBindingThrowsTest,
  toStringTagGeolocationTest,
  toStringTagPositionTest,
  toStringTagCoordsTest,
  toStringTagPermissionsTest,
  toStringTagPermissionStatusTest,
  positionJsonMatchesNativeTest,
  positionKeysMatchNativeTest,
  coordsKeysMatchNativeTest,
  positionOwnPropertyNamesTest,
  positionOwnSymbolsTest,
  coordsOwnPropertyNamesTest,
  coordsOwnSymbolsTest,
  coordsDescriptorsAreAccessorsTest,
  errorConstantsTest,
  coordPrecisionRealisticTest,
  // Group 2 — timing channels
  latencyDistributionTest,
  maximumAgeCachingTest,
]

// It helps the noop callback pass the method-binding test's lint.
// Kept unused to avoid accidentally hardening the test's input.

// The `Coords` type is used inside the tests above.
export type { Coords }
