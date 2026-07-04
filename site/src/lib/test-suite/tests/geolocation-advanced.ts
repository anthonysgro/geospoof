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
// GROUP 3 — ARGUMENT & ERROR SEMANTICS
// ===========================================================================
//
// These three vectors come from a July-2026 bug report against the
// extension. They are self-verifying: each derives its "native" oracle
// from the running browser itself (a thrown error's type/stack, or the
// untouched prototype's attribute order), so the cards read `pass` on a
// clean browser regardless of engine and only flip to `fail` when an
// override diverges from native behaviour.

/** Matches an extension-scheme URL anywhere in an error's stack trace. */
const EXTENSION_URL_RE = /(?:chrome|moz|safari-web)-extension:\/\/[^\s):]+/i

/** A geolocation instance cast to accept deliberately-wrong arguments. */
interface LooseGeolocation {
  getCurrentPosition: (...args: Array<unknown>) => unknown
  watchPosition: (...args: Array<unknown>) => unknown
  clearWatch: (watchId: number) => void
}

interface InvalidCallOutcome {
  label: string
  threwTypeError: boolean
  detail: string
}

/**
 * Invoke a geolocation call that native throws on, and report whether it
 * threw a TypeError. If a buggy override returns a watch id instead of
 * throwing, clear it so the probe doesn't leave a live watch running.
 */
function runInvalidGeoCall(
  label: string,
  call: () => unknown
): InvalidCallOutcome {
  try {
    const ret = call()
    if (typeof ret === "number") {
      try {
        navigator.geolocation.clearWatch(ret)
      } catch {
        /* nothing to clean up */
      }
    }
    return { label, threwTypeError: false, detail: "did not throw" }
  } catch (err) {
    const isTypeError = err instanceof TypeError
    const message = err instanceof Error ? err.message : String(err)
    return {
      label,
      threwTypeError: isTypeError,
      detail: isTypeError ? "TypeError" : `non-TypeError (${message})`,
    }
  }
}

const invalidArgumentsThrowTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.invalid-arguments-throw-typeerror",
  group: "geolocation-stealth",
  name: "getCurrentPosition / watchPosition throw TypeError on invalid arguments",
  description:
    "Per Web IDL, getCurrentPosition and watchPosition take a required PositionCallback and an optional PositionOptions dictionary. Calling them with no arguments, a non-callable first argument, or a primitive options value throws a TypeError synchronously on native. An override that skips this validation silently accepts the bad call — a one-line detection that no real browser exhibits.",
  technique:
    "Invoke both methods with (), ({}), and (noop, noop, 'b') and assert every call throws a TypeError.",
  codeSnippet: `navigator.geolocation.getCurrentPosition()                    // TypeError
navigator.geolocation.getCurrentPosition({})                  // TypeError
navigator.geolocation.getCurrentPosition(()=>{}, ()=>{}, 'b') // TypeError
// same three for watchPosition`,
  expected: async () => ({
    value: true,
    describe: "every invalid call throws TypeError",
  }),
  observe: async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      throw new SkipTestError("navigator.geolocation is not available")
    }
    const geo = navigator.geolocation as unknown as LooseGeolocation
    const noop = (): void => {}
    const outcomes: Array<InvalidCallOutcome> = [
      runInvalidGeoCall("getCurrentPosition()", () => geo.getCurrentPosition()),
      runInvalidGeoCall("getCurrentPosition({})", () =>
        geo.getCurrentPosition({})
      ),
      runInvalidGeoCall("getCurrentPosition(noop,noop,'b')", () =>
        geo.getCurrentPosition(noop, noop, "b")
      ),
      runInvalidGeoCall("watchPosition()", () => geo.watchPosition()),
      runInvalidGeoCall("watchPosition({})", () => geo.watchPosition({})),
      runInvalidGeoCall("watchPosition(noop,noop,'b')", () =>
        geo.watchPosition(noop, noop, "b")
      ),
    ]
    return {
      value: outcomes.every((o) => o.threwTypeError),
      describe: outcomes.map((o) => `${o.label} → ${o.detail}`).join("; "),
    }
  },
})

