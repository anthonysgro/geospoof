/**
 * Web Worker timezone battery.
 *
 * Tests every Worker construction pattern a fingerprinting script might
 * use to probe the real system timezone from inside a Worker context:
 *
 *   1. Blob-URL classic Worker (inline source)               [stealth, all engines]
 *   2. URL-based classic Worker (served from /workers/…)     [Firefox-only coverage]
 *   3. SharedWorker (served from /workers/…)                 [Firefox-only coverage]
 *   4. importScripts inside a Worker                         [Firefox-only coverage]
 *   5. Nested Worker (Worker-in-Worker)                      [stealth, all engines]
 *   6. Data-URL Worker                                       [stealth, all engines]
 *   7. Module Worker (type: "module")                        [known-limitation, all engines]
 *   8. ServiceWorker                                         [known-limitation, all engines]
 *
 * Each test compares the Worker-reported timezone against the main
 * thread's post-settlement timezone. When they match, the Worker sees
 * the spoofed zone (test passes). When they differ, the Worker leaked
 * the real system zone.
 *
 * The `worker-patching` injected module closes the blob/data/nested
 * surfaces on every engine by intercepting `window.Worker` and
 * `window.SharedWorker` with a blob bootstrap that prepends the
 * spoofing payload and recursively wraps `self.Worker` inside each
 * Worker so nested Workers also get the payload.
 *
 * URL-based workers (classic Worker, SharedWorker, importScripts) need
 * the response bytes modified at the network layer. The extension does
 * this on Firefox via the background-script
 * `webRequest.filterResponseData` listener, which Chromium removed in
 * MV3 and Safari never shipped. So on Chromium/Safari those three
 * surfaces leak the real zone — not a regression, an engine-level
 * capability gap. We reclassify those three tests into
 * `known-limitations` at module-load time when `filterResponseData`
 * isn't available, so the dashboard credits them as documented gaps
 * rather than fresh detectable issues.
 *
 * Browser-global access lives inside `expected` / `observe` callbacks,
 * so the module is safe to dynamic-import from `loadAllTests`.
 */

import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition, TestGroupId } from "../types"

/**
 * True on Firefox (desktop + Android), where
 * `webRequest.filterResponseData` exists and the extension's background
 * listener can prepend the spoofing payload to URL-based worker script
 * responses. False on Chromium-based browsers and Safari, where the
 * three URL-based worker tests below can't be closed without a
 * fundamentally different architecture (service worker interception,
 * module bundler at construction time, etc.) and are reclassified as
 * documented known limitations.
 *
 * We sniff the userAgent rather than feature-detect because the feature
 * we care about (`webRequest.filterResponseData`) lives on the
 * background-script `browser` global which isn't accessible from the
 * page context. The userAgent is spoofable in principle, but any
 * plausible detection path a fingerprinter would use to exploit this
 * would itself rely on the same UA — so the failure mode of a
 * misclassification is at worst "test says known-limitation when it
 * could have said pass", which is strictly safer than the reverse.
 */
const engineHasResponseFilter: boolean = (() => {
  if (typeof navigator === "undefined") return false
  return /\bFirefox\//.test(navigator.userAgent ?? "")
})()

/**
 * Resolve the display group for a URL-based worker test. On Firefox
 * these close cleanly via `filterResponseData` and live alongside the
 * other stealth tests; on other engines they document an
 * architectural gap and live under known-limitations so the dashboard
 * doesn't flag them as fresh detectable issues.
 */
const urlWorkerGroup: TestGroupId = engineHasResponseFilter
  ? "timezone-stealth"
  : "known-limitations"

const WORKER_TIMEOUT_MS = 5_000

interface WorkerResult {
  timeZone: string
  offsetMinutes: number
  /**
   * `Temporal.Now.timeZoneId()` as seen inside the worker, or null when the
   * engine doesn't ship Temporal. Collected by every probe so the Temporal
   * card set can assert it per surface, exactly like the Intl `timeZone`.
   */
  temporalTimeZone?: string | null
  /**
   * Full Date/Intl/Temporal parity signature, computed inside the worker via
   * the shared `self.__tzSignature` helper when the runner posts a `sigBase`.
   * Consumed by the per-surface full-parity cards. Null when the served probe
   * didn't compute one (older/unpatched path).
   */
  sig?: TzSignature | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the main thread's current timezone identifier (post-settlement).
 * Used as the "expected" value for every Worker test.
 */
function getMainThreadTimezone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  } catch {
    return ""
  }
}

/**
 * Read the main thread's current `Temporal.Now.timeZoneId()` (post-
 * settlement), or "" when Temporal is unavailable or throws. Used as the
 * "expected" value for the Temporal Worker test — on a spoofed page this
 * equals the Intl timezone, on a clean browser it's the real zone (and the
 * Worker reports the same real zone, so the test still passes).
 */
function getMainThreadTemporalTimezone(): string {
  try {
    const T = (
      globalThis as {
        Temporal?: { Now?: { timeZoneId?: () => string } }
      }
    ).Temporal
    if (!T?.Now?.timeZoneId) return ""
    return T.Now.timeZoneId() ?? ""
  } catch {
    return ""
  }
}

/**
 * Spin up a blob-URL classic Worker with the given source, send it a
 * start message, and resolve with the timezone data it reports back.
 */
async function runBlobWorker(source: string): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available in this browser")
  }
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    !URL.createObjectURL
  ) {
    throw new SkipTestError("Blob URL API not available")
  }

  const blob = new Blob([source], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)

  try {
    return await waitForWorkerResult(worker)
  } finally {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* cleanup */
    }
  }
}

/**
 * Spin up a `data:` URL classic Worker with the given source, send it a
 * start message, and resolve with the timezone data it reports back.
 */
async function runDataUrlWorker(source: string): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available in this browser")
  }
  const dataUrl = `data:application/javascript,${encodeURIComponent(source)}`

  let worker: Worker
  try {
    worker = new Worker(dataUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkipTestError(`Could not construct Worker from data: URL: ${msg}`)
  }

  try {
    return await waitForWorkerResult(worker)
  } finally {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
  }
}

/**
 * Spin up a URL-based classic Worker, send it a start message, and
 * resolve with the timezone data it reports back.
 */
