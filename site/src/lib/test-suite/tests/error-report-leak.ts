/**
 * Detection battery for the UNCAUGHT-path extension-id leak via the
 * error-reporting pipeline.
 *
 * When a throw from one of our overrides goes uncaught, the browser reports it
 * through `window.onerror` (positional `source` argument) and the `error` event
 * (`ErrorEvent.filename`). Both are derived by the engine from the throw site —
 * `chrome-extension://<id>/…/injected.js` — and neither is the `.stack` string,
 * so the per-site stack scrubs can't reach them. The error-report sanitizer
 * suppresses the id-bearing original and re-emits a sanitized twin.
 *
 * These tests provoke an uncaught throw from a representative sync scrub site
 * and assert that NEITHER channel names our injected script. Only meaningful
 * with the extension active; on a clean browser the native throw reports the
 * page's own frame, so the tests pass there too.
 */

import type { TestDefinition, TestResult } from "../types"

const EXTENSION_URL_RE =
  /(?:chrome-extension|moz-extension|safari-web-extension):\/\/([a-z0-9-]+)/i

/**
 * Provoke `trigger()` in a fresh task (so it's uncaught) and capture how both
 * `window.onerror` and `addEventListener('error')` report it, correlating by a
 * message match so unrelated page errors are ignored. Fails if either channel
 * exposes an extension id.
 */
function probeUncaught(
  trigger: () => void,
  messageMatch: RegExp,
  ctx?: { signal: AbortSignal }
): Promise<TestResult> {
  return new Promise<TestResult>((resolve) => {
    let settled = false
    let onerrorSource: string | null = null
    let listenerFilename: string | null = null
    const prevOnerror = window.onerror

    const conclude = (fromTimeout: boolean): void => {
      if (settled) return
      // Wait for both channels unless the timeout forces a decision.
      if (!fromTimeout && (onerrorSource === null || listenerFilename === null)) return
      if (onerrorSource === null && listenerFilename === null) {
        finish({
          status: "skipped",
          expected: "the uncaught throw to surface via window.onerror / error event",
          actual: "no matching error captured (spoofing off, or not triggered)",
        })
        return
      }
      const s = onerrorSource ? EXTENSION_URL_RE.exec(onerrorSource) : null
      const f = listenerFilename ? EXTENSION_URL_RE.exec(listenerFilename) : null
      const leakedId = s?.[1] ?? f?.[1] ?? null
      finish(
        leakedId
          ? {
              status: "fail",
              expected:
                "no extension:// URL in window.onerror source or ErrorEvent.filename",
              actual: `leaks extension id "${leakedId}" via ${s ? "window.onerror source" : "ErrorEvent.filename"}`,
              details: { onerrorSource, listenerFilename },
            }
          : {
              status: "pass",
              expected:
                "no extension:// URL in window.onerror source or ErrorEvent.filename",
              actual: "both channels report only native/page locations",
              details: { onerrorSource, listenerFilename },
            }
      )
    }

    const listener = (ev: ErrorEvent): void => {
      if (!messageMatch.test(ev.message || "")) return
      listenerFilename = typeof ev.filename === "string" ? ev.filename : ""
      conclude(false)
    }
    const onErrorHandler = function (this: unknown, msg: unknown, src?: unknown): boolean {
      if (typeof msg === "string" && messageMatch.test(msg)) {
        onerrorSource = typeof src === "string" ? src : ""
        conclude(false)
      }
      return true // suppress default console logging of the probe error
    }
    const onAbort = (): void =>
      finish({ status: "skipped", expected: "test to complete", actual: "aborted" })

    function finish(r: TestResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener("error", listener, true)
      window.onerror = prevOnerror
      ctx?.signal.removeEventListener("abort", onAbort)
      resolve(r)
    }

    window.addEventListener("error", listener, true)
    window.onerror = onErrorHandler
    ctx?.signal.addEventListener("abort", onAbort)
    const timer = setTimeout(() => conclude(true), 2500)
    setTimeout(trigger, 0)
  })
}

export const errorReportLeakTests: ReadonlyArray<TestDefinition> = [
  {
    id: "extension-presence.error-report.sync-method-uncaught",
    group: "extension-presence",
    name: "Uncaught override throw does not leak the id via window.onerror / filename",
    description:
      "When an override throw goes uncaught, window.onerror's `source` and the error event's `filename` are derived from the throw site (injected.js) — a channel the .stack scrubs can't reach. The error-report sanitizer must scrub both.",
    technique:
      "Trigger Date.prototype.getTimezoneOffset.call({}) uncaught; capture window.onerror source and ErrorEvent.filename; scan both for an extension:// URL.",
    codeSnippet: `window.onerror = (m, source) => { /* source must contain no extension:// URL */ }
addEventListener("error", (ev) => { /* ev.filename must contain no extension:// URL */ })
setTimeout(() => Date.prototype.getTimezoneOffset.call({}), 0)`,
    run: async (ctx): Promise<TestResult> =>
      probeUncaught(
        () => {
          // Foreign-`this` brand check throws synchronously from our override.
          ;(Date.prototype.getTimezoneOffset as (this: unknown) => number).call({})
        },
        /not a Date|Date\.prototype|Illegal invocation/i,
        ctx
      ),
  },
  {
    id: "extension-presence.error-report.ctor-uncaught",
    group: "extension-presence",
    name: "Uncaught constructor throw does not leak the id via window.onerror / filename",
    description:
      "Same uncaught-path channels for a raw constructor override (Date). new Date(Symbol()) throws from our DateOverride frame; onerror source / filename must not name injected.js.",
    technique:
      "Trigger new Date(Symbol()) uncaught; capture window.onerror source and ErrorEvent.filename; scan both for an extension:// URL.",
    codeSnippet: `setTimeout(() => new Date(Symbol()), 0)`,
    run: async (ctx): Promise<TestResult> =>
      probeUncaught(
        () => {
          void new Date(Symbol() as unknown as number)
        },
        /Symbol|Cannot convert/i,
        ctx
      ),
  },
]