const permissionsQueryRejectsForeignThisTest = buildBehavioralTest<boolean>({
  id: "tampering.permissions.query-rejects-foreign-this",
  group: "geolocation-stealth",
  name: "Permissions.prototype.query rejects foreign this",
  description:
    'Native Web IDL brand-checks the receiver, but `query` is a Promise-returning operation, so a bad receiver yields a REJECTED promise (TypeError: "Illegal invocation" / "does not implement interface Permissions") rather than a synchronous throw. `Permissions.prototype.query.call({}, { name: "geolocation" })` must therefore return a promise that rejects with a TypeError whose stack carries no extension origin. An override that ignores `this` instead RESOLVES (handing back a fake "granted" through the bogus receiver), or leaks a chrome-extension:// frame in the rejection stack — both detectable.',
  technique:
    'Call `Permissions.prototype.query.call({}, { name: "geolocation" })`, await it, and assert it rejects with a TypeError whose stack contains no extension-scheme URL (rather than resolving).',
  codeSnippet: `try {
  await Permissions.prototype.query.call({}, { name: "geolocation" })
  // fail — native rejects a foreign this
} catch (e) {
  e instanceof TypeError &&
    !/(chrome|moz|safari-web)-extension:\\/\\//.test(e.stack) // pass
}`,
  expected: async () => {
    if (typeof Permissions === "undefined" || !navigator.permissions) {
      return { skipReason: "Permissions API not available" }
    }
    return {
      value: true,
      describe: "rejects with TypeError, no extension origin in stack",
    }
  },
  observe: async () => {
    if (typeof Permissions === "undefined") {
      throw new SkipTestError("Permissions interface not exposed")
    }
    let result: unknown
    try {
      result = Permissions.prototype.query.call({} as Permissions, {
        name: "geolocation" as PermissionName,
      })
    } catch (err) {
      // Some engine threw synchronously instead of rejecting — accept it as long
      // as it's a clean TypeError, but note the deviation from native.
      const isTypeError = err instanceof TypeError
      const stack =
        err instanceof Error && typeof err.stack === "string" ? err.stack : ""
      const leaked = EXTENSION_URL_RE.test(stack)
      return {
        value: isTypeError && !leaked,
        describe: `threw synchronously (native rejects): ${isTypeError ? "TypeError" : "non-TypeError"}${leaked ? ", leaks extension origin" : ""}`,
      }
    }
    if (!result || typeof (result as Promise<unknown>).then !== "function") {
      return { value: false, describe: "returned a non-promise value" }
    }
    try {
      await (result as Promise<PermissionStatus>)
      return {
        value: false,
        describe: "promise resolved (native rejects a foreign this)",
      }
    } catch (err) {
      const isTypeError = err instanceof TypeError
      const message = err instanceof Error ? err.message : String(err)
      const stack =
        err instanceof Error && typeof err.stack === "string" ? err.stack : ""
      const leak = stack.match(EXTENSION_URL_RE)
      return {
        value: isTypeError && leak === null,
        describe: leak
          ? `rejected but stack leaks extension origin: ${leak[0]}`
          : isTypeError
            ? `rejected with TypeError: "${message}"`
            : `rejected with non-TypeError: ${message}`,
      }
    }
  },
})

const errorStackHidesExtensionTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.error-stack-hides-extension-origin",
  group: "geolocation-stealth",
  name: "Foreign-this geolocation error does not leak an extension origin",
  description:
    "Calling a detached Geolocation method (the function pulled off navigator.geolocation and invoked with the wrong `this`) throws a TypeError natively. When a content-script override throws that error from its own injected script, the error's stack trace contains a chrome-extension:// / moz-extension:// URL — exposing the extension id and confirming its presence. A native browser's stack has no such frame.",
  technique:
    "Detach getCurrentPosition, call it so the brand check fails, and scan the thrown error's stack for an extension-scheme URL.",
  codeSnippet: `const f = navigator.geolocation.getCurrentPosition
try { f(() => {}) } catch (e) {
  /(chrome|moz|safari-web)-extension:\\/\\//.test(e.stack) // native: false
}`,
  expected: async () => ({
    value: false,
    describe: "no extension-scheme URL in the error stack",
  }),
  observe: async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      throw new SkipTestError("navigator.geolocation is not available")
    }
    const detached = navigator.geolocation.getCurrentPosition as (
      cb: PositionCallback
    ) => void
    let caught: unknown
    try {
      detached(() => {})
      return {
        value: false,
        describe:
          "call did not throw (override ignored `this`) — no stack to leak",
      }
    } catch (err) {
      caught = err
    }
    const isTypeError = caught instanceof TypeError
    const stack =
      caught instanceof Error && typeof caught.stack === "string"
        ? caught.stack
        : ""
    const match = stack.match(EXTENSION_URL_RE)
    const leaked = match !== null
    return {
      value: leaked,
      describe: leaked
        ? `stack leaks extension origin: ${match?.[0] ?? ""}`
        : `threw ${isTypeError ? "TypeError" : "error"} with no extension origin in stack`,
    }
  },
  // Pass when the observed "leaked" flag equals the expected `false`.
  equals: (expected, observed) => expected === observed,
})

/** A function invoked with a deliberately-foreign `this` to trip its brand check. */
type ForeignCallable = (this: unknown, ...args: Array<unknown>) => unknown