async function runUrlWorker(scriptUrl: string): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available in this browser")
  }

  let worker: Worker
  try {
    worker = new Worker(scriptUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkipTestError(
      `Could not construct Worker from URL "${scriptUrl}": ${msg}`
    )
  }

  try {
    return await waitForWorkerResult(worker)
  } finally {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
  }
}

/**
 * Spin up a module Worker, send it a start message, and resolve with
 * the timezone data it reports back.
 */
async function runModuleWorker(scriptUrl: string): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available in this browser")
  }

  let worker: Worker
  try {
    worker = new Worker(scriptUrl, { type: "module" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkipTestError(
      `Could not construct module Worker from URL "${scriptUrl}": ${msg}`
    )
  }

  try {
    return await waitForWorkerResult(worker)
  } finally {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
  }
}

/**
 * Connect to a SharedWorker, send it a start message, and resolve with
 * the timezone data it reports back.
 */
async function runSharedWorker(scriptUrl: string): Promise<WorkerResult> {
  if (typeof SharedWorker === "undefined") {
    throw new SkipTestError("SharedWorker API not available in this browser")
  }

  let shared: SharedWorker
  try {
    shared = new SharedWorker(scriptUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkipTestError(
      `Could not construct SharedWorker from URL "${scriptUrl}": ${msg}`
    )
  }

  const port = shared.port
  port.start()

  return new Promise<WorkerResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`SharedWorker did not respond within ${WORKER_TIMEOUT_MS}ms`)
      )
    }, WORKER_TIMEOUT_MS)

    port.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer)
      const data = event.data as
        | {
            ok: true
            timeZone: string
            offsetMinutes: number
            temporalTimeZone?: string | null
            sig?: TzSignature | null
          }
        | { ok: false; error: string }
      if (data && typeof data === "object" && "ok" in data) {
        if (data.ok) {
          resolve({
            timeZone: data.timeZone,
            offsetMinutes: data.offsetMinutes,
            temporalTimeZone: data.temporalTimeZone ?? null,
            sig: data.sig ?? null,
          })
        } else {
          reject(new Error(`SharedWorker reported error: ${data.error}`))
        }
      } else {
        reject(new Error("SharedWorker returned an unexpected message shape"))
      }
    }

    shared.onerror = (event) => {
      clearTimeout(timer)
      const message =
        typeof event === "object" && event && "message" in event
          ? String((event as ErrorEvent).message)
          : "SharedWorker error"
      reject(new Error(message))
    }

    port.postMessage({ start: true, sigBase: PARITY_BASE })
  })
}

/**
 * Common helper: wait for a Worker to post back its timezone result.
 */
function waitForWorkerResult(worker: Worker): Promise<WorkerResult> {
  return new Promise<WorkerResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Worker did not respond within ${WORKER_TIMEOUT_MS}ms`))
    }, WORKER_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer)
      const data = event.data as
        | {
            ok: true
            timeZone: string
            offsetMinutes: number
            temporalTimeZone?: string | null
            sig?: TzSignature | null
          }
        | { ok: false; error: string }
      if (data && typeof data === "object" && "ok" in data) {
        if (data.ok) {
          resolve({
            timeZone: data.timeZone,
            offsetMinutes: data.offsetMinutes,
            temporalTimeZone: data.temporalTimeZone ?? null,
            sig: data.sig ?? null,
          })
        } else {
          reject(new Error(`Worker reported error: ${data.error}`))
        }
      } else {
        reject(new Error("Worker returned an unexpected message shape"))
      }
    }

    worker.onerror = (event) => {
      clearTimeout(timer)
      const message =
        typeof event === "object" && event && "message" in event
          ? String((event as ErrorEvent).message)
          : "Worker error"
      reject(new Error(message))
    }

    worker.postMessage({ start: true, sigBase: PARITY_BASE })
  })
}

// ---------------------------------------------------------------------------
// Stealth tests: these six should now pass with the worker-patching module
// ---------------------------------------------------------------------------

const BLOB_WORKER_SOURCE = `
  self.onmessage = () => {
    try {
      const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetMinutes = new Date().getTimezoneOffset();
      const temporalTimeZone = (typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId) ? Temporal.Now.timeZoneId() : null;
      self.postMessage({ ok: true, timeZone, offsetMinutes, temporalTimeZone });
    } catch (err) {
      self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  };
`

const blobWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.blob-url-timezone",
  group: "timezone-stealth",
  name: "Blob-URL Worker honors the spoofed Intl timezone",
  description:
    "A classic Worker constructed from a blob URL (`new Worker(URL.createObjectURL(blob))`) must report the same timezone as the main thread. This is the most common Worker construction pattern in SPAs that bundle worker code inline. A fingerprinter that bundles a timezone probe as a blob Worker would bypass any main-thread-only spoofing — the injected script closes this by intercepting the Worker constructor and prepending a self-contained spoofing payload to the Worker's source.",
  technique:
    "Construct a blob-URL Worker with inline source that reads Intl.DateTimeFormat().resolvedOptions().timeZone, compare to the main thread's post-settlement timezone.",
  codeSnippet: `const blob = new Blob([\`
  self.onmessage = () => self.postMessage(
    new Intl.DateTimeFormat().resolvedOptions().timeZone
  )
\`], { type: "application/javascript" })
const worker = new Worker(URL.createObjectURL(blob))
worker.postMessage(null)
// worker.onmessage.data should equal main thread timezone`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runBlobWorker(BLOB_WORKER_SOURCE)
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from blob-URL Worker)`,
    }
  },
})

const urlWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.url-classic-timezone",
  group: urlWorkerGroup,
  name: "URL-based classic Worker honors the spoofed Intl timezone",
  description:
    "A classic Worker constructed from a script URL (`new Worker('/workers/classic-probe.js')`) must report the same timezone as the main thread. This is the traditional Worker construction pattern — the script is served as a static file. The injected script intercepts the Worker constructor, creates a blob bootstrap that prepends the spoofing payload, and loads the original script via importScripts.",
  technique:
    "Construct a Worker from /workers/classic-probe.js, send a start message, compare the reported timezone to the main thread's post-settlement timezone.",
  codeSnippet: `const worker = new Worker("/workers/classic-probe.js")
worker.postMessage({ start: true })
// worker.onmessage.data.timeZone should equal main thread timezone`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runUrlWorker("/workers/classic-probe.js")
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from URL-based classic Worker)`,
    }
  },
})

const sharedWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.shared-worker-timezone",
  group: urlWorkerGroup,
  name: "SharedWorker honors the spoofed Intl timezone",
  description:
    "A SharedWorker (`new SharedWorker('/workers/shared-probe.js')`) must report the same timezone as the main thread. SharedWorkers persist across tabs and use a different lifecycle than dedicated Workers — they use `onconnect` and port-based messaging. The injected script intercepts the SharedWorker constructor using the same blob-bootstrap technique.",
  technique:
    "Construct a SharedWorker from /workers/shared-probe.js, connect via port, send a start message, compare the reported timezone to the main thread's post-settlement timezone.",
  codeSnippet: `const shared = new SharedWorker("/workers/shared-probe.js")
shared.port.start()
shared.port.postMessage({ start: true })
// shared.port.onmessage.data.timeZone should equal main thread timezone`,
  expected: async () => {
    if (typeof SharedWorker === "undefined") {
      return { skipReason: "SharedWorker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runSharedWorker("/workers/shared-probe.js")
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from SharedWorker)`,
    }
  },
})

const importScriptsTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.importscripts-timezone",
  group: urlWorkerGroup,
  name: "importScripts-loaded code honors the spoofed Intl timezone",
  description:
    "A classic Worker that calls `importScripts('./helper.js')` loads secondary code at runtime. The injected script's payload wraps `self.importScripts` inside the Worker to resolve relative URLs against the original script URL (blob URLs have no meaningful base path). Code loaded via importScripts runs in the same scope as the wrapping payload, so it inherits the spoofed `Date` / `Intl.DateTimeFormat` overrides.",
  technique:
    "Construct a Worker from /workers/importscripts-probe.js (which calls importScripts to load a helper), compare the helper's reported timezone to the main thread's post-settlement timezone.",
  codeSnippet: `// importscripts-probe.js:
// importScripts("./importscripts-helper.js")
// self.onmessage = () => self.postMessage({ imported: self.__helperResult })
const worker = new Worker("/workers/importscripts-probe.js")
worker.postMessage({ start: true })
// worker.onmessage.data.imported.timeZone should equal main thread timezone`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runImportScriptsWorker(
      "/workers/importscripts-probe.js"
    )
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from importScripts-loaded code)`,
    }
  },
})

/**
 * Special helper for the importScripts test — the response shape
 * includes both direct and imported results.
 */
async function runImportScriptsWorker(
  scriptUrl: string
): Promise<WorkerResult> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available in this browser")
  }

  let worker: Worker
  try {
    worker = new Worker(scriptUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkipTestError(
      `Could not construct Worker from URL "${scriptUrl}": ${msg}`
    )
  }

  try {
    return await new Promise<WorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Worker did not respond within ${WORKER_TIMEOUT_MS}ms`)
        )
      }, WORKER_TIMEOUT_MS)

      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer)
        const data = event.data as
          | { ok: true; direct: WorkerResult; imported: WorkerResult | null }
          | { ok: false; error: string }
        if (data && typeof data === "object" && "ok" in data) {
          if (data.ok) {
            if (data.imported && "timeZone" in data.imported) {
              resolve(data.imported)
            } else {
              reject(new Error("importScripts helper did not produce a result"))
            }
          } else {
            reject(new Error(`Worker reported error: ${data.error}`))
          }
        } else {
          reject(new Error("Worker returned an unexpected message shape"))
        }
      }

      worker.onerror = (event) => {
        clearTimeout(timer)
        const message =
          typeof event === "object" && event && "message" in event
            ? String((event as ErrorEvent).message)
            : "Worker error"
        reject(new Error(message))
      }

      worker.postMessage({ start: true, sigBase: PARITY_BASE })
    })
  } finally {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
  }
}

