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

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

const GEO_CALL_TIMEOUT_MS = 5_000

interface Coords {
  latitude: number
  longitude: number
}

/**
 * Fetch a raw `GeolocationPosition` without flattening — shape tests
 * need access to the position object's own-property layout, prototype,
 * and WebIDL brand.
 */
function getFullPosition(timeoutMs: number): Promise<GeolocationPosition> {
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
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(pos)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new Error(`getCurrentPosition error: ${err.message}`))
        },
        { timeout: timeoutMs }
      )
    } catch (err) {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/** Invoke `getCurrentPosition` and return its wall-clock call-to-callback latency. */
function measureLatency(options?: PositionOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
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
          resolve(performance.now() - start)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new Error(`getCurrentPosition error: ${err.message}`))
        },
        options
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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

const accuracyNotSuspiciousTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.accuracy-not-suspicious-default",
  group: "geolocation-stealth",
  name: "position.coords.accuracy is not a suspiciously round default",
  description:
    "Real geolocation accuracy varies by source (GPS, Wi-Fi, cell). A constant value across calls — especially a round number like exactly 10 meters — is a detectable signature of an override that didn't bother to vary it. A detector can call getCurrentPosition multiple times and flag zero variance.",
  technique:
    "Call getCurrentPosition twice with a small delay, compute the difference in accuracy, and assert it's not exactly zero. If both calls return exactly the same value, the override is using a static default.",
  codeSnippet: `const p1 = await getPosition()
await new Promise(r => setTimeout(r, 200))
const p2 = await getPosition()
p1.coords.accuracy !== p2.coords.accuracy
  || p1.coords.accuracy % 1 !== 0  // or at least it's not an integer`,
  expected: async () => ({
    value: true,
    describe: "accuracy varies or is non-integer",
  }),
  observe: async () => {
    const p1 = await getFullPosition(GEO_CALL_TIMEOUT_MS)
    await new Promise((r) => setTimeout(r, 200))
    const p2 = await getFullPosition(GEO_CALL_TIMEOUT_MS)
    const a1 = p1.coords.accuracy
    const a2 = p2.coords.accuracy
    const varies = a1 !== a2
    const fractional = a1 % 1 !== 0 || a2 % 1 !== 0
    const value = varies || fractional
    return {
      value,
      describe: `call1=${a1}m, call2=${a2}m (varies=${String(varies)}, fractional=${String(fractional)})`,
    }
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
  observe: async () => {
    const pos = await getFullPosition(GEO_CALL_TIMEOUT_MS)
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
    "Run getCurrentPosition 8 times, collect latencies, assert the standard deviation is meaningful (not suspiciously clustered) OR at least one call is sub-5ms (indicating cached native response).",
  codeSnippet: `const samples = []
for (let i = 0; i < 8; i++) samples.push(await measureLatency())
// at least one very-fast cached call OR realistic stddev`,
  expected: async () => ({ value: true, describe: "distribution looks real" }),
  observe: async () => {
    const samples: Array<number> = []
    for (let i = 0; i < 8; i++) {
      samples.push(await measureLatency())
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance =
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
    const stddev = Math.sqrt(variance)
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    // Heuristic: a real distribution has at least one sub-5ms (cached) OR
    // stddev > 100ms (heavy tail). An artificial 10-50ms uniform has no
    // sub-5ms and stddev ~12ms.
    const looksReal = min < 5 || stddev > 100
    return {
      value: looksReal,
      describe: `n=8, min=${min.toFixed(1)}ms, max=${max.toFixed(1)}ms, mean=${mean.toFixed(1)}ms, stddev=${stddev.toFixed(1)}ms`,
    }
  },
})

const highAccuracyLatencyDifferentialTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.high-accuracy-changes-latency",
  group: "known-limitations",
  name: "enableHighAccuracy changes callback latency",
  description:
    "Native geolocation reacts to `enableHighAccuracy: true` by engaging GPS hardware, which takes measurably longer than a Wi-Fi/IP-based fix. A content-script spoofer has no hardware to engage — both option values return through the same setTimeout path with indistinguishable latency. Adding an artificial delay when the flag is set would be detectable as a perfect step function, so we don't try. This is a documented limitation of JavaScript-level spoofing.",
  technique:
    "Run two bursts of 4 calls each — high-accuracy vs low-accuracy — compute mean latency of each, assert they differ by at least 5ms.",
  codeSnippet: `const low = [await measureLatency({enableHighAccuracy: false}), ...]
const high = [await measureLatency({enableHighAccuracy: true}), ...]
Math.abs(mean(high) - mean(low)) > 5`,
  expected: async () => ({
    value: true,
    describe: "latency differential > 5ms",
  }),
  observe: async () => {
    const low: Array<number> = []
    const high: Array<number> = []
    for (let i = 0; i < 4; i++) {
      low.push(await measureLatency({ enableHighAccuracy: false }))
    }
    for (let i = 0; i < 4; i++) {
      high.push(await measureLatency({ enableHighAccuracy: true }))
    }
    const meanLow = low.reduce((a, b) => a + b, 0) / low.length
    const meanHigh = high.reduce((a, b) => a + b, 0) / high.length
    const diff = Math.abs(meanHigh - meanLow)
    return {
      value: diff > 5,
      describe: `low-acc mean=${meanLow.toFixed(1)}ms, high-acc mean=${meanHigh.toFixed(1)}ms, |diff|=${diff.toFixed(1)}ms`,
    }
  },
})

const maximumAgeCachingTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.maximumage-returns-cached-faster",
  group: "geolocation-stealth",
  name: "maximumAge returns a cached position faster than a fresh fix",
  description:
    "Native geolocation caches positions and returns them synchronously (sub-millisecond) when `maximumAge` covers the time since the last fix. A spoofing implementation that always runs its artificial delay cannot produce this speedup — every call takes the same 10-50ms.",
  technique:
    "Make a fresh call (prime the cache), then immediately call again with maximumAge: 60000. Assert the second call is meaningfully faster.",
  codeSnippet: `await measureLatency({maximumAge: 0})  // prime
const cached = await measureLatency({maximumAge: 60000})  // should be fast
cached < 5  // sub-5ms means cached path hit`,
  expected: async () => ({ value: true, describe: "cached call < 5ms" }),
  observe: async () => {
    // Prime the native cache with a fresh call
    await measureLatency({ maximumAge: 0 })
    // Small sleep to let the internal cache settle
    await new Promise((r) => setTimeout(r, 10))
    // Second call with wide maxAge should hit the cache
    const cached = await measureLatency({ maximumAge: 60_000 })
    return {
      value: cached < 5,
      describe: `cached call latency=${cached.toFixed(1)}ms`,
    }
  },
})

const watchPositionCadenceTest = buildBehavioralTest<boolean>({
  id: "tampering.geolocation.watchposition-fires-multiple-times",
  group: "geolocation-stealth",
  name: "watchPosition fires its callback more than once over time",
  description:
    "Native watchPosition calls the success callback repeatedly as the device moves, usually every few seconds even for a stationary device. A spoofing implementation that fires once and never again is easy to distinguish — a page that waits 5 seconds and counts callbacks will see 1 from the override and 2-3+ from native.",
  technique:
    "Start watchPosition, wait 3 seconds, clearWatch, and assert the callback fired at least twice.",
  codeSnippet: `let count = 0
const id = navigator.geolocation.watchPosition(() => count++)
await new Promise(r => setTimeout(r, 3000))
navigator.geolocation.clearWatch(id)
count >= 2`,
  expected: async () => ({
    value: true,
    describe: "≥2 callbacks in 3 seconds",
  }),
  observe: async () => {
    const geo = navigator.geolocation
    let count = 0
    let watchId: number | null = null
    try {
      watchId = geo.watchPosition(
        () => {
          count += 1
        },
        () => {
          // error callbacks don't count, but shouldn't crash the test either
        }
      )
      await new Promise((r) => setTimeout(r, 3_000))
    } finally {
      if (watchId !== null) {
        try {
          geo.clearWatch(watchId)
        } catch {
          // never mask the primary result
        }
      }
    }
    return {
      value: count >= 2,
      describe: `callback fired ${count} time(s) in 3s`,
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
  accuracyNotSuspiciousTest,
  coordPrecisionRealisticTest,
  // Group 2 — timing channels
  latencyDistributionTest,
  highAccuracyLatencyDifferentialTest,
  maximumAgeCachingTest,
  watchPositionCadenceTest,
]

// It helps the noop callback pass the method-binding test's lint.
// Kept unused to avoid accidentally hardening the test's input.

// The `Coords` type is used inside the tests above.
export type { Coords }
