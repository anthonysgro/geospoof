/**
 * Worker timezone probe for the verify page.
 *
 * A fingerprinting script can read the system timezone from inside a Worker
 * context, which sidesteps any main-thread-only spoofing. This module spins
 * up the Worker construction patterns the extension reliably patches and
 * reports the timezone each one sees, so the verify page can flag any that
 * leak the real zone.
 *
 * We probe the surfaces the content script patches in-page on every engine —
 * blob-URL, data-URL, and nested workers — because those are reliable, so a
 * leak there is a genuine failure worth surfacing.
 *
 * On Firefox we additionally probe URL-based classic Workers, SharedWorkers,
 * and module Workers. These are patched by the background
 * `webRequest.filterResponseData` listener (after the fixes that made it
 * race-free and respawn-safe), so they're now reliable enough to show a
 * verdict for. They are gated behind `engineHasResponseFilter` and omitted on
 * Chromium/Safari, where the same surfaces remain documented known limitations.
 *
 * Deliberately NOT probed:
 *   - ServiceWorker — even on Firefox the patched script bytes get cached and
 *     persist across page loads / after the extension is disabled, and an
 *     already-installed SW is never re-fetched through the filter. Unreliable
 *     plus a persistence footgun, so it stays a documented known limitation.
 *
 * Showing a permanent "not covered" row for those just reads as a failure to
 * users, so they're omitted entirely rather than displayed as caveats.
 */

const WORKER_TIMEOUT_MS = 5_000

/**
 * True on Firefox, where `webRequest.filterResponseData` lets the extension
 * prepend the spoofing payload to URL-based worker script responses. The
 * URL-classic, SharedWorker, and module-worker probes below are only meaningful
 * (and reliable) on Firefox; on Chromium/Safari those surfaces are documented
 * known limitations, so we omit them entirely rather than render a permanent
 * red "leak" row on the verify page.
 *
 * We UA-sniff because the feature lives on the background `browser` global,
 * which the page context can't reach. A misclassification at worst hides a row
 * that could have shown green — never a false leak.
 */
const engineHasResponseFilter: boolean =
  typeof navigator !== "undefined" && /\bFirefox\//.test(navigator.userAgent)

/** What a worker reported back about its own realm's timezone. */
export interface WorkerReading {
  timeZone: string
  offsetMinutes: number
}

/** Outcome for a single worker surface. */
export interface WorkerProbeResult {
  /** Stable id, used as a React key. */
  id: string
  /** Human label shown in the API table. */
  label: string
  /** The reading the worker reported, or null if it never produced one. */
  reading: WorkerReading | null
  /** False when the API doesn't exist / couldn't be constructed here. */
  supported: boolean
  /** Skip / error detail when `supported` is false. */
  detail?: string
}

/** Inline source every worker runs to report its realm's timezone. */
const PROBE_SOURCE = `
  self.onmessage = function () {
    try {
      var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      var offsetMinutes = new Date().getTimezoneOffset();
      self.postMessage({ ok: true, timeZone: timeZone, offsetMinutes: offsetMinutes });
    } catch (err) {
      self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  };
`

/** Outer worker that spawns a child blob worker and relays its reading. */
const NESTED_SOURCE = `
  self.onmessage = function () {
    var childSource = ${JSON.stringify(PROBE_SOURCE)};
    try {
      var blob = new Blob([childSource], { type: "application/javascript" });
      var url = URL.createObjectURL(blob);
      var child = new Worker(url);
      child.onmessage = function (e) {
        child.terminate();
        URL.revokeObjectURL(url);
        self.postMessage(e.data);
      };
      child.onerror = function (e) {
        child.terminate();
        URL.revokeObjectURL(url);
        self.postMessage({ ok: false, error: "nested worker error: " + (e.message || "unknown") });
      };
      child.postMessage({ start: true });
    } catch (err) {
      self.postMessage({ ok: false, error: "nested spawn failed: " + (err && err.message ? err.message : String(err)) });
    }
  };
`

type WorkerMessage =
  | { ok: true; timeZone: string; offsetMinutes: number }
  | { ok: false; error: string }

function readMessage(data: unknown): WorkerReading {
  if (data && typeof data === "object" && "ok" in data) {
    const msg = data as WorkerMessage
    if (msg.ok) return { timeZone: msg.timeZone, offsetMinutes: msg.offsetMinutes }
    throw new Error(msg.error)
  }
  throw new Error("worker returned an unexpected message shape")
}

/** Wait for a dedicated worker to post back its reading. */
function waitForWorker(worker: Worker): Promise<WorkerReading> {
  return new Promise<WorkerReading>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`worker did not respond within ${WORKER_TIMEOUT_MS}ms`)),
      WORKER_TIMEOUT_MS
    )
    worker.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer)
      try {
        resolve(readMessage(event.data))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    worker.onerror = (event) => {
      clearTimeout(timer)
      reject(new Error(event.message || "worker error"))
    }
    worker.postMessage({ start: true })
  })
}