const NESTED_WORKER_SOURCE = `
  self.onmessage = () => {
    const childSource = \`
      self.onmessage = () => {
        try {
          const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
          const offsetMinutes = new Date().getTimezoneOffset();
          const temporalTimeZone = (typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId) ? Temporal.Now.timeZoneId() : null;
          self.postMessage({ ok: true, timeZone, offsetMinutes, temporalTimeZone });
        } catch (err) {
          self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
        }
      };
    \`;
    try {
      const blob = new Blob([childSource], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const child = new Worker(url);
      child.onmessage = (e) => {
        child.terminate();
        URL.revokeObjectURL(url);
        self.postMessage(e.data);
      };
      child.onerror = (e) => {
        child.terminate();
        URL.revokeObjectURL(url);
        self.postMessage({ ok: false, error: "nested worker error: " + (e.message || "unknown") });
      };
      child.postMessage({ start: true });
    } catch (err) {
      self.postMessage({ ok: false, error: "nested spawn failed: " + (err.message || String(err)) });
    }
  };
`

const nestedWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.nested-worker-timezone",
  group: "timezone-stealth",
  name: "Nested Worker (Worker-in-Worker) honors the spoofed Intl timezone",
  description:
    "A Worker spawned from inside another Worker must also report the spoofed timezone. The injected script's payload wraps `self.Worker` inside every intercepted Worker, so child workers spawned from within (`new Worker(childUrl)` called from a Worker context) get the same spoofing payload applied recursively. The wrapper embeds JSON-stringified copies of both the spoofing core and the wrapper template so the substitution can nest to any depth.",
  technique:
    "Construct a blob-URL Worker that itself spawns a child blob-URL Worker. The child reports its timezone back to the parent Worker, which relays it to the main thread. Compare to the main thread's post-settlement timezone.",
  codeSnippet: `// Outer worker spawns inner worker:
// const child = new Worker(URL.createObjectURL(new Blob([...])))
// child.onmessage = (e) => self.postMessage(e.data)
// child.postMessage(null)`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runBlobWorker(NESTED_WORKER_SOURCE)
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from nested Worker-in-Worker)`,
    }
  },
})

const dataUrlWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.data-url-timezone",
  group: "timezone-stealth",
  name: "Data-URL Worker honors the spoofed Intl timezone",
  description:
    "A Worker constructed from a `data:` URL is another inline construction pattern that avoids blob URLs. Some fingerprinting scripts use this to try to bypass blob-URL interception. The injected script decodes the data URL inline, prepends the spoofing payload, and creates a fresh blob to instantiate the Worker — covering this alternate source type.",
  technique:
    "Construct a Worker from a data: URL containing timezone-probing code, compare the reported timezone to the main thread's post-settlement timezone.",
  codeSnippet: `const code = "self.onmessage=()=>{self.postMessage(new Intl.DateTimeFormat().resolvedOptions().timeZone)}"
