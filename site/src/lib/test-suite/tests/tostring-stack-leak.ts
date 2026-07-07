/**
 * Detection battery for the extension-id stack leak through
 * `Function.prototype.toString`.
 *
 * The extension patches `Function.prototype.toString` (main realm) and each
 * iframe realm's `Function.prototype.toString`. When that patched toString is
 * invoked with a receiver it must reject (a non-function `this` — the classic
 * "detach the method and call it bare" pattern, `const f = x.toString; f()`),
 * the browser throws a `TypeError`. If that error is thrown from *inside* the
 * injected script, its `.stack` carries a `chrome-extension://<id>/…` (or
 * `moz-extension://` / `safari-web-extension://`) frame — and a fingerprinter
 * can read the extension id straight off it.
 *
 * A clean browser throws the identical `TypeError` with a stack that contains
 * only engine-native frames (`at Object.toString (<anonymous>)`) plus the
 * page's own caller — never a file-located extension frame. So the decisive,
 * engine-portable signal is simple: the thrown error's stack must contain no
 * `*-extension://` URL. These tests provoke the throw through every reported
 * entry point (the toString override itself, a detached geolocation-method
 * toString, the WeakMap-backed coordinate/position getters, and the iframe
 * realm) and fail when an extension id appears.
 *
 * On a clean browser every case passes trivially (no extension frame exists),
 * so the battery is safe to run with the extension disabled and only turns red
 * when a real leak is present.
 */

import type { TestDefinition, TestResult } from "../types"

/** Matches any web-extension resource URL and captures the extension id. */
const EXTENSION_URL_RE =
  /(?:chrome-extension|moz-extension|safari-web-extension):\/\/([a-z0-9-]+)/i

interface ThrowProbe {
  /** Did invoking the probe actually throw? */
  threw: boolean
  /** The thrown value's stack, or "" when absent/non-string. */
  stack: string
  /** The thrown value's message, or "" when absent. */
  message: string
  /** Was the thrown value a TypeError (the native shape for this rejection)? */
  isTypeError: boolean
  /** Extension id read out of the stack, or null when the stack is clean. */
  leakedId: string | null
}

/**
 * Invoke `fn`, expecting it to throw, and report whether the thrown error's
 * stack leaks an extension id. Never throws itself — a probe that does not
 * throw is reported via `threw: false` so the caller can decide what that means
 * for the specific case.
 */
function provoke(fn: () => unknown): ThrowProbe {
  try {
    fn()
    return {
      threw: false,
      stack: "",
      message: "",
      isTypeError: false,
      leakedId: null,
    }
  } catch (e) {
    const err = e as { stack?: unknown; message?: unknown }
    const stack = typeof err.stack === "string" ? err.stack : ""
    const message = typeof err.message === "string" ? err.message : String(e)
    const match = EXTENSION_URL_RE.exec(stack)
    return {
      threw: true,
      stack,
      message,
      isTypeError: e instanceof TypeError,
      leakedId: match ? match[1] : null,
    }
  }
}

/**
 * Turn a completed probe into a TestResult. A leaked id is a hard fail; a probe
 * that unexpectedly did not throw is a fail too (the reject path is where the
 * leak lives, so if it stopped throwing the assumptions changed). Otherwise the
 * stack is clean and the test passes.
 */
function resultFromProbe(probe: ThrowProbe): TestResult {
  if (!probe.threw) {
    return {
      status: "fail",
      expected:
        "TypeError thrown with a stack free of any extension:// URL",
      actual: "call did not throw (reject path changed — re-verify)",
    }
  }
  if (probe.leakedId) {
    return {
      status: "fail",
      expected: "no extension:// frame in the thrown error's stack",
      actual: `stack leaks extension id "${probe.leakedId}"`,
      details: { message: probe.message, stack: probe.stack },
    }
  }
  return {
    status: "pass",
    expected: "no extension:// frame in the thrown error's stack",
    actual: "stack contains only native/page frames",
    details: { message: probe.message, stack: probe.stack },
  }
}

/**
 * Detach a property's function value and call it bare so `this` is the global
 * object (a non-function). Mirrors the real-world detection pattern
 * `const f = obj.method.toString; f()`.
 */
function detachedToStringCall(fn: unknown): () => unknown {
  // Reading `.toString` off any function resolves to the (patched)
  // Function.prototype.toString via the prototype chain. Calling it detached
  // makes `this` the global object, which the toString rejects.
  const toStr = (fn as { toString?: unknown }).toString
  return () => (toStr as () => unknown)()
}