async function probeInlineWorker(source: string): Promise<WorkerReading> {
  const blob = new Blob([source], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  try {
    return await waitForWorker(worker)
  } finally {
    try { worker.terminate() } catch { /* cleanup */ }
    try { URL.revokeObjectURL(url) } catch { /* cleanup */ }
  }
}

/**
 * Read the timezone from inside a Blob-URL Worker. This realm sidesteps
 * naive main-thread-only timezone spoofers, so it reveals the real zone even
 * when `Intl` is patched on the page. Returns null if workers/blobs are
 * unavailable or the probe fails. (GeoSpoof itself patches this surface — the
 * point being that almost nothing else does.)
 */
export async function readWorkerTimezone(): Promise<string | null> {
  const hasWorker = typeof Worker !== "undefined"
  const hasBlob =
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  if (!hasWorker || !hasBlob) return null
  try {
    const reading = await probeInlineWorker(PROBE_SOURCE)
    return reading.timeZone
  } catch {
    return null
  }
}

async function probeDataWorker(source: string): Promise<WorkerReading> {
  const worker = new Worker(`data:application/javascript,${encodeURIComponent(source)}`)
  try {
    return await waitForWorker(worker)
  } finally {
    try { worker.terminate() } catch { /* cleanup */ }
  }
}

/**
 * Read the timezone from a URL-based classic Worker (`new Worker("/path.js")`).
 * Firefox-only surface — patched via the background `filterResponseData`
 * listener. Terminates the worker when done.
 */
async function probeUrlWorker(scriptUrl: string): Promise<WorkerReading> {
  const worker = new Worker(scriptUrl)
  try {
    return await waitForWorker(worker)
  } finally {
    try { worker.terminate() } catch { /* cleanup */ }
  }
}

/**
 * Read the timezone from a module Worker (`new Worker(url, { type: "module" })`).
 * Firefox-only surface. Terminates the worker when done.
 */
async function probeModuleWorker(scriptUrl: string): Promise<WorkerReading> {
  const worker = new Worker(scriptUrl, { type: "module" })
  try {
    return await waitForWorker(worker)
  } finally {
    try { worker.terminate() } catch { /* cleanup */ }
  }
}

/** Wait for a SharedWorker to post back its reading over its port. */
function waitForSharedWorker(worker: SharedWorker): Promise<WorkerReading> {
  return new Promise<WorkerReading>((resolve, reject) => {
    const port = worker.port
    const timer = setTimeout(
      () => reject(new Error(`SharedWorker did not respond within ${WORKER_TIMEOUT_MS}ms`)),
      WORKER_TIMEOUT_MS
    )
    port.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer)
      try {
        resolve(readMessage(event.data))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    worker.onerror = (event) => {
      clearTimeout(timer)
      reject(new Error(event.message || "SharedWorker error"))
    }
    port.start()
    port.postMessage({ start: true })
  })
}

/**
 * Read the timezone from a URL-based SharedWorker. Firefox-only surface.
 * Closes the port when done so the registration doesn't linger.
 */
async function probeSharedWorker(scriptUrl: string): Promise<WorkerReading> {
  const worker = new SharedWorker(scriptUrl)
  try {
    return await waitForSharedWorker(worker)
  } finally {
    try { worker.port.close() } catch { /* cleanup */ }
  }
}

interface ProbeSpec {
  id: string
  label: string
  run: () => Promise<WorkerReading>
}

/**
 * Run the inline-worker probes and collect the results. Each probe is
 * isolated so one failing surface doesn't abort the rest.
 */
export async function probeWorkers(): Promise<Array<WorkerProbeResult>> {
  const hasWorker = typeof Worker !== "undefined"
  const hasBlob =
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"

  const specs: Array<ProbeSpec | null> = [
    hasWorker && hasBlob
      ? {
          id: "worker-blob",
          label: "Blob-URL Worker timeZone",
          run: () => probeInlineWorker(PROBE_SOURCE),
        }
      : null,
    hasWorker
      ? {
          id: "worker-data",
          label: "Data-URL Worker timeZone",
          run: () => probeDataWorker(PROBE_SOURCE),
        }
      : null,
    hasWorker && hasBlob
      ? {
          id: "worker-nested",
          label: "Nested Worker timeZone",
          run: () => probeInlineWorker(NESTED_SOURCE),
        }
      : null,
    // Firefox-only URL-based surfaces. Reliable there via the background
    // filterResponseData listener; omitted on other engines so they never
    // render as a permanent leak (documented known limitation off Firefox).
    hasWorker && engineHasResponseFilter
      ? {
          id: "worker-url",
          label: "URL Worker timeZone",
          run: () => probeUrlWorker("/workers/classic-probe.js"),
        }
      : null,
    hasWorker && engineHasResponseFilter
      ? {
          id: "worker-module",
          label: "Module Worker timeZone",
          run: () => probeModuleWorker("/workers/module-probe.js"),
        }
      : null,
    typeof SharedWorker !== "undefined" && engineHasResponseFilter
      ? {
          id: "worker-shared",
          label: "SharedWorker timeZone",
          run: () => probeSharedWorker("/workers/shared-probe.js"),
        }
      : null,
  ]

  const results = await Promise.all(
    specs.filter((s): s is ProbeSpec => s !== null).map(async (spec) => {
      try {
        const reading = await spec.run()
        return {
          id: spec.id,
          label: spec.label,
          reading,
          supported: true,
        } satisfies WorkerProbeResult
      } catch (err) {
        return {
          id: spec.id,
          label: spec.label,
          reading: null,
          supported: false,
          detail: err instanceof Error ? err.message : String(err),
        } satisfies WorkerProbeResult
      }
    })
  )

  return results
}