/**
 * The top-level interface prototypes GeoSpoof patches (methods and/or
 * accessors). Kept explicit rather than derived from the extension's internal
 * registry, which the page can't see. `Function.prototype` is deliberately
 * absent — its `toString` stack is arkenfox-tuned and handled separately.
 */
function patchedPrototypes(): Array<[string, object]> {
  const out: Array<[string, object]> = []
  const add = (name: string, proto: unknown): void => {
    if (proto !== null && typeof proto === "object") out.push([name, proto])
  }
  add("Date.prototype", Date.prototype)
  if (typeof Intl !== "undefined")
    add("Intl.DateTimeFormat.prototype", Intl.DateTimeFormat?.prototype)
  if (typeof GeolocationCoordinates !== "undefined")
    add("GeolocationCoordinates.prototype", GeolocationCoordinates.prototype)
  if (typeof GeolocationPosition !== "undefined")
    add("GeolocationPosition.prototype", GeolocationPosition.prototype)
  if (typeof Geolocation !== "undefined")
    add("Geolocation.prototype", Geolocation.prototype)
  if (typeof Permissions !== "undefined")
    add("Permissions.prototype", Permissions.prototype)
  if (typeof Document !== "undefined")
    add("Document.prototype", Document.prototype)
  const temporal = (
    globalThis as { Temporal?: { ZonedDateTime?: { prototype: object } } }
  ).Temporal
  if (temporal?.ZonedDateTime?.prototype)
    add("Temporal.ZonedDateTime.prototype", temporal.ZonedDateTime.prototype)
  if (typeof RTCPeerConnection !== "undefined")
    add("RTCPeerConnection.prototype", RTCPeerConnection.prototype)
  add("Node.prototype", Node.prototype)
  return out
}

/** Collect every own method/getter/setter on a prototype as foreign-this thunks. */
function foreignCallablesFor(
  protoName: string,
  proto: object
): Array<[string, ForeignCallable]> {
  const out: Array<[string, ForeignCallable]> = []
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === "constructor") continue
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc) continue
    if (typeof desc.value === "function")
      out.push([`${protoName}.${key}()`, desc.value as ForeignCallable])
    if (typeof desc.get === "function")
      out.push([`get ${protoName}.${key}`, desc.get as ForeignCallable])
    if (typeof desc.set === "function")
      out.push([`set ${protoName}.${key}`, desc.set as ForeignCallable])
  }
  return out
}

/**
 * The first extension-scheme URL in an error's stack, or null. Duck-typed
 * rather than `instanceof Error` so it also handles errors thrown in an iframe
 * realm (instances of that realm's Error, not this one's).
 */
function extensionLeakInStack(err: unknown): string | null {
  const stack =
    err !== null &&
    typeof err === "object" &&
    typeof (err as { stack?: unknown }).stack === "string"
      ? (err as { stack: string }).stack
      : ""
  return stack.match(EXTENSION_URL_RE)?.[0] ?? null
}