const toStringStackLeakBattery: ReadonlyArray<TestDefinition> = [
  {
    id: "extension-presence.tostring-leak.function-proto-call",
    group: "extension-presence",
    name: "Function.prototype.toString.call({}) does not leak the extension id",
    description:
      "The patched Function.prototype.toString must reject a non-function receiver with a native-looking stack. If it throws from inside the injected script, the extension id appears in the stack.",
    technique:
      "Call Function.prototype.toString on a plain object and scan the thrown TypeError's stack for a chrome-extension:// (or moz-/safari-web-) URL.",
    codeSnippet: `try { Function.prototype.toString.call({}) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> =>
      resultFromProbe(provoke(() => Function.prototype.toString.call({}))),
  },
  {
    id: "extension-presence.tostring-leak.detached-geolocation-method",
    group: "extension-presence",
    name: "Detached geolocation-method toString does not leak the extension id",
    description:
      "Reading `navigator.geolocation.getCurrentPosition.toString` and calling it bare resolves to the patched Function.prototype.toString with a non-function `this`. The rejection must not expose the extension id.",
    technique:
      "const f = navigator.geolocation.getCurrentPosition.toString; f() — then scan the thrown stack for an extension:// URL.",
    codeSnippet: `const f = navigator.geolocation.getCurrentPosition.toString
try { f() } catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return {
          status: "skipped",
          expected: "navigator.geolocation to be present",
          actual: "navigator.geolocation unavailable",
        }
      }
       
      const method = navigator.geolocation.getCurrentPosition
      return resultFromProbe(provoke(detachedToStringCall(method)))
    },
  },
  {
    id: "extension-presence.tostring-leak.coords-getter",
    group: "extension-presence",
    name: "Detached GeolocationCoordinates getter toString does not leak the id",
    description:
      "The `latitude` getter on GeolocationCoordinates.prototype is overridden. Its detached toString resolves to the patched Function.prototype.toString and must reject without exposing the extension id.",
    technique:
      "Extract the latitude getter from the prototype descriptor, detach its toString, call it bare, and scan the thrown stack.",
    codeSnippet: `const { get } = Object.getOwnPropertyDescriptor(
  GeolocationCoordinates.prototype, "latitude")
const f = get.toString
try { f() } catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof GeolocationCoordinates === "undefined") {
        return {
          status: "skipped",
          expected: "GeolocationCoordinates to be present",
          actual: "GeolocationCoordinates unavailable",
        }
      }
      const desc = Object.getOwnPropertyDescriptor(
        GeolocationCoordinates.prototype,
        "latitude"
      )
      if (!desc?.get) {
        return {
          status: "skipped",
          expected: "latitude getter to be present on the prototype",
          actual: "no latitude getter found",
        }
      }
      return resultFromProbe(provoke(detachedToStringCall(desc.get)))
    },
  },
  {
    id: "extension-presence.tostring-leak.position-getter",
    group: "extension-presence",
    name: "Detached GeolocationPosition getter toString does not leak the id",
    description:
      "The `timestamp` getter on GeolocationPosition.prototype is overridden. Its detached toString resolves to the patched Function.prototype.toString and must reject without exposing the extension id.",
    technique:
      "Extract the timestamp getter from the prototype descriptor, detach its toString, call it bare, and scan the thrown stack.",
    codeSnippet: `const { get } = Object.getOwnPropertyDescriptor(
  GeolocationPosition.prototype, "timestamp")
const f = get.toString
try { f() } catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof GeolocationPosition === "undefined") {
        return {
          status: "skipped",
          expected: "GeolocationPosition to be present",
          actual: "GeolocationPosition unavailable",
        }
      }
      const desc = Object.getOwnPropertyDescriptor(
        GeolocationPosition.prototype,
        "timestamp"
      )
      if (!desc?.get) {
        return {
          status: "skipped",
          expected: "timestamp getter to be present on the prototype",
          actual: "no timestamp getter found",
        }
      }
      return resultFromProbe(provoke(detachedToStringCall(desc.get)))
    },
  },
  {
    id: "extension-presence.tostring-leak.iframe-realm",
    group: "extension-presence",
    name: "Iframe-realm Function.prototype.toString does not leak the id",
    description:
      "Each same-origin iframe realm has its own patched Function.prototype.toString. Its rejection path must scrub injected frames too, or the extension id leaks through the iframe cascade.",
    technique:
      "Create a same-origin iframe, call its Function.prototype.toString on a plain object, and scan the thrown stack for an extension:// URL.",
    codeSnippet: `const ifr = document.createElement("iframe")
document.documentElement.appendChild(ifr)
try { ifr.contentWindow.Function.prototype.toString.call({}) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof document === "undefined") {
        return {
          status: "skipped",
          expected: "a DOM to create an iframe in",
          actual: "document unavailable",
        }
      }
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      iframe.setAttribute("aria-hidden", "true")
      document.documentElement.appendChild(iframe)
      try {
        const win = iframe.contentWindow as (Window & typeof globalThis) | null
        if (!win) {
          return {
            status: "skipped",
            expected: "iframe contentWindow to be accessible",
            actual: "contentWindow unavailable",
          }
        }
        return resultFromProbe(
          provoke(() => win.Function.prototype.toString.call({}))
        )
      } finally {
        iframe.remove()
      }
    },
  },
]

export const toStringStackLeakTests: ReadonlyArray<TestDefinition> =
  toStringStackLeakBattery
