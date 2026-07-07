/**
 * Detection battery for extension-id leaks through *page callbacks* invoked
 * from our async contexts.
 *
 * In default spoof mode, `getCurrentPosition` delivers the position by calling
 * the page's success callback from inside our own `setTimeout` (and the cache
 * path from a `queueMicrotask`). If the page's callback throws, that error goes
 * UNCAUGHT to `window.onerror` — and because we were the caller, its stack
 * carries our `chrome-extension://…/injected.js` frame, which a native browser
 * never produces there (native dispatches callbacks from C++, leaving no JS
 * frame). A fingerprinter can register `window.onerror`, call
 * `getCurrentPosition` with a throwing callback, and read the id off the stack.
 *
 * The fix scrubs our frames from the callback's thrown error before it reaches
 * `window.onerror`. This test provokes exactly that flow and fails if an
 * extension id survives in the reported stack.
 *
 * Only exercises the spoof path — when spoofing is off, `getCurrentPosition`
 * delegates to the native API (no callback throw surfaces our frame), so no
 * error event fires and the test reports `skipped` rather than a false pass.
 */

import type { TestDefinition, TestResult } from "../types"

const EXTENSION_URL_RE =
  /(?:chrome-extension|moz-extension|safari-web-extension):\/\/([a-z0-9-]+)/i

// Unique marker so we only react to OUR probe error, never unrelated page errors.
const MARKER = "geospoof-callback-leak-probe"

export const callbackStackLeakTests: ReadonlyArray<TestDefinition> = [
  {
    id: "extension-presence.callback-leak.get-current-position",
    group: "extension-presence",
    name: "Throwing getCurrentPosition callback does not leak the id via window.onerror",
    description:
      "The spoofed position is delivered by calling the page's success callback from our setTimeout. If that callback throws, the uncaught error reaching window.onerror must not carry our injected-script frame.",
    technique:
      "Register window.onerror, call getCurrentPosition with a callback that throws, and scan the reported error's stack for an extension:// URL.",
    codeSnippet: `addEventListener("error", (ev) => { /* ev.error.stack must contain no extension:// URL */ })
navigator.geolocation.getCurrentPosition(() => { throw new Error("x") })`,
    run: async (ctx): Promise<TestResult> => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return {
          status: "skipped",
          expected: "navigator.geolocation to be present",
          actual: "navigator.geolocation unavailable",
        }
      }

      return await new Promise<TestResult>((resolve) => {
        let settled = false
        const onError = (ev: ErrorEvent): void => {
          const stack =
            ev.error && typeof (ev.error as { stack?: unknown }).stack === "string"
              ? (ev.error as { stack: string }).stack
              : ""
          // Only our probe — ignore any other page error.
          if (!(stack.includes(MARKER) || ev.message.includes(MARKER))) return
          ev.preventDefault()
          // Check BOTH channels window.onerror exposes: the error's own stack AND
          // the ErrorEvent.filename (the location the error escaped from). A
          // catch-and-rethrow fix scrubs the stack but moves filename onto our
          // rethrow line — so a stack-only check would miss that leak.
          const filename = typeof ev.filename === "string" ? ev.filename : ""
          const stackMatch = EXTENSION_URL_RE.exec(stack)
          const fileMatch = EXTENSION_URL_RE.exec(filename)
          const leakedId = stackMatch?.[1] ?? fileMatch?.[1] ?? null
          finish(
            leakedId
              ? {
                  status: "fail",
                  expected: "no extension:// URL in the callback error's stack or ErrorEvent.filename",
                  actual: `window.onerror leaks extension id "${leakedId}" (${
                    stackMatch ? "stack" : "filename"
                  })`,
                  details: { stack, filename, lineno: ev.lineno, colno: ev.colno },
                }
              : {
                  status: "pass",
                  expected: "no extension:// URL in the callback error's stack or ErrorEvent.filename",
                  actual: "window.onerror reports only native/page frames in both channels",
                  details: { stack, filename },
                }
          )
        }
        const timer = setTimeout(() => {
          finish({
            status: "skipped",
            expected: "the thrown callback to surface via window.onerror",
            actual:
              "no error event within timeout — spoofing likely off (native path) or callback not invoked",
          })
        }, 2500)
        const onAbort = (): void =>
          finish({
            status: "skipped",
            expected: "test to complete",
            actual: "aborted",
          })
        function finish(r: TestResult): void {
          if (settled) return
          settled = true
          clearTimeout(timer)
          window.removeEventListener("error", onError)
          ctx?.signal.removeEventListener("abort", onAbort)
          resolve(r)
        }

        window.addEventListener("error", onError)
        ctx?.signal.addEventListener("abort", onAbort)

        try {
          navigator.geolocation.getCurrentPosition(
            () => {
              throw new Error(MARKER)
            },
            () => {
              // A real-API error (spoofing off / denied) means we never hit the
              // spoof callback path — let the timeout report skipped.
            }
          )
        } catch {
          // getCurrentPosition shouldn't throw synchronously; ignore if it does.
        }
      })
    },
  },
]