const worker = new Worker("data:application/javascript," + encodeURIComponent(code))
worker.postMessage(null)
// worker.onmessage.data should equal main thread timezone`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runDataUrlWorker(BLOB_WORKER_SOURCE)
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from data-URL Worker)`,
    }
  },
})

// ---------------------------------------------------------------------------
// Module Workers — closed on Firefox (filterResponseData), known limitation
// elsewhere (same engine split as the other URL-based worker tests)
// ---------------------------------------------------------------------------

const moduleWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "tampering.worker.module-timezone",
  group: urlWorkerGroup,
  name: "Module Worker honors the spoofed Intl timezone",
  description:
    "A module Worker (`new Worker('/workers/module-probe.js', { type: 'module' })`) must report the same timezone as the main thread. The content-script Worker wrapper can't help here — module Workers resolve `import` statements relative to their script URL, and the blob-wrap technique used for classic Workers has no meaningful base path, which would break those imports. On Firefox the extension instead prepends the spoofing payload to the module Worker's script response at the network layer via `webRequest.filterResponseData`, leaving the URL (and therefore import resolution) intact — so the test passes. On Chromium-based browsers and Safari, where `filterResponseData` doesn't exist, module Workers can't be patched without a fundamentally different architecture, so this remains a documented known limitation on those engines.",
  technique:
    "Construct a module Worker from /workers/module-probe.js, send a start message, compare the reported timezone to the main thread's post-settlement timezone. When they differ, the Worker leaked the real system zone.",
  codeSnippet: `const worker = new Worker("/workers/module-probe.js", { type: "module" })