/** Safely walk a dotted path (e.g. ["Intl","DateTimeFormat","prototype"]) to a prototype object. */
function nestedProto(
  root: unknown,
  path: ReadonlyArray<string>
): object | null {
  let cur: unknown = root
  for (const key of path) {
    if (cur === null || (typeof cur !== "object" && typeof cur !== "function"))
      return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur !== null && typeof cur === "object" ? cur : null
}

const overridesDoNotLeakExtensionInStackTest = buildBehavioralTest<boolean>({
  id: "tampering.overrides.error-stack-hides-extension-origin",
  group: "geolocation-stealth",
  name: "Overridden APIs do not leak an extension origin in error stacks",
  description:
    "Generalization of the geolocation foreign-this check across EVERY patched surface, walked automatically. Web IDL methods/getters throw a TypeError (or, for promise-returning ops, reject) when called with a wrong `this`. If a content-script override throws/rejects from its own injected frame, the error's stack carries a chrome-extension:// / moz-extension:// URL — exposing the extension id. This enumerates every own method, getter, and setter on each patched prototype (Date, Intl.DateTimeFormat, GeolocationCoordinates/Position, Geolocation, Permissions, Document, Temporal.ZonedDateTime, RTCPeerConnection, Node), invokes each with a foreign `this`, awaits any rejections, and fails if ANY thrown/rejected stack contains an extension origin. Native browsers (and engines that anonymize content-script frames, i.e. Firefox/Safari) have none. (Function.prototype.toString is excluded — its stack is arkenfox-tuned and handled separately.)",
  technique:
    "Walk every own method/getter/setter of each patched prototype, invoke with a foreign `this` (awaiting promise rejections), and scan every thrown/rejected stack for an extension-scheme URL.",
  codeSnippet: `for (const proto of patchedPrototypes)
  for (const fn of ownMethodsAndAccessors(proto))
    try { await fn.call({}) } catch (e) { /(chrome|moz|safari-web)-extension:\\/\\//.test(e.stack) }`,
  expected: async () => ({
    value: false,
    describe: "no override leaks an extension origin",
  }),
  observe: async () => {
    const leaks: Array<string> = []
    const pending: Array<Promise<void>> = []
    // Cap async waits so a member that returns a slow/never-settling promise
    // can't hang the suite; a timeout surfaces as "no leak" (its own error
    // carries no extension origin), which is the safe default.
    const withCap = <T>(p: Promise<T>): Promise<T | undefined> =>
      Promise.race([
        p,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 1500)
        ),
      ])

    for (const [protoName, proto] of patchedPrototypes()) {
      for (const [label, fn] of foreignCallablesFor(protoName, proto)) {
        try {
          const result = fn.call({})
          // Promise-returning ops (query, getStats, RTCPeerConnection.create*)
          // reject rather than throw — capture their rejection stack too.
          if (
            result &&
            typeof (result as PromiseLike<unknown>).then === "function"
          ) {
            pending.push(
              withCap(Promise.resolve(result)).then(
                () => undefined,
                (err: unknown) => {
                  const leak = extensionLeakInStack(err)
                  if (leak) leaks.push(`${label} → ${leak}`)
                }
              )
            )
          }
        } catch (err) {
          const leak = extensionLeakInStack(err)
          if (leak) leaks.push(`${label} → ${leak}`)
        }
      }
    }
    await Promise.all(pending)

    return {
      value: leaks.length > 0,
      describe: leaks.length
        ? `leaks (${leaks.length}): ${leaks.slice(0, 6).join("; ")}${leaks.length > 6 ? " …" : ""}`
        : "no extension origin across any patched prototype member",
    }
  },
  // Pass when the observed "leaked" flag equals the expected `false`.
  equals: (expected, observed) => expected === observed,
})

const iframeGeolocationBrandCheckTest = buildBehavioralTest<boolean>({
  id: "tampering.iframe-realm.geolocation-rejects-foreign-this",
  group: "geolocation-stealth",
  name: "Iframe-realm Geolocation methods reject a foreign this",
  description:
    "Native Geolocation methods brand-check their receiver: `Geolocation.prototype.getCurrentPosition.call({}, noop)` throws TypeError synchronously. The top-level override enforces this, but the iframe cascade historically installed a simplified override that ignored `this` and ran anyway — detectable, and invisible to the stack-leak walker (it doesn't throw, so nothing lands in a catch). This creates a same-origin iframe, triggers patching, and asserts getCurrentPosition / watchPosition / clearWatch on the iframe's Geolocation.prototype all throw a TypeError for a foreign `this`.",
  technique:
    "Create a same-origin iframe, then call each Geolocation.prototype method with a foreign `this` and assert it throws synchronously.",
  codeSnippet: `const w = iframe.contentWindow
try { w.Geolocation.prototype.getCurrentPosition.call({}, () => {}) } // native: throws
catch (e) { e instanceof w.TypeError /* pass */ }`,
  expected: async () => ({
    value: true,
    describe: "all three methods throw for a foreign this",
  }),
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new SkipTestError("no document.body to attach an iframe to")
    }
    const frame = document.createElement("iframe")
    frame.style.display = "none"
    document.body.appendChild(frame)
    try {
      const win = frame.contentWindow as (Window & typeof globalThis) | null
      const proto = nestedProto(win, ["Geolocation", "prototype"])
      if (!win || !proto)
        return {
          value: false,
          describe: "iframe exposed no Geolocation.prototype",
        }
      const noop = (): void => {}
      const probes: Array<[string, () => void]> = [
        [
          "getCurrentPosition",
          () =>
            (
              proto as unknown as Record<string, ForeignCallable>
            ).getCurrentPosition.call({}, noop),
        ],
        [
          "watchPosition",
          () => {
            const r = (
              proto as unknown as Record<string, ForeignCallable>
            ).watchPosition.call({}, noop)
            // If a buggy override returned a watch id instead of throwing, clear it.
            if (typeof r === "number") {
              try {
                ;(
                  win.navigator.geolocation as unknown as {
                    clearWatch: (id: number) => void
                  }
                ).clearWatch(r)
              } catch {
                /* ignore */
              }
            }
          },
        ],
        [
          "clearWatch",
          () =>
            (
              proto as unknown as Record<string, ForeignCallable>
            ).clearWatch.call({}, 1),
        ],
      ]
      const results = probes.map(([name, run]) => {
        try {
          run()
          return `${name}: did NOT throw`
        } catch (err) {
          const isTypeError =
            err !== null &&
            typeof err === "object" &&
            (err as { constructor?: { name?: string } }).constructor?.name ===
              "TypeError"
          return `${name}: ${isTypeError ? "TypeError" : "threw non-TypeError"}`
        }
      })
      const allThrew = results.every((r) => r.endsWith("TypeError"))
      return { value: allThrew, describe: results.join("; ") }
    } finally {
      frame.remove()
    }
  },
})

