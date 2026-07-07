/**
 * Detection battery for extension-id leaks through *constructor* error stacks.
 *
 * Companion to `tostring-stack-leak.ts`. The overrides for `Date`,
 * `Intl.DateTimeFormat`, `Worker`, `SharedWorker`, and `RTCPeerConnection` are
 * installed as raw constructors/classes on the global — they do NOT go through
 * the `stripConstruct` scrub net that wraps ordinary method overrides. When the
 * page passes an argument that makes the *native* constructor throw (a `Symbol`
 * / `BigInt` that can't coerce, a TURN server with no credentials, an invalid
 * `timeZone`), the native `TypeError` / `RangeError` propagates back out through
 * the extension's own constructor frame — and that frame is
 * `chrome-extension://<id>/…/injected.js`, so a fingerprinter can read the id
 * straight off the thrown error's stack.
 *
 * A clean browser throws the identical error with a stack made only of native
 * frames plus the page's caller. So the portable signal is the same as the
 * toString battery: the thrown error's stack must contain no `*-extension://`
 * URL. Each test provokes the throw and fails when an extension id appears.
 *
 * `Intl.DateTimeFormat` is included as a positive control — its override already
 * scrubs the invalid-`timeZone` throw, so it should pass with the extension on,
 * demonstrating the fix pattern the others need.
 */

import type { TestDefinition, TestResult } from "../types"

const EXTENSION_URL_RE =
  /(?:chrome-extension|moz-extension|safari-web-extension):\/\/([a-z0-9-]+)/i

interface ThrowProbe {
  threw: boolean
  stack: string
  message: string
  leakedId: string | null
}

function provoke(fn: () => unknown): ThrowProbe {
  try {
    fn()
    return { threw: false, stack: "", message: "", leakedId: null }
  } catch (e) {
    const err = e as { stack?: unknown; message?: unknown }
    const stack = typeof err.stack === "string" ? err.stack : ""
    const message = typeof err.message === "string" ? err.message : String(e)
    const match = EXTENSION_URL_RE.exec(stack)
    return { threw: true, stack, message, leakedId: match ? match[1] : null }
  }
}

/**
 * Async twin of {@link provoke}. Awaits `fn()` so a Promise-returning override
 * that REJECTS (rather than throwing synchronously) is captured — the rejection
 * is exactly where `serviceWorker.register` leaks, because `stripConstruct`'s
 * synchronous try/catch never sees it.
 */
async function provokeAsync(fn: () => unknown): Promise<ThrowProbe> {
  try {
    await fn()
    return { threw: false, stack: "", message: "", leakedId: null }
  } catch (e) {
    const err = e as { stack?: unknown; message?: unknown }
    const stack = typeof err.stack === "string" ? err.stack : ""
    const message = typeof err.message === "string" ? err.message : String(e)
    const match = EXTENSION_URL_RE.exec(stack)
    return { threw: true, stack, message, leakedId: match ? match[1] : null }
  }
}

/**
 * Leak → fail; threw with a clean stack → pass; did not throw → skipped (the
 * throw path is where the leak lives, and whether a given engine/input throws
 * can vary, so a non-throw is "couldn't measure" rather than a failure).
 */