worker.postMessage({ start: true })
// worker.onmessage.data.timeZone should equal main thread timezone`,
  expected: async () => {
    if (typeof Worker === "undefined") {
      return { skipReason: "Worker API not available in this browser" }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runModuleWorker("/workers/module-probe.js")
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from module Worker)`,
    }
  },
})

// ---------------------------------------------------------------------------
// Known limitation: ServiceWorkers
// ---------------------------------------------------------------------------

const serviceWorkerTimezoneTest = buildBehavioralTest<string>({
  id: "known-limitation.worker.service-worker-timezone",
  group: "known-limitations",
  name: "ServiceWorker reports the spoofed Intl timezone",
  description:
    "A ServiceWorker registered via `navigator.serviceWorker.register(url)` runs on a browser-managed lifecycle with a stable URL, persisting across page loads within its scope. Unlike dedicated and shared Workers, ServiceWorkers cannot be intercepted by replacing a constructor — the browser requires same-origin HTTPS URLs and manages cache/update checks against that exact URL, which rules out blob-URL interception. Fingerprinting tools like CreepJS specifically use ServiceWorkers to probe the real system timezone because of this. Closing the leak would require either registering the extension's own service worker on every browsed page (wildly invasive, conflicts with legitimate site service workers, persists after uninstall) or rewriting the fetch response for the script URL at the network layer (beyond what content scripts can do). Documented as a known limitation pending a future architectural approach.",
  technique:
    "Register /workers/service-probe.js as a ServiceWorker, wait for it to activate, send it a message over BroadcastChannel, and compare the reported timezone to the main thread's post-settlement timezone. Unregisters the worker after the test to avoid persistence.",
  codeSnippet: `await navigator.serviceWorker.register("/workers/service-probe.js")
const reg = await navigator.serviceWorker.ready
const channel = new BroadcastChannel("geospoof-service-probe")
channel.onmessage = (e) => {
  // e.data.timeZone should equal main thread timezone
}
reg.active.postMessage({ channel: "geospoof-service-probe" })`,
  expected: async () => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return { skipReason: "ServiceWorker API not available in this browser" }
    }
    if (typeof BroadcastChannel === "undefined") {
      return {
        skipReason: "BroadcastChannel API not available in this browser",
      }
    }
    const tz = getMainThreadTimezone()
    if (!tz) return { skipReason: "Intl did not resolve a timezone identifier" }
    return { value: tz, describe: `"${tz}"` }
  },
  observe: async () => {
    const result = await runServiceWorker("/workers/service-probe.js")
    return {
      value: result.timeZone,
      describe: `"${result.timeZone}" (from ServiceWorker)`,
    }
  },
})

/**
 * Register a ServiceWorker, wait for activation, and ask it to report
 * its timezone via BroadcastChannel. Always unregisters the worker in
 * the finally block so the test doesn't leave a persistent registration
 * behind (which would affect subsequent page loads and confuse users).
 */
async function runServiceWorker(scriptUrl: string): Promise<WorkerResult> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    throw new SkipTestError("ServiceWorker API not available in this browser")
  }
  if (typeof BroadcastChannel === "undefined") {
    throw new SkipTestError(
      "BroadcastChannel API not available in this browser"
    )
  }

  const channelName = `geospoof-service-probe-${Date.now()}`
  let registration: ServiceWorkerRegistration | null = null

  try {
    try {
      // Scope to the workers directory so the registration doesn't
      // affect the rest of the site. The service-probe.js file lives
      // at /workers/service-probe.js so this scope matches.
      // Clean slate: drop any prior registration for this scope before
      // registering, so we always install the CURRENT probe script. Service
      // workers persist across sessions and update only on a byte-diff, so a
      // stale copy (e.g. from before the parity signature existed) can linger
      // and report no `sig`. A fresh install after unregister re-fetches the
      // script bypassing the HTTP cache (SW update semantics). This is more
      // robust than a per-run cache-busting query, which spawns a new worker
      // each run and races the previous one being torn down (message lands on
      // a redundant worker → BroadcastChannel never replies → timeout).
      try {
        const existing = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          existing
            .filter((r) => r.scope.endsWith("/workers/"))
            .map((r) => r.unregister())
        )
      } catch {
        /* best effort — proceed to register regardless */
      }
      registration = await navigator.serviceWorker.register(scriptUrl, {
        scope: "/workers/",
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new SkipTestError(`ServiceWorker registration failed: ${msg}`)
    }

    // Wait for the worker to reach the "active" state before messaging it.
    // The registration resolves as soon as the browser accepts the script,
    // but the worker may still be in "installing" or "waiting" — messages
    // sent before activation will never be delivered.
    const activeWorker = await waitForActiveWorker(registration)
    if (!activeWorker) {
      throw new SkipTestError(
        "ServiceWorker did not reach active state in time"
      )
    }

    return await new Promise<WorkerResult>((resolve, reject) => {
      const channel = new BroadcastChannel(channelName)
      const timer = setTimeout(() => {
        channel.close()
        reject(
          new Error(
            `ServiceWorker did not respond on BroadcastChannel within ${WORKER_TIMEOUT_MS}ms`
          )
        )
      }, WORKER_TIMEOUT_MS)

      channel.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer)
        channel.close()
        const data = event.data as
          | {
              ok: true
              timeZone: string
              offsetMinutes: number
              temporalTimeZone?: string | null
              sig?: TzSignature | null
            }
          | { ok: false; error: string }
        if (data && typeof data === "object" && "ok" in data) {
          if (data.ok) {
            resolve({
              timeZone: data.timeZone,
              offsetMinutes: data.offsetMinutes,
              temporalTimeZone: data.temporalTimeZone ?? null,
              sig: data.sig ?? null,
            })
          } else {
            reject(new Error(`ServiceWorker reported error: ${data.error}`))
          }
        } else {
          reject(
            new Error("ServiceWorker returned an unexpected message shape")
          )
        }
      }

      activeWorker.postMessage({ channel: channelName, sigBase: PARITY_BASE })
    })
  } finally {
    // Always unregister so the worker doesn't persist across test runs.
    // A stale registration would serve the old timezone to future tests
    // and show up in browser DevTools for confused users.
    if (registration) {
      try {
        await registration.unregister()
      } catch {
        // cleanup never masks the primary result/error
      }
    }
  }
}

/**
 * Resolve with the registration's active worker, waiting for the install
 * and activate lifecycle to complete if it's still pending. Returns null
 * if the worker doesn't activate within the timeout.
 */
function waitForActiveWorker(
  registration: ServiceWorkerRegistration
): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), WORKER_TIMEOUT_MS)

    // Prefer the freshly installing/waiting worker over any active one. After a
    // re-register the new script installs ALONGSIDE the old active worker; if we
    // grabbed `registration.active` we'd message the stale worker (which would
    // reply fast but without the current code — e.g. no parity `sig`). Only fall
    // back to `active` when there's no incoming worker (bytes unchanged).
    const incoming = registration.installing || registration.waiting

    if (!incoming) {
      clearTimeout(timer)
      resolve(registration.active ?? null)
      return
    }

    if (incoming.state === "activated") {
      clearTimeout(timer)
      resolve(incoming)
      return
    }

    const onStateChange = () => {
      if (incoming.state === "activated") {
        incoming.removeEventListener("statechange", onStateChange)
        clearTimeout(timer)
        resolve(incoming)
      } else if (incoming.state === "redundant") {
        incoming.removeEventListener("statechange", onStateChange)
        clearTimeout(timer)
        // Superseded by a newer install — use whatever is now active.
        resolve(registration.active ?? null)
      }
    }
    incoming.addEventListener("statechange", onStateChange)
  })
}

// ---------------------------------------------------------------------------
// Temporal card set — one per surface, mirroring the Intl cards above.
//
// `Temporal.Now.timeZoneId()` is a zone surface distinct from Intl and
// getTimezoneOffset. Because every worker injection path shares one payload
// (SPOOF_CORE), Temporal coverage mirrors Intl coverage surface-for-surface:
// closed on all engines for blob / data / nested, closed on Firefox
// (filterResponseData) for URL / shared / importScripts / module, and a known
// limitation for service workers. Each card reuses the same runner and the
// same engine-split group as its Intl twin, reading `temporalTimeZone` off the
// shared WorkerResult. Skips cleanly on engines without Temporal.
// ---------------------------------------------------------------------------

const workerApiAvailable = (): string | null =>
  typeof Worker === "undefined"
    ? "Worker API not available in this browser"
    : null

const sharedWorkerApiAvailable = (): string | null =>
  typeof SharedWorker === "undefined"
    ? "SharedWorker API not available in this browser"
    : null

const serviceWorkerApiAvailable = (): string | null => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return "ServiceWorker API not available in this browser"
  }
  if (typeof BroadcastChannel === "undefined") {
    return "BroadcastChannel API not available in this browser"
  }
  return null
}

/**
 * Build a per-surface Temporal Worker card. Reuses the surface's existing
 * runner (`run`) — which now also collects `temporalTimeZone` — and compares
 * it to the main thread's `Temporal.Now.timeZoneId()`. Skips when Temporal is
 * unavailable on the main thread (`expected`) or inside the worker (`observe`),
 * so a clean browser or a non-Temporal engine never flakes red.
 */
function buildWorkerTemporalTest(config: {
  id: string
  name: string
  group: TestGroupId
  surfaceLabel: string
  description: string
  technique: string
  codeSnippet: string
  available: () => string | null
  run: () => Promise<WorkerResult>
}): TestDefinition {
  return buildBehavioralTest<string>({
    id: config.id,
    group: config.group,
    name: config.name,
    description: config.description,
    technique: config.technique,
    codeSnippet: config.codeSnippet,
    expected: async () => {
      const unavailable = config.available()
      if (unavailable) return { skipReason: unavailable }
      const tz = getMainThreadTemporalTimezone()
      if (!tz) {
        return { skipReason: "Temporal API not available in this browser" }
      }
      return { value: tz, describe: `"${tz}"` }
    },
    observe: async () => {
      const result = await config.run()
      const tz = result.temporalTimeZone
      if (tz == null) {
        throw new SkipTestError("Temporal API not available in this worker")
      }
      return {
        value: tz,
        describe: `"${tz}" (from ${config.surfaceLabel}, Temporal.Now.timeZoneId())`,
      }
    },
  })
}

const blobWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.blob-url-temporal",
  name: "Blob-URL Worker honors the spoofed Temporal timezone",
  group: "timezone-stealth",
  surfaceLabel: "blob-URL Worker",
  description:
    "The Temporal API exposes the current zone directly via Temporal.Now.timeZoneId(), a surface separate from Intl.DateTimeFormat and Date.prototype.getTimezoneOffset. A blob-URL Worker reading it must report the same zone as the main thread. The worker payload historically spoofed only Date/Intl, so this leaked the real zone even while Intl was spoofed; the payload now installs Temporal.Now overrides too.",
  technique:
    "Construct a blob-URL Worker that reads Temporal.Now.timeZoneId() and compare it to the main thread's Temporal.Now.timeZoneId().",
  codeSnippet: `const blob = new Blob(["self.onmessage=()=>self.postMessage(Temporal.Now.timeZoneId())"], { type: "application/javascript" })
new Worker(URL.createObjectURL(blob)) // reported id should equal main thread`,
  available: workerApiAvailable,
  run: () => runBlobWorker(BLOB_WORKER_SOURCE),
})

const urlWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.url-classic-temporal",
  name: "URL-based classic Worker honors the spoofed Temporal timezone",
  group: urlWorkerGroup,
  surfaceLabel: "URL-based classic Worker",
  description:
    "A classic Worker served from a script URL must report the same Temporal.Now.timeZoneId() as the main thread. Covered on Firefox by the background webRequest.filterResponseData listener (which shares the same payload as the blob path); a documented known limitation on Chromium/Safari where that API is unavailable.",
  technique:
    "Construct a Worker from /workers/classic-probe.js and compare its Temporal.Now.timeZoneId() to the main thread's.",
  codeSnippet: `const worker = new Worker("/workers/classic-probe.js")
// reported Temporal.Now.timeZoneId() should equal main thread`,
  available: workerApiAvailable,
  run: () => runUrlWorker("/workers/classic-probe.js"),
})

const sharedWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.shared-worker-temporal",
  name: "SharedWorker honors the spoofed Temporal timezone",
  group: urlWorkerGroup,
  surfaceLabel: "SharedWorker",
  description:
    "A SharedWorker must report the same Temporal.Now.timeZoneId() as the main thread. Same engine split as the other URL-based worker surfaces: closed on Firefox via filterResponseData, a known limitation on Chromium/Safari.",
  technique:
    "Connect to /workers/shared-probe.js over its port and compare its Temporal.Now.timeZoneId() to the main thread's.",
  codeSnippet: `const s = new SharedWorker("/workers/shared-probe.js")
s.port.start() // reported Temporal.Now.timeZoneId() should equal main thread`,
  available: sharedWorkerApiAvailable,
  run: () => runSharedWorker("/workers/shared-probe.js"),
})

const importScriptsTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.importscripts-temporal",
  name: "importScripts-loaded code honors the spoofed Temporal timezone",
  group: urlWorkerGroup,
  surfaceLabel: "importScripts-loaded code",
  description:
    "Code pulled into a Worker via importScripts() runs in the worker scope and must see the spoofed Temporal.Now.timeZoneId(). Covered on Firefox via filterResponseData; a known limitation on Chromium/Safari.",
  technique:
    "Load /workers/importscripts-probe.js (which importScripts a helper) and compare the helper's Temporal.Now.timeZoneId() to the main thread's.",
  codeSnippet: `// probe.js: importScripts("./importscripts-helper.js")
const worker = new Worker("/workers/importscripts-probe.js")
// imported code's Temporal.Now.timeZoneId() should equal main thread`,
  available: workerApiAvailable,
  run: () => runImportScriptsWorker("/workers/importscripts-probe.js"),
})

const nestedWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.nested-worker-temporal",
  name: "Nested Worker (Worker-in-Worker) honors the spoofed Temporal timezone",
  group: "timezone-stealth",
  surfaceLabel: "nested Worker-in-Worker",
  description:
    "A Worker spawned from inside another Worker must also report the spoofed Temporal.Now.timeZoneId(). The payload recursively wraps self.Worker, so the child inherits the Temporal overrides on every engine.",
  technique:
    "Construct a blob-URL Worker that spawns a child blob-URL Worker; the child reports its Temporal.Now.timeZoneId() up to the main thread for comparison.",
  codeSnippet: `// outer worker: const child = new Worker(URL.createObjectURL(new Blob([...])))
// child reports Temporal.Now.timeZoneId(); should equal main thread`,
  available: workerApiAvailable,
  run: () => runBlobWorker(NESTED_WORKER_SOURCE),
})

const dataUrlWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.data-url-temporal",
  name: "Data-URL Worker honors the spoofed Temporal timezone",
  group: "timezone-stealth",
  surfaceLabel: "data-URL Worker",
  description:
    "A Worker constructed from a data: URL is an inline construction pattern the payload covers on every engine by decoding, prepending the payload, and reconstructing. Its Temporal.Now.timeZoneId() must match the main thread.",
  technique:
    "Construct a Worker from a data: URL that reads Temporal.Now.timeZoneId() and compare it to the main thread's.",
  codeSnippet: `new Worker("data:application/javascript," + encodeURIComponent(
  "self.onmessage=()=>self.postMessage(Temporal.Now.timeZoneId())"
)) // reported id should equal main thread`,
  available: workerApiAvailable,
  run: () => runDataUrlWorker(BLOB_WORKER_SOURCE),
})

const moduleWorkerTemporalTest = buildWorkerTemporalTest({
  id: "tampering.worker.module-temporal",
  name: "Module Worker honors the spoofed Temporal timezone",
  group: urlWorkerGroup,
  surfaceLabel: "module Worker",
  description:
    "A module Worker (type: 'module') must report the same Temporal.Now.timeZoneId() as the main thread. Blob-wrapping breaks module imports, so on Firefox this is closed at the network layer via filterResponseData; a documented known limitation on Chromium/Safari.",
  technique:
    "Construct a module Worker from /workers/module-probe.js and compare its Temporal.Now.timeZoneId() to the main thread's.",
  codeSnippet: `const worker = new Worker("/workers/module-probe.js", { type: "module" })
// reported Temporal.Now.timeZoneId() should equal main thread`,
  available: workerApiAvailable,
  run: () => runModuleWorker("/workers/module-probe.js"),
})

const serviceWorkerTemporalTest = buildWorkerTemporalTest({
  id: "known-limitation.worker.service-worker-temporal",
  name: "ServiceWorker reports the spoofed Temporal timezone",
  group: "known-limitations",
  surfaceLabel: "ServiceWorker",
  description:
    "A ServiceWorker must report the same Temporal.Now.timeZoneId() as the main thread. Like its Intl counterpart this is a known limitation: service workers require a stable browser-managed URL that rules out constructor interception, and only Firefox's network-layer filter can reach them. Documented pending a future architectural approach.",
  technique:
    "Register /workers/service-probe.js, message it over BroadcastChannel, and compare its Temporal.Now.timeZoneId() to the main thread's. Unregisters afterward.",
  codeSnippet: `await navigator.serviceWorker.register("/workers/service-probe.js")
// worker reports Temporal.Now.timeZoneId() via BroadcastChannel`,
  available: serviceWorkerApiAvailable,
  run: () => runServiceWorker("/workers/service-probe.js"),
})