const constructorsDoNotLeakExtensionInStackTest = buildBehavioralTest<boolean>({
  id: "tampering.constructors.error-stack-hides-extension-origin",
  group: "geolocation-stealth",
  name: "Overridden constructors do not leak an extension origin on invalid input",
  description:
    "The Date and Intl.DateTimeFormat constructors are replaced by the extension. Constructors have no `this` brand check, but on invalid input the native constructor throws (e.g. RangeError for an invalid `timeZone`). If the override rethrows that error from its own injected frame, the stack carries a chrome-extension:// URL — exposing the extension id. This calls the constructors with inputs that make native throw and asserts no thrown stack contains an extension origin. (Native `Date` does not throw on junk — it returns an Invalid Date — so it can't leak here; it's probed for completeness.)",
  technique:
    "Call `new Intl.DateTimeFormat('en', { timeZone: 'Not/AZone' })` (native throws RangeError) and `new Date('nonsense')`; scan any thrown stack for an extension-scheme URL.",
  codeSnippet: `try { new Intl.DateTimeFormat("en", { timeZone: "Not/AZone" }) }
catch (e) { /(chrome|moz|safari-web)-extension:\\/\\//.test(e.stack) }`,
  expected: async () => ({
    value: false,
    describe: "no constructor leaks an extension origin",
  }),
  observe: async () => {
    const probes: Array<[string, () => unknown]> = [
      [
        "new Intl.DateTimeFormat('en',{timeZone:'Not/AZone'})",
        () => new Intl.DateTimeFormat("en", { timeZone: "Not/AZone" }),
      ],
      ["new Date('nonsense')", () => new Date("nonsense")],
    ]
    const leaks: Array<string> = []
    for (const [label, run] of probes) {
      try {
        run()
      } catch (err) {
        const leak = extensionLeakInStack(err)
        if (leak) leaks.push(`${label} → ${leak}`)
      }
    }
    return {
      value: leaks.length > 0,
      describe: leaks.length
        ? `leaks (${leaks.length}): ${leaks.join("; ")}`
        : "no extension origin in any constructor stack",
    }
  },
  // Pass when the observed "leaked" flag equals the expected `false`.
  equals: (expected, observed) => expected === observed,
})