function resultFor(probe: ThrowProbe): TestResult {
  if (!probe.threw) {
    return {
      status: "skipped",
      expected: "constructor to throw so the stack can be inspected",
      actual: "constructor did not throw on this engine/input",
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

const constructorStackLeakBattery: ReadonlyArray<TestDefinition> = [
  {
    id: "extension-presence.ctor-leak.date-symbol",
    group: "extension-presence",
    name: "new Date(Symbol()) does not leak the extension id",
    description:
      "The Date constructor override forwards to the native constructor. A Symbol argument can't coerce to a number, so the native TypeError propagates through the override's frame — which lives in the injected script.",
    technique:
      "new Date(Symbol()) and scan the thrown TypeError's stack for a chrome-extension:// (or moz-/safari-web-) URL.",
    codeSnippet: `try { new Date(Symbol()) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => resultFor(provoke(() => new Date(Symbol() as unknown as number))),
  },
  {
    id: "extension-presence.ctor-leak.date-bigint",
    group: "extension-presence",
    name: "new Date(BigInt) does not leak the extension id",
    description:
      "A BigInt argument can't coerce to a number either; the native TypeError must not carry the extension id.",
    technique: "new Date(1n) and scan the thrown stack for an extension:// URL.",
    codeSnippet: `try { new Date(1n) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> =>
      resultFor(provoke(() => new Date(BigInt(1) as unknown as number))),
  },
  {
    id: "extension-presence.ctor-leak.date-multiarg-symbol",
    group: "extension-presence",
    name: "new Date(Symbol(), 1) does not leak the extension id",
    description:
      "The multi-argument Date path also coerces its arguments; a Symbol year throws through the override's fallback construct.",
    technique: "new Date(Symbol(), 1) and scan the thrown stack for an extension:// URL.",
    codeSnippet: `try { new Date(Symbol(), 1) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> =>
      resultFor(provoke(() => new Date(Symbol() as unknown as number, 1))),
  },
  {
    id: "extension-presence.ctor-leak.date-parse-symbol",
    group: "extension-presence",
    name: "Date.parse(Symbol()) does not leak the extension id",
    description:
      "Date.parse is overridden as a raw static method. A Symbol argument can't coerce to a string, so the native TypeError propagates through the override frame.",
    technique: "Date.parse(Symbol()) and scan the thrown stack for an extension:// URL.",
    codeSnippet: `try { Date.parse(Symbol()) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> =>
      resultFor(provoke(() => Date.parse(Symbol() as unknown as string))),
  },
  {
    id: "extension-presence.ctor-leak.worker-symbol",
    group: "extension-presence",
    name: "new Worker(Symbol()) does not leak the extension id",
    description:
      "The Worker constructor override coerces the scriptURL with String(); a Symbol throws inside the override before delegating, exposing its injected frame.",
    technique: "new Worker(Symbol()) and scan the thrown stack for an extension:// URL.",
    codeSnippet: `try { new Worker(Symbol()) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof Worker === "undefined") {
        return { status: "skipped", expected: "Worker to be present", actual: "Worker unavailable" }
      }
      return resultFor(provoke(() => new Worker(Symbol() as unknown as string)))
    },
  },
  {
    id: "extension-presence.ctor-leak.shared-worker-symbol",
    group: "extension-presence",
    name: "new SharedWorker(Symbol()) does not leak the extension id",
    description:
      "Same coercion path as Worker: String(scriptURL) on a Symbol throws inside the SharedWorker override frame.",
    technique: "new SharedWorker(Symbol()) and scan the thrown stack for an extension:// URL.",
    codeSnippet: `try { new SharedWorker(Symbol()) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof SharedWorker === "undefined") {
        return {
          status: "skipped",
          expected: "SharedWorker to be present",
          actual: "SharedWorker unavailable",
        }
      }
      return resultFor(provoke(() => new SharedWorker(Symbol() as unknown as string)))
    },
  },
  {
    id: "extension-presence.ctor-leak.rtcpeerconnection",
    group: "extension-presence",
    name: "new RTCPeerConnection(invalid) does not leak the extension id",
    description:
      "The RTCPeerConnection override is a subclass; an invalid enum value in the config fails the native WebIDL enum conversion and throws synchronously from super() through the subclass frame in the injected script. (Chrome tolerates many bad configs — an invalid enum is the reliable throw.)",
    technique:
      'new RTCPeerConnection({ rtcpMuxPolicy: "bogus" }) and scan the thrown TypeError\'s stack for an extension:// URL.',
    codeSnippet: `try { new RTCPeerConnection({ rtcpMuxPolicy: "bogus" }) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> => {
      if (typeof RTCPeerConnection === "undefined") {
        return {
          status: "skipped",
          expected: "RTCPeerConnection to be present",
          actual: "RTCPeerConnection unavailable",
        }
      }
      // An invalid enum value reliably throws during WebIDL enum coercion in the
      // native constructor — exercising the super() throw path. Chrome tolerates
      // many malformed configs (bad URLs, non-object args) without throwing, so
      // those would silently skip; an invalid enum is the dependable trigger.
      return resultFor(
        provoke(
          () =>
            new RTCPeerConnection({
              rtcpMuxPolicy: "bogus",
            } as unknown as RTCConfiguration)
        )
      )
    },
  },
  {
    id: "extension-presence.ctor-leak.service-worker-register",
    group: "extension-presence",
    name: "serviceWorker.register foreign-this rejection does not leak the id",
    description:
      "register is a Promise-returning WebIDL op: a foreign `this` REJECTS rather than throwing synchronously, so the synchronous stripConstruct scrub never sees it. The rejected error's stack must not carry the extension id.",
    technique:
      "await navigator.serviceWorker.register.call({}, '/x') and scan the rejected error's stack for an extension:// URL.",
    codeSnippet: `try { await navigator.serviceWorker.register.call({}, "/x") }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
    run: async (): Promise<TestResult> => {
      if (typeof navigator === "undefined" || !navigator.serviceWorker) {
        return {
          status: "skipped",
          expected: "navigator.serviceWorker to be present",
          actual: "navigator.serviceWorker unavailable",
        }
      }
      // Foreign `this` ({}) fails the brand check before any fetch, so this only
      // ever rejects — it never registers a real service worker.
      const register = navigator.serviceWorker.register as (
        this: unknown,
        url: string
      ) => Promise<unknown>
      return resultFor(await provokeAsync(() => register.call({}, "/geospoof-detection-probe.js")))
    },
  },
  {
    id: "extension-presence.ctor-leak.datetimeformat-control",
    group: "extension-presence",
    name: "new Intl.DateTimeFormat(invalid timeZone) does not leak the id (control)",
    description:
      "Positive control: the DateTimeFormat override already scrubs its invalid-timeZone throw. This should pass with the extension on, demonstrating the fix pattern the other constructors need.",
    technique:
      "new Intl.DateTimeFormat('en', { timeZone: 'Invalid/Zone' }) and scan the thrown RangeError's stack for an extension:// URL.",
    codeSnippet: `try { new Intl.DateTimeFormat("en", { timeZone: "Invalid/Zone" }) }
catch (e) { /* e.stack must contain no extension:// URL */ }`,
     
    run: async (): Promise<TestResult> =>
      resultFor(provoke(() => new Intl.DateTimeFormat("en", { timeZone: "Invalid/Zone" }))),
  },
]

export const constructorStackLeakTests: ReadonlyArray<TestDefinition> =
  constructorStackLeakBattery