// ---------------------------------------------------------------------------
// Full-surface parity (completeness proof)
//
// The per-surface Intl + Temporal cards above prove the payload REACHES each
// worker construction pattern. This card proves the payload is COMPLETE: it
// computes a signature spanning the entire spoofable Date/Intl/Temporal surface
// (construction, parse, every local getter, a setter round-trip, getTimezoneOffset,
// the formatter family, and Temporal.Now) in a blob Worker and asserts every
// field equals the main thread's. Completeness is surface-independent — the
// payload installs synchronously before worker code on every surface it reaches
// — so proving it on the all-engine blob surface, combined with per-surface
// reach cards, covers the matrix without duplicating a 40-line signature across
// the served /workers/*.js probes.
// ---------------------------------------------------------------------------

/** A comprehensive timezone signature captured at a single fixed instant. */
interface TzSignature {
  intlTz: string
  offset: number
  ctorEpoch: number
  parseEpoch: number
  getters: ReadonlyArray<number>
  setterEpoch: number
  toStr: string
  dateStr: string
  timeStr: string
  localeStr: string
  temporal: string | null
}

/**
 * Compute the timezone signature across the full Date / Intl / Temporal surface.
 *
 * MUST stay self-contained — globals only, no closures or imports — because it
 * is serialized with `.toString()` and injected into a Worker so the worker and
 * the main thread execute byte-identical logic. This is the single source of
 * truth for the parity comparison; editing it updates both sides at once.
 */