const iframeRealmDoesNotLeakExtensionInStackTest = buildBehavioralTest<boolean>(
  {
    id: "tampering.iframe-realm.error-stack-hides-extension-origin",
    group: "geolocation-stealth",
    name: "Iframe-realm overrides do not leak an extension origin in error stacks",
    description:
      "The cross-realm counterpart to the override stack-leak walker. The extension patches same-origin iframes by reaching into their realm (patchIframeWindow), so a foreign-`this` brand-check throw inside the iframe can leak the extension id the same way — and, subtly, the scrub itself must be cross-realm-safe: an error thrown in the iframe realm is an instance of the iframe's Error, so an `instanceof Error` guard in the scrub would skip it. This creates a same-origin iframe, triggers patching via `contentWindow`, walks every own method/getter/setter on the iframe realm's patched prototypes with a foreign `this`, awaits rejections, and fails if any thrown/rejected stack carries an extension origin.",
    technique:
      "Create a same-origin iframe, read contentWindow to trigger patching, then walk the iframe realm's prototypes with a foreign `this` and scan (duck-typed, cross-realm) for an extension-scheme URL in thrown/rejected stacks.",
    codeSnippet: `const f = document.createElement("iframe"); document.body.appendChild(f);
const w = f.contentWindow; // triggers patchIframeWindow
for (const fn of ownMembers(w.Date.prototype, w.Intl.DateTimeFormat.prototype, ...))
  try { fn.call({}) } catch (e) { /(chrome|moz|safari-web)-extension:\\/\\//.test(e.stack) }`,
    expected: async () => ({
      value: false,
      describe: "no iframe-realm override leaks an extension origin",
    }),
    observe: async () => {
      if (typeof document === "undefined" || !document.body) {
        throw new SkipTestError("no document.body to attach an iframe to")
      }
      const frame = document.createElement("iframe")
      frame.style.display = "none"
      document.body.appendChild(frame)
      try {
        const win = frame.contentWindow
        if (!win)
          return { value: false, describe: "iframe exposed no contentWindow" }

        const targets: Array<[string, object]> = []
        const add = (name: string, path: ReadonlyArray<string>): void => {
          const proto = nestedProto(win, path)
          if (proto) targets.push([name, proto])
        }
        add("Date.prototype", ["Date", "prototype"])
        add("Intl.DateTimeFormat.prototype", [
          "Intl",
          "DateTimeFormat",
          "prototype",
        ])
        add("Geolocation.prototype", ["Geolocation", "prototype"])
        add("Permissions.prototype", ["Permissions", "prototype"])
        add("Document.prototype", ["Document", "prototype"])
        add("Element.prototype", ["Element", "prototype"])
        add("HTMLIFrameElement.prototype", ["HTMLIFrameElement", "prototype"])
        add("Node.prototype", ["Node", "prototype"])

        const leaks: Array<string> = []
        const pending: Array<Promise<void>> = []
        const withCap = <T>(p: Promise<T>): Promise<T | undefined> =>
          Promise.race([
            p,
            new Promise<undefined>((resolve) =>
              setTimeout(() => resolve(undefined), 1500)
            ),
          ])

        for (const [protoName, proto] of targets) {
          for (const [label, fn] of foreignCallablesFor(protoName, proto)) {
            try {
              const result = fn.call({})
              if (
                result &&
                typeof (result as PromiseLike<unknown>).then === "function"
              ) {
                pending.push(
                  withCap(Promise.resolve(result)).then(
                    () => undefined,
                    (err: unknown) => {
                      const leak = extensionLeakInStack(err)
                      if (leak) leaks.push(`${label} → ${leak}`)
                    }
                  )
                )
              }
            } catch (err) {
              const leak = extensionLeakInStack(err)
              if (leak) leaks.push(`${label} → ${leak}`)
            }
          }
        }
        await Promise.all(pending)

        return {
          value: leaks.length > 0,
          describe: leaks.length
            ? `leaks (${leaks.length}): ${leaks.slice(0, 6).join("; ")}${leaks.length > 6 ? " …" : ""}`
            : "no extension origin across any iframe-realm member",
        }
      } finally {
        frame.remove()
      }
    },
    // Pass when the observed "leaked" flag equals the expected `false`.
    equals: (expected, observed) => expected === observed,
  }
)

/** The seven GeolocationCoordinates attribute names (any engine order). */
const COORD_ATTRS: ReadonlyArray<string> = [
  "accuracy",
  "altitude",
  "altitudeAccuracy",
  "heading",
  "latitude",
  "longitude",
  "speed",
]
/** The two GeolocationPosition attribute names. */
const POSITION_ATTRS: ReadonlyArray<string> = ["coords", "timestamp"]

/**
 * The true native `[Default] toJSON()` key order — which is engine-specific and
 * is NOT the same as the prototype's own-property order (Blink installs the
 * attribute getters in one order but serializes them in another, and the order
 * can't be sampled from a spoofed instance because native `toJSON` brand-checks
 * and throws). We therefore encode the two known native orders, verified
 * against the engines' own IDL sources, and pick by engine family:
 *
 *   - Blink (Chromium): accuracy leads coords, timestamp leads position.
 *     (Confirmed empirically on Chrome 149; matches MDN's example output.)
 *   - Gecko / WebKit: latitude leads coords (altitude before accuracy), coords
 *     leads position. (Verified against the Gecko and WebKit IDL sources, which
 *     are byte-identical in attribute order.)
 *
 * On a clean browser the observed native `toJSON()` order must equal the entry
 * for its engine — so these cards double as a self-check: if an engine ever
 * changes its serialization order, the card fails on a clean browser and tells
 * us to update the table.
 *
 * Sources:
 *   - https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/toJSON
 *   - https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition/toJSON
 *   - Gecko:  https://github.com/mozilla/gecko-dev/blob/master/dom/webidl/GeolocationCoordinates.webidl
 *   - WebKit: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/geolocation/GeolocationCoordinates.idl
 *   - Spec:   https://www.w3.org/TR/geolocation/  (the `[Default] object toJSON()` serializer)
 */
type EngineFamily = "blink" | "gecko-webkit"

function detectEngineFamily(): EngineFamily {
  // Only Blink needs singling out — Gecko and WebKit share the same native
  // order. `navigator.userAgentData` is Chromium-only (Firefox and Safari have
  // both stated they won't ship User-Agent Client Hints), so its presence is a
  // clean, non-deprecated positive signal for Blink. iOS "Chrome" (CriOS) is
  // really WebKit and does not expose it, so it correctly reads as non-Blink.
  // UA-string sniffing remains only as a last-resort fallback for old Chromium
  // that predates userAgentData.
  if (typeof navigator === "undefined") return "gecko-webkit"
  const uaData = (navigator as Navigator & { userAgentData?: unknown })
    .userAgentData
  if (uaData) return "blink"
  return /\bChrome\//.test(navigator.userAgent || "") ? "blink" : "gecko-webkit"
}

