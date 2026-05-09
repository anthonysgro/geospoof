/**
 * Web Worker timezone leaks — documented known limitations.
 *
 * A browser extension's content script cannot inject code into Web
 * Worker / SharedWorker / ServiceWorker contexts. That means any code
 * running inside a Worker sees the real system timezone via `Date` and
 * `Intl.DateTimeFormat`, bypassing everything this extension does on
 * the main thread. This is not a bug in GeoSpoof — it's a fundamental
 * limitation of the content-script extension model, and the only way
 * to close it would be browser-level changes (or a compiled browser
 * extension with Worker-injection privileges, which no public extension
 * API currently provides).
 *
 * These tests exist to make the limitation observable rather than just
 * documented: a user who runs the test suite can see for themselves
 * what a page using Workers to probe the environment would reveal. Both
 * tests are tagged `group: "known-limitations"` so they surface under
 * the collapsible "Known limitations" block and don't register as
 * regressions.
 *
 * Why compare Worker-reported values to the Identity snapshot at all,
 * if we expect a mismatch? The snapshot reflects the spoofed
 * (post-override) view, which is what ran in the main thread. The
 * Worker reports the pre-override view. A mismatch is the leak we're
 * demonstrating. In the unusual case where the spoofed zone happens to
 * equal the real system zone (user spoofing to their own location),
 * the values agree and the test skips with a reason — there's no leak
 * to demonstrate.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

const WORKER_TIMEOUT_MS = 3_000

interface WorkerResult {
  timeZone: string
  offsetMinutes: number
}

/**
 * Spin up a blob-URL Web Worker, ask it to report its view of
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and
 * `new Date().getTimezoneOffset()`, and resolve with the result. The
 * worker is terminated in the finally block so an aborted test never
 * leaks a Worker.
 *
 * Rejects on timeout, on an error message from the Worker, or when the
 * runtime doesn't support Workers or Blob URLs at all — the behavioral
 * helper converts those rejections into an `error` TestResult.
 */
async function readTimezoneFromWorker(): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new Error("Worker API not available")
  }
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    !URL.createObjectURL
  ) {
    throw new Error("Blob URL API not available")
  }

  // The worker body is intentionally minimal — any failure here is
  // reported back over postMessage so the parent can render a clean
  // test result rather than having to parse an opaque Worker error.
  const source = `
    self.onmessage = () => {
      try {
        const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
        const offsetMinutes = new Date().getTimezoneOffset();
        self.postMessage({ ok: true, timeZone, offsetMinutes });
      } catch (err) {
        self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    };
  `
  const blob = new Blob([source], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)

  try {
    return await new Promise<WorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`worker did not respond within ${WORKER_TIMEOUT_MS}ms`)
        )
      }, WORKER_TIMEOUT_MS)

      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer)
        const data = event.data as
          | { ok: true; timeZone: string; offsetMinutes: number }
          | { ok: false; error: string }
        if (data && typeof data === "object" && "ok" in data) {
          if (data.ok) {
            resolve({
              timeZone: data.timeZone,
              offsetMinutes: data.offsetMinutes,
            })
          } else {
            reject(new Error(`worker reported error: ${data.error}`))
          }
        } else {
          reject(new Error("worker returned an unexpected message shape"))
        }
      }
      worker.onerror = (event) => {
        clearTimeout(timer)
        const message =
          typeof event === "object" && event && "message" in event
            ? String(event.message)
            : "worker error"
        reject(new Error(message))
      }
      worker.postMessage({ start: true })
    })
  } finally {
    try {
      worker.terminate()
    } catch {
      // cleanup must never mask the primary result/error
    }
    try {
      URL.revokeObjectURL(url)
    } catch {
      // same
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const workerTimezoneIdentifierLeakTest = buildBehavioralTest<string>({
  id: "known-limitation.worker.timezone-identifier-leak",
  group: "known-limitations",
  name: "Web Worker reports the spoofed Intl timezone",
  description:
    "A Web Worker's `Intl.DateTimeFormat().resolvedOptions().timeZone` SHOULD equal the spoofed identifier, but content-script extensions cannot inject into Worker contexts. This test demonstrates the documented limitation: a page running privacy-relevant code inside a Worker sees the real system timezone. Closing this would require browser-level changes — no public WebExtension API provides Worker-injection access today.",
  technique:
    "Spin up a blob-URL Web Worker, have it read its own Intl timezone via postMessage, compare to the Identity Panel's spoofed identifier.",
  codeSnippet: `const worker = new Worker(URL.createObjectURL(new Blob([
  \`self.onmessage = () => self.postMessage(
     new Intl.DateTimeFormat().resolvedOptions().timeZone,
   )\`,
], { type: "application/javascript" })))
worker.postMessage(null)
// worker.onmessage.data should equal identity.timezone.identifier`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    let identifier: string
    try {
      identifier = new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
    } catch {
      identifier = ""
    }
    if (!identifier) {
      return { skipReason: "Intl did not resolve a timezone identifier" }
    }
    return { value: identifier, describe: `"${identifier}"` }
  },
  observe: async () => {
    const result = await readTimezoneFromWorker()
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (reported from Worker context)`,
    }
  },
})

const workerGetTimezoneOffsetLeakTest = buildBehavioralTest<number>({
  id: "known-limitation.worker.get-timezone-offset-leak",
  group: "known-limitations",
  name: "Web Worker reports the spoofed Date.getTimezoneOffset",
  description:
    "A Web Worker's `new Date().getTimezoneOffset()` SHOULD match the top-level getTimezoneOffset, but the same Worker-injection limitation applies — the Worker sees the real system offset. Offsets are expressed in minutes west of UTC (the native convention); a mismatch here is the leak this test demonstrates.",
  technique:
    "Spin up a blob-URL Web Worker, have it read `new Date().getTimezoneOffset()` via postMessage, compare to the top-level `new Date().getTimezoneOffset()`.",
  codeSnippet: `const worker = new Worker(URL.createObjectURL(new Blob([
  \`self.onmessage = () => self.postMessage(
     new Date().getTimezoneOffset(),
   )\`,
], { type: "application/javascript" })))
worker.postMessage(null)
// worker.onmessage.data should equal new Date().getTimezoneOffset()`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    // Read the top-level offset at test-run time so it reflects the
    // post-settlement world the Worker's value will be compared against.
    const value = new Date().getTimezoneOffset()
    return {
      value,
      describe: `${value} minutes (from top-level Date.getTimezoneOffset)`,
    }
  },
  observe: async () => {
    const result = await readTimezoneFromWorker()
    return {
      value: result.offsetMinutes,
      describe: `${result.offsetMinutes} minutes (reported from Worker context)`,
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const workerLeakTests: ReadonlyArray<TestDefinition> = [
  workerTimezoneIdentifierLeakTest,
  workerGetTimezoneOffsetLeakTest,
]