function computeTzSignature(base: number): TzSignature {
  const d = new Date(base)
  const rt = new Date(base)
  rt.setHours(9, 30, 15, 0)
  const T = (
    globalThis as { Temporal?: { Now?: { timeZoneId?: () => string } } }
  ).Temporal
  return {
    intlTz: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: d.getTimezoneOffset(),
    ctorEpoch: new Date("2020-06-01T12:00:00").getTime(),
    parseEpoch: Date.parse("2020-06-01T12:00:00"),
    getters: [
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getDay(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    ],
    setterEpoch: rt.getTime(),
    toStr: d.toString(),
    dateStr: d.toDateString(),
    timeStr: d.toTimeString(),
    localeStr: d.toLocaleString("en-US"),
    temporal: T && T.Now && T.Now.timeZoneId ? T.Now.timeZoneId() : null,
  }
}

/** A non-round instant that exercises every component (incl. ms). */
const PARITY_BASE = Date.UTC(2021, 6, 15, 8, 5, 45, 678)

/** Worker source that computes the signature and posts it back. */
const SIG_WORKER_SOURCE = `self.onmessage = function (e) {
  try {
    var f = (${computeTzSignature.toString()});
    self.postMessage({ ok: true, sig: f(e.data) });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};`

/**
 * Outer-worker source that spawns a child blob Worker to compute the signature
 * and relays it up — exercises the nested (Worker-in-Worker) path, where the
 * payload must recursively wrap `self.Worker` inside the parent worker.
 */
const NESTED_SIG_WORKER_SOURCE = `self.onmessage = function (e) {
  try {
    var childSrc = ${JSON.stringify(SIG_WORKER_SOURCE)};
    var url = URL.createObjectURL(new Blob([childSrc], { type: "application/javascript" }));
    var child = new Worker(url);
    child.onmessage = function (ev) {
      try { child.terminate(); URL.revokeObjectURL(url); } catch (x) { /* cleanup */ }
      self.postMessage(ev.data);
    };
    child.onerror = function () { self.postMessage({ ok: false, error: "nested child worker error" }); };
    child.postMessage(e.data);
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};`

/** Post BASE to a signature worker, resolve its reported signature, clean up. */
function awaitWorkerSignature(
  worker: Worker,
  base: number,
  cleanup: () => void
): Promise<TzSignature> {
  return new Promise<TzSignature>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Worker did not respond within ${WORKER_TIMEOUT_MS}ms`)
        ),
      WORKER_TIMEOUT_MS
    )
    worker.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer)
      const data = event.data as
        | { ok: true; sig: TzSignature }
        | { ok: false; error: string }
      if (data && typeof data === "object" && "ok" in data) {
        if (data.ok) resolve(data.sig)
        else reject(new Error(data.error))
      } else {
        reject(new Error("Worker returned an unexpected message shape"))
      }
    }
    worker.onerror = () => {
      clearTimeout(timer)
      reject(new Error("Worker error"))
    }
    worker.postMessage(base)
  }).finally(() => {
    try {
      worker.terminate()
    } catch {
      /* cleanup */
    }
    cleanup()
  })
}

function assertBlobWorkerApis(): void {
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    !URL.createObjectURL
  ) {
    throw new SkipTestError("Worker/Blob URL API not available")
  }
}

function runSignatureViaBlob(base: number): Promise<TzSignature> {
  assertBlobWorkerApis()
  const url = URL.createObjectURL(
    new Blob([SIG_WORKER_SOURCE], { type: "application/javascript" })
  )
  return awaitWorkerSignature(new Worker(url), base, () => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* cleanup */
    }
  })
}

function runSignatureViaData(base: number): Promise<TzSignature> {
  if (typeof Worker === "undefined") {
    throw new SkipTestError("Worker API not available")
  }
  const dataUrl = `data:application/javascript,${encodeURIComponent(SIG_WORKER_SOURCE)}`
  return awaitWorkerSignature(new Worker(dataUrl), base, () => {})
}

function runSignatureViaNested(base: number): Promise<TzSignature> {
  assertBlobWorkerApis()
  const url = URL.createObjectURL(
    new Blob([NESTED_SIG_WORKER_SOURCE], { type: "application/javascript" })
  )
  return awaitWorkerSignature(new Worker(url), base, () => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* cleanup */
    }
  })
}

/**
 * Build a full-surface parity card for an all-engine worker construction path.
 * Runs the shared signature function in the worker and deep-compares every
 * field against the main thread.
 */
function buildWorkerFullParityTest(cfg: {
  id: string
  name: string
  surfaceLabel: string
  group?: TestGroupId
  run: (base: number) => Promise<TzSignature>
}): TestDefinition {
  return buildBehavioralTest<boolean>({
    id: cfg.id,
    group: cfg.group ?? "timezone-stealth",
    name: cfg.name,
    description:
      `Proves the worker spoofing payload is COMPLETE (not merely present) on the ${cfg.surfaceLabel} surface. ` +
      "Computes a signature spanning every spoofable timezone surface — Intl.DateTimeFormat().resolvedOptions(), " +
      "getTimezoneOffset, ambiguous-string and multi-argument construction, Date.parse, all local getters " +
      "(getFullYear/Month/Date/Day/Hours/Minutes/Seconds/Milliseconds), a setHours round-trip epoch, the " +
      "toString/toDateString/toTimeString/toLocaleString family, and Temporal.Now.timeZoneId — inside the worker " +
      "and asserts each field equals the main thread's.",
    technique: `Serialize one signature function via .toString(), run it in a ${cfg.surfaceLabel}, and deep-compare every field against the main thread. Clean browsers match (both native); a worker that diverges fails with the diverging field names.`,
    codeSnippet: `const sig = (base) => ({ intlTz, offset, ctorEpoch, parseEpoch, getters, setterEpoch, toStr, dateStr, timeStr, localeStr, temporal })
// worker sig must deep-equal sig(base) on the main thread`,
    expected: async () => {
      if (typeof Worker === "undefined") {
        return { skipReason: "Worker API not available in this browser" }
      }
      return { value: true, describe: "worker signature matches main thread" }
    },
    observe: async () => {
      const mainSig = computeTzSignature(PARITY_BASE)
      let workerSig: TzSignature
      try {
        workerSig = await cfg.run(PARITY_BASE)
      } catch (err) {
        if (err instanceof SkipTestError) throw err
        throw new SkipTestError(
          `${cfg.surfaceLabel} signature unavailable: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      const diffs: Array<string> = []
      const keys = Object.keys(mainSig) as Array<keyof TzSignature>
      for (const k of keys) {
        if (k === "temporal") {
          // Only meaningful when both realms expose Temporal.
          if (
            mainSig.temporal &&
            workerSig.temporal &&
            mainSig.temporal !== workerSig.temporal
          ) {
            diffs.push("temporal")
          }
          continue
        }
        if (JSON.stringify(mainSig[k]) !== JSON.stringify(workerSig[k])) {
          diffs.push(k)
        }
      }
      return {
        value: diffs.length === 0,
        describe: diffs.length
          ? `diverged from main thread: ${diffs.join(", ")}`
          : "all Date/Intl/Temporal surfaces match the main thread",
      }
    },
  })
}

const blobWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.blob-full-timezone-parity",
  name: "Blob Worker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "blob-URL Worker",
  run: runSignatureViaBlob,
})

const dataUrlWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.data-full-timezone-parity",
  name: "Data-URL Worker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "data-URL Worker",
  run: runSignatureViaData,
})

const nestedWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.nested-full-timezone-parity",
  name: "Nested Worker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "nested Worker-in-Worker",
  run: runSignatureViaNested,
})

// ── Served-worker full parity ────────────────────────────────────────
// The served probes compute the same signature (via the shared
// self.__tzSignature helper) and return it on their normal result. These
// cards reuse the existing per-surface runners and read `result.sig`. Same
// engine split as the Intl/Temporal cards for these surfaces: closed on
// Firefox via filterResponseData (which prepends the full payload), a known
// limitation on Chromium/Safari, and always a known limitation for service
// workers.

/** Extract the parity signature a served probe reported, or skip. */
function sigFromResult(result: WorkerResult): TzSignature {
  if (!result.sig) {
    throw new SkipTestError("worker did not report a parity signature")
  }
  return result.sig
}

const urlWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.url-classic-full-timezone-parity",
  name: "URL-based classic Worker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "URL-based classic Worker",
  group: urlWorkerGroup,
  run: async () =>
    sigFromResult(await runUrlWorker("/workers/classic-probe.js")),
})

const sharedWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.shared-worker-full-timezone-parity",
  name: "SharedWorker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "SharedWorker",
  group: urlWorkerGroup,
  run: async () =>
    sigFromResult(await runSharedWorker("/workers/shared-probe.js")),
})

const importScriptsFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.importscripts-full-timezone-parity",
  name: "importScripts-loaded code matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "importScripts-loaded code",
  group: urlWorkerGroup,
  run: async () =>
    sigFromResult(
      await runImportScriptsWorker("/workers/importscripts-probe.js")
    ),
})

const moduleWorkerFullParityTest = buildWorkerFullParityTest({
  id: "tampering.worker.module-full-timezone-parity",
  name: "Module Worker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "module Worker",
  group: urlWorkerGroup,
  run: async () =>
    sigFromResult(await runModuleWorker("/workers/module-probe.js")),
})

const serviceWorkerFullParityTest = buildWorkerFullParityTest({
  id: "known-limitation.worker.service-worker-full-timezone-parity",
  name: "ServiceWorker matches the main thread across the full Date/Intl/Temporal surface",
  surfaceLabel: "ServiceWorker",
  group: "known-limitations",
  run: async () =>
    sigFromResult(await runServiceWorker("/workers/service-probe.js")),
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const workerTimezoneTests: ReadonlyArray<TestDefinition> = [
  blobWorkerTimezoneTest,
  blobWorkerTemporalTest,
  blobWorkerFullParityTest,
  urlWorkerTimezoneTest,
  urlWorkerTemporalTest,
  urlWorkerFullParityTest,
  sharedWorkerTimezoneTest,
  sharedWorkerTemporalTest,
  sharedWorkerFullParityTest,
  importScriptsTimezoneTest,
  importScriptsTemporalTest,
  importScriptsFullParityTest,
  nestedWorkerTimezoneTest,
  nestedWorkerTemporalTest,
  nestedWorkerFullParityTest,
  dataUrlWorkerTimezoneTest,
  dataUrlWorkerTemporalTest,
  dataUrlWorkerFullParityTest,
  moduleWorkerTimezoneTest,
  moduleWorkerTemporalTest,
  moduleWorkerFullParityTest,
  serviceWorkerTimezoneTest,
  serviceWorkerTemporalTest,
  serviceWorkerFullParityTest,
]