const NATIVE_COORDS_ORDER: Record<EngineFamily, ReadonlyArray<string>> = {
  blink: [
    "accuracy",
    "latitude",
    "longitude",
    "altitude",
    "altitudeAccuracy",
    "heading",
    "speed",
  ],
  "gecko-webkit": [
    "latitude",
    "longitude",
    "altitude",
    "accuracy",
    "altitudeAccuracy",
    "heading",
    "speed",
  ],
}

const NATIVE_POSITION_ORDER: Record<EngineFamily, ReadonlyArray<string>> = {
  blink: ["timestamp", "coords"],
  "gecko-webkit": ["coords", "timestamp"],
}

/** Read the ordered keys of an object's `toJSON()` output (attrs only). */
function toJsonKeyOrder(
  obj: object,
  attrs: ReadonlyArray<string>
): Array<string> {
  const withToJson = obj as { toJSON?: () => unknown }
  const json =
    typeof withToJson.toJSON === "function"
      ? withToJson.toJSON()
      : (JSON.parse(JSON.stringify(obj)) as unknown)
  if (json === null || typeof json !== "object") return []
  const known = new Set(attrs)
  return Object.keys(json as Record<string, unknown>).filter((k) =>
    known.has(k)
  )
}

const coordsToJsonOrderTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.coords-tojson-key-order",
  group: "geolocation-stealth",
  name: "GeolocationCoordinates toJSON key order matches native",
  description:
    "JSON.stringify(position.coords) must emit keys in the running engine's native [Default] toJSON() order. That order is engine-specific — Blink (Chromium) leads with accuracy; Gecko/WebKit lead with latitude — and it is NOT the prototype's property order, so an override that guesses or reuses the prototype order mismatches native. The expected order comes from the per-engine native serialization order (verified against each engine's IDL), so on a clean browser the observed native output equals it.",
  technique:
    "Compare the key order of position.coords.toJSON() against the running engine's known native serialization order.",
  codeSnippet: `Object.keys((await getPosition()).coords.toJSON())
// Blink: [accuracy, latitude, longitude, altitude, ...]
// Gecko/WebKit: [latitude, longitude, altitude, accuracy, ...]`,
  expected: async () => {
    if (typeof GeolocationCoordinates === "undefined") {
      return { skipReason: "GeolocationCoordinates interface not exposed" }
    }
    const order = NATIVE_COORDS_ORDER[detectEngineFamily()]
    return { value: order.join(","), describe: `[${order.join(", ")}]` }
  },
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = toJsonKeyOrder(pos.coords, COORD_ATTRS)
    return { value: keys.join(","), describe: `[${keys.join(", ")}]` }
  },
})

const positionToJsonOrderTest = buildBehavioralTest<string>({
  id: "tampering.geolocation.position-tojson-key-order",
  group: "geolocation-stealth",
  name: "GeolocationPosition toJSON key order matches native",
  description:
    "Same as the coords key-order check, but for the outer GeolocationPosition (coords vs timestamp). The native serializer order is engine-specific — Blink emits timestamp before coords; Gecko/WebKit emit coords before timestamp — and is not the prototype order. Expected comes from the per-engine native order, so a clean browser passes and only an override emitting the wrong order fails.",
  technique:
    "Compare the key order of position.toJSON() against the running engine's known native serialization order.",
  codeSnippet: `Object.keys((await getPosition()).toJSON())
// Blink: [timestamp, coords]   Gecko/WebKit: [coords, timestamp]`,
  expected: async () => {
    if (typeof GeolocationPosition === "undefined") {
      return { skipReason: "GeolocationPosition interface not exposed" }
    }
    const order = NATIVE_POSITION_ORDER[detectEngineFamily()]
    return { value: order.join(","), describe: `[${order.join(", ")}]` }
  },
  observe: async (ctx) => {
    const pos = await getFullPosition(ctx)
    const keys = toJsonKeyOrder(pos, POSITION_ATTRS)
    return { value: keys.join(","), describe: `[${keys.join(", ")}]` }
  },
})

/**
 * Resolve a spoofed position from a same-origin iframe realm, with a hard
 * timeout so a clean browser that never grants geolocation (or Safari's
 * serialized geolocation queue) makes the caller skip rather than hang the
 * suite. While the extension is active this resolves immediately with spoofed
 * coords regardless of permission state.
 */
