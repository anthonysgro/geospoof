/**
 * Worker timezone probe for the verify page.
 *
 * A fingerprinting script can read the system timezone from inside a Worker
 * context, which sidesteps any main-thread-only spoofing. This module spins
 * up the Worker construction patterns the extension reliably patches and
 * reports the timezone each one sees, so the verify page can flag any that
 * leak the real zone.
 *
 * We only probe the surfaces the content script patches in-page on every
 * engine — blob-URL, data-URL, and nested workers — because those are
 * reliable, so a leak there is a genuine failure worth surfacing.
 *
 * Deliberately NOT probed:
 *   - URL-based classic Worker / SharedWorker — only patchable via Firefox's
 *     `webRequest.filterResponseData`, which is best-effort (the worker
 *     request can outrun the MV3 background's settings priming, and
 *     SharedWorker instances persist across loads). Too flaky to show a
 *     verdict for.
 *   - Module Worker / ServiceWorker — documented known limitations on every
 *     engine (and registering a ServiceWorker on each page load has side
 *     effects we don't want).
 *
 * Showing a permanent "not covered" row for those just reads as a failure to
 * users, so they're omitted entirely rather than displayed as caveats.
 */

const WORKER_TIMEOUT_MS = 5_000

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

async function probeDataWorker(source: string): Promise<WorkerReading> {
  const worker = new Worker(`data:application/javascript,${encodeURIComponent(source)}`)
  try {
    return await waitForWorker(worker)
  } finally {
    try { worker.terminate() } catch { /* cleanup */ }
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