function getIframePosition(
  win: Window & typeof globalThis,
  timeoutMs = GEO_CALL_TIMEOUT_MS
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error("iframe getCurrentPosition timed out"))
    }, timeoutMs)
    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    try {
      win.navigator.geolocation.getCurrentPosition(
        (p) => done(() => resolve(p)),
        (e) =>
          done(() =>
            reject(new Error(`iframe getCurrentPosition error: ${e.message}`))
          ),
        { maximumAge: Number.POSITIVE_INFINITY }
      )
    } catch (err) {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

const iframeGeolocationObjectShapeTest = buildBehavioralTest<boolean>({
  id: "tampering.iframe-realm.geolocation-object-shape-matches-native",
  group: "geolocation-stealth",
  name: "Iframe-realm spoofed position matches native object shape",
  description:
    "A spoofed GeolocationPosition read through a same-origin iframe must be byte-identical in shape to a native one: zero own properties (values are served by prototype accessors, so Object.keys(coords) and Object.keys(position) are []), and a working toJSON() that emits the engine's native key order. An earlier iframe builder installed own data properties and never installed the accessor/toJSON overrides on the iframe realm, so iframe coords had enumerable own keys and coords.toJSON() threw Illegal invocation — both trivially distinguishable from the top frame. This creates a same-origin iframe, reads a spoofed position from its realm, and asserts own-keys are empty and the toJSON order matches native.",
  technique:
    "Create a same-origin iframe, get a position from its navigator.geolocation, then assert Object.keys(coords)/Object.keys(position) are empty and coords/position toJSON() key order equals the running engine's native order.",
  codeSnippet: `const w = iframe.contentWindow
const p = await new Promise(r => w.navigator.geolocation.getCurrentPosition(r))
Object.keys(p.coords)           // native: []
Object.keys(p.coords.toJSON())  // native engine order, must not throw`,
  expected: async () => ({
    value: true,
    describe: "empty own-keys; toJSON order matches native",
  }),
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new SkipTestError("no document.body to attach an iframe to")
    }
    const frame = document.createElement("iframe")
    frame.setAttribute("allow", "geolocation")
    frame.style.display = "none"
    document.body.appendChild(frame)
    try {
      const win = frame.contentWindow as (Window & typeof globalThis) | null
      if (!win)
        return { value: false, describe: "iframe exposed no contentWindow" }
      let ifPos: GeolocationPosition
      try {
        ifPos = await getIframePosition(win)
      } catch (err) {
        // No grantable position on a clean browser (or Safari's serialized
        // queue) — skip rather than flake. The card is meaningful whenever a
        // position is obtainable, which is always true while the extension is
        // active (it returns spoofed coords synchronously).
        throw new SkipTestError(
          `no iframe position available: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      const fam = detectEngineFamily()
      const problems: Array<string> = []

      const coordsOwn = Object.keys(ifPos.coords)
      if (coordsOwn.length)
        problems.push(`coords own-keys [${coordsOwn.join(",")}]`)
      const posOwn = Object.keys(ifPos)
      if (posOwn.length)
        problems.push(`position own-keys [${posOwn.join(",")}]`)

      try {
        const order = toJsonKeyOrder(ifPos.coords, COORD_ATTRS).join(",")
        const want = NATIVE_COORDS_ORDER[fam].join(",")
        if (order !== want)
          problems.push(`coords.toJSON [${order}] != native [${want}]`)
      } catch (err) {
        problems.push(
          `coords.toJSON threw ${err instanceof Error ? err.constructor.name : "?"}`
        )
      }

      try {
        const order = toJsonKeyOrder(ifPos, POSITION_ATTRS).join(",")
        const want = NATIVE_POSITION_ORDER[fam].join(",")
        if (order !== want)
          problems.push(`position.toJSON [${order}] != native [${want}]`)
      } catch (err) {
        problems.push(
          `position.toJSON threw ${err instanceof Error ? err.constructor.name : "?"}`
        )
      }

      return {
        value: problems.length === 0,
        describe: problems.length
          ? problems.join("; ")
          : "empty own-keys; toJSON order matches native",
      }
    } finally {
      frame.remove()
    }
  },
})

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
  // Group 3 — argument & error semantics (July-2026 bug report)
  invalidArgumentsThrowTest,
  errorStackHidesExtensionTest,
  permissionsQueryRejectsForeignThisTest,
  overridesDoNotLeakExtensionInStackTest,
  constructorsDoNotLeakExtensionInStackTest,
  iframeRealmDoesNotLeakExtensionInStackTest,
  iframeGeolocationBrandCheckTest,
  iframeGeolocationObjectShapeTest,
  coordsToJsonOrderTest,
  positionToJsonOrderTest,
]

// It helps the noop callback pass the method-binding test's lint.
// Kept unused to avoid accidentally hardening the test's input.

// The `Coords` type is used inside the tests above.
export type { Coords }
