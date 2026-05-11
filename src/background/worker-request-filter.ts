/**
 * Firefox-only `webRequest.filterResponseData` worker script patcher.
 *
 * ## Problem
 *
 * Content scripts cannot inject into Web Worker, SharedWorker, or
 * ServiceWorker contexts. The content-script-level worker-patching
 * module wraps `new Worker(url)` for inline (blob / data) workers by
 * prepending a bootstrap, but URL-based workers, module workers, and
 * service workers all need bytes intercepted at the network layer.
 *
 * ## Solution
 *
 * Firefox still exposes `webRequest.filterResponseData` in MV3, a
 * Chromium-discontinued API that lets an extension pipe the raw bytes
 * of an HTTP response through a transformation. We use it to prepend
 * the timezone spoofing payload to any worker script response, leaving
 * the URL / origin / CSP / import-resolution behaviour untouched — from
 * the browser's perspective nothing unusual happened, it just fetched
 * a script that happens to contain our payload at the top.
 *
 * ## How we identify worker scripts
 *
 * Firefox reports ALL worker script loads (dedicated, shared, service,
 * classic, module) under `details.type === "script"` — the same bucket
 * as every `<script src="...">` on the page. Blindly patching every
 * script would obviously break the web.
 *
 * The reliable distinguisher is the `Sec-Fetch-Dest` HTTP request
 * header, which the browser sets according to the Fetch spec:
 *
 *   - `Sec-Fetch-Dest: worker`        — `new Worker(url)` (classic or module)
 *   - `Sec-Fetch-Dest: sharedworker`  — `new SharedWorker(url)`
 *   - `Sec-Fetch-Dest: serviceworker` — `navigator.serviceWorker.register(url)`
 *   - `Sec-Fetch-Dest: script`        — plain `<script src="...">` tags
 *
 * Headers are available in `onBeforeSendHeaders`, which fires after
 * `onBeforeRequest` but before the request hits the network — and
 * well before any response body arrives. So the classification is
 * always available by the time `filter.ondata` starts firing.
 *
 * ## Two-stage filter flow
 *
 *   1. `onBeforeRequest` — attach a `filterResponseData` filter to
 *      every script request, park state keyed by `requestId`, mark
 *      decision as "pending". This is required because Firefox's
 *      optimized script byte cache only honours filters attached in
 *      `onBeforeRequest`; attaching later silently no-ops for scripts.
 *
 *   2. `onBeforeSendHeaders` — read `Sec-Fetch-Dest`, set the state's
 *      decision to either "patch" (worker / sharedworker /
 *      serviceworker) or "pass" (anything else, including regular
 *      `<script>` tags). Falls back to the URL allowlist (populated
 *      by the content-script `ANNOUNCE_WORKER_FETCH` handshake) when
 *      the header is absent — defensive belt-and-braces.
 *
 *   3. `filter.ondata` / `filter.onstop`
 *      - "patch": buffer all chunks, then emit payload + body + close
 *      - "pass":  write each chunk straight through, close at stop
 *      - "pending" (never arrived): default to pass-through
 *
 * ## Why this replaced the announce-only approach
 *
 * The old design was handshake-only: the injected script fires a
 * CustomEvent → content script → `browser.runtime.sendMessage` →
 * background adds URL to a short-lived allowlist → listener checks
 * allowlist. On a cold MV3 background (post-idle or just-woken), the
 * round-trip could take 50-500ms — and meanwhile `onBeforeRequest`
 * fired synchronously from the worker constructor, found an empty
 * allowlist, and passed the URL through unpatched. Classic race.
 *
 * Moving the signal into `Sec-Fetch-Dest` eliminates the race: the
 * header arrives in the same I/O flow as the request itself, so
 * there's nothing to race against. The allowlist stays in place as
 * a fallback for engines / edge cases where `Sec-Fetch-Dest` is
 * missing (e.g. proxied requests, some redirects).
 *
 * ## Scope of URLs we touch
 *
 * Every http(s) request with `type: "script"`. The filter attaches
 * to all of them but only prepends bytes for the ones tagged as
 * worker-like. Buffer memory is released on `close()` / `disconnect()`.
 *
 * ## Limitations
 *
 *   1. **Subresource Integrity** — Sites that ship `integrity="sha384-..."`
 *      on their worker scripts will fail the hash check after our
 *      modification. The browser refuses to load the worker and the
 *      site's worker-dependent functionality stops working. We catch
 *      the filter-pipeline error in our `onerror` handler and call
 *      `disconnect()` so the original unmodified response falls
 *      through; the site works, the leak remains on that origin.
 *
 *   2. **ServiceWorker persistence** — The browser caches the modified
 *      bytes as the registered SW script. Once registered, it continues
 *      running with our payload until the site updates the script
 *      (byte comparison triggers reinstall, which re-pipes through our
 *      filter) or the user clears site data. Disabling the extension
 *      does not retroactively un-patch already-installed SWs.
 *
 *   3. **Feature detection** — `filterResponseData` may not exist on
 *      every engine. We feature-detect at listener install time and
 *      silently no-op if the API is absent. This also covers Chrome
 *      (polyfill returns undefined), Safari (not implemented), and
 *      future Firefox policy changes.
 *
 *   4. **Source maps** — Prepending shifts line numbers, so dev tools
 *      will show wrong positions when debugging an affected worker.
 *      Doesn't affect end-users, visible to devs only.
 *
 *   5. **Full-response buffering for patched scripts** — We hold the
 *      entire body in memory before writing it back out, because the
 *      payload has to come first. Worker scripts are usually small
 *      (< 1 MB) so the RSS hit is bounded. Pass-through scripts are
 *      streamed chunk-by-chunk with no buffering.
 */

import type { Settings } from "@/shared/types/settings";
import { buildStandaloneWorkerPayload } from "@/shared/worker-payload";
import { loadSettings } from "./settings";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/**
 * Firefox's `webRequest.filterResponseData` returns a `StreamFilter`
 * object. The `browser` polyfill's types mark this API as Firefox-only
 * so we declare a minimal interface to avoid type errors on other
 * build targets.
 */
interface StreamFilter {
  ondata: ((event: { data: ArrayBuffer }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  write(data: ArrayBuffer | Uint8Array): void;
  close(): void;
  disconnect(): void;
  error?: string;
}

/**
 * HTTP request headers as reported by webRequest. Names are case-
 * insensitive per the HTTP spec but Firefox preserves whatever case
 * the browser emitted, so consumers lowercase before comparing.
 */
interface HttpHeader {
  name: string;
  value?: string;
  binaryValue?: number[];
}

/** Shape of `browser.webRequest` that we touch. */
interface WebRequestWithFilter {
  filterResponseData?: (requestId: string) => StreamFilter;
  onBeforeRequest?: {
    addListener: (
      listener: (details: WebRequestDetails) => void | Promise<void>,
      filter: { urls: string[]; types: string[] },
      extraInfoSpec?: string[]
    ) => void;
    removeListener: (listener: (details: WebRequestDetails) => void | Promise<void>) => void;
  };
  onBeforeSendHeaders?: {
    addListener: (
      listener: (details: WebRequestDetailsWithHeaders) => void,
      filter: { urls: string[]; types: string[] },
      extraInfoSpec?: string[]
    ) => void;
    removeListener: (listener: (details: WebRequestDetailsWithHeaders) => void) => void;
  };
}

interface WebRequestDetails {
  requestId: string;
  url: string;
  type: string;
  method: string;
  tabId: number;
  frameId: number;
}

interface WebRequestDetailsWithHeaders extends WebRequestDetails {
  requestHeaders?: HttpHeader[];
}

// ── State ────────────────────────────────────────────────────────────

/**
 * Decision state for a single in-flight script request.
 *
 *   - "pending": filter attached, header classification not yet known.
 *     Buffers any ondata chunks that arrive in this window (rare —
 *     onBeforeSendHeaders normally fires before response body).
 *   - "patch": `Sec-Fetch-Dest` identified as a worker variant (or the
 *     URL was on the announce allowlist). Accumulate body, emit
 *     payload + body + close at onstop.
 *   - "pass": Identified as a regular `<script>` tag. Write each
 *     chunk straight through on ondata, close at onstop.
 */
type Decision = "pending" | "patch" | "pass";

interface PendingRequest {
  filter: StreamFilter;
  url: string;
  decision: Decision;
  chunks: Uint8Array[];
}

/** Map from requestId to the active filter + decision state. */
const pending = new Map<string, PendingRequest>();

let beforeRequestListener: ((details: WebRequestDetails) => void) | null = null;
let beforeSendHeadersListener: ((details: WebRequestDetailsWithHeaders) => void) | null = null;

/**
 * Cached settings snapshot. Refreshed on every settings change and
 * read synchronously inside the webRequest listeners (listeners
 * can't be async on Firefox). When undefined, the listeners are in
 * their "before-first-load" state and short-circuit to a no-op.
 */
let cachedSettings: Settings | undefined;

/**
 * Short-lived allowlist of worker script URLs the content script has
 * announced it's about to fetch. Retained as a secondary classifier
 * for requests where `Sec-Fetch-Dest` is missing for any reason
 * (some proxy configurations, historical Firefox edge cases).
 *
 * Entries auto-expire after ALLOWLIST_TTL_MS so a stale entry can
 * never match an unrelated future request.
 */
const ALLOWLIST_TTL_MS = 10_000;
const workerUrlAllowlist = new Map<string, number>();

/**
 * Add a URL to the worker-script allowlist. Called by the message
 * handler when the content script announces `new Worker(url)` or
 * `navigator.serviceWorker.register(url)`.
 */
export function allowlistWorkerUrl(url: string): void {
  workerUrlAllowlist.set(url, Date.now() + ALLOWLIST_TTL_MS);
  // Opportunistic cleanup of expired entries so the map doesn't grow
  // unbounded on long-lived tabs that spawn many workers.
  if (workerUrlAllowlist.size > 128) {
    const now = Date.now();
    for (const [u, expiry] of workerUrlAllowlist) {
      if (expiry < now) workerUrlAllowlist.delete(u);
    }
  }
}

/**
 * Check whether a URL is currently on the allowlist. Does NOT remove
 * the entry on match — service workers can be re-fetched by the
 * browser's update-check cycle and need the same ruling applied,
 * and module workers can trigger multiple sub-requests under the
 * same parent announce.
 */
function isAllowlisted(url: string): boolean {
  const expiry = workerUrlAllowlist.get(url);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    workerUrlAllowlist.delete(url);
    return false;
  }
  return true;
}

/**
 * Update the cached settings snapshot that the listeners read.
 * Called from background/tabs.ts → broadcastSettingsToTabs on every
 * settings change, and from the initialize() path at startup.
 */
export function updateWorkerFilterSettings(settings: Settings): void {
  cachedSettings = settings;
}

// ── Feature detection ────────────────────────────────────────────────

/**
 * Return true when the current engine exposes the
 * `webRequest.filterResponseData` API. Firefox (all MV3 versions
 * the extension targets) returns true; Chromium and Safari return
 * false and the worker filter becomes a no-op at install time.
 */
export function isWorkerFilterSupported(): boolean {
  try {
    const wr = (browser.webRequest as unknown as WebRequestWithFilter) || {};
    return typeof wr.filterResponseData === "function";
  } catch {
    return false;
  }
}

// ── Classification ───────────────────────────────────────────────────

/**
 * Worker-like `Sec-Fetch-Dest` values. A request bearing any of
 * these is a worker script load and gets the spoofing payload
 * prepended; anything else is a regular script and passes through.
 */
const WORKER_FETCH_DESTS = new Set(["worker", "sharedworker", "serviceworker"]);

/**
 * Extract the `Sec-Fetch-Dest` value from a headers array. Lowercased
 * comparison for case-insensitive header matching per HTTP spec.
 * Returns null when the header is absent (legacy / proxied requests).
 */
function readSecFetchDest(headers: HttpHeader[] | undefined): string | null {
  if (!headers) return null;
  for (const h of headers) {
    if (h.name.toLowerCase() === "sec-fetch-dest") {
      return (h.value ?? "").toLowerCase();
    }
  }
  return null;
}

/**
 * Decide whether this request should have the spoofing payload
 * prepended. Authoritative signal is `Sec-Fetch-Dest`; the URL
 * allowlist is a fallback for the rare case where the header is
 * stripped or absent.
 */
function classifyRequest(details: WebRequestDetailsWithHeaders): Decision {
  const dest = readSecFetchDest(details.requestHeaders);
  if (dest !== null) {
    return WORKER_FETCH_DESTS.has(dest) ? "patch" : "pass";
  }
  // Header missing — fall back to the announce allowlist.
  return isAllowlisted(details.url) ? "patch" : "pass";
}

// ── Listeners ────────────────────────────────────────────────────────

/**
 * onBeforeRequest: attach a filter to every script request so it's
 * in place before Firefox's optimized script byte cache kicks in.
 * The decision to actually modify bytes is deferred to
 * onBeforeSendHeaders where Sec-Fetch-Dest is visible.
 */
function onBeforeWorkerRequest(details: WebRequestDetails): void {
  // Short-circuits in order of cheapness.

  // 1. Settings not yet loaded.
  if (!cachedSettings) return;

  // 2. Spoofing disabled — nothing to prepend, don't bother attaching.
  if (!cachedSettings.enabled) return;

  // 3. No timezone configured.
  if (!cachedSettings.timezone?.identifier) return;

  // 4. Only http(s) scripts — data:/blob: are handled by the content-
  //    script constructor wrapper, webRequest doesn't see them.
  if (details.type !== "script") return;
  if (!/^https?:\/\//.test(details.url)) return;

  if (cachedSettings.debugLogging) {
    logger.debug(
      `[worker-filter] attach filter: url=${details.url} requestId=${details.requestId}`
    );
  }

  let filter: StreamFilter;
  try {
    const wr = browser.webRequest as unknown as WebRequestWithFilter;
    if (!wr.filterResponseData) return;
    filter = wr.filterResponseData(details.requestId);
  } catch (err) {
    logger.warn(
      `[worker-filter] filterResponseData threw for ${details.url}:`,
      err instanceof Error ? err.message : String(err)
    );
    return;
  }

  const state: PendingRequest = {
    filter,
    url: details.url,
    decision: "pending",
    chunks: [],
  };
  pending.set(details.requestId, state);

  filter.ondata = (event) => {
    try {
      if (state.decision === "pass") {
        // Pass-through path: stream chunks straight to the browser
        // with zero buffering.
        filter.write(event.data);
        return;
      }
      // "patch" or "pending" — hold bytes until we're sure. onstop
      // will flush in the correct order once the decision is final.
      state.chunks.push(new Uint8Array(event.data));
    } catch (err) {
      logger.warn(
        `[worker-filter] ondata threw for ${state.url}:`,
        err instanceof Error ? err.message : String(err)
      );
      try {
        filter.disconnect();
      } catch {
        /* cleanup never masks primary failure */
      }
      pending.delete(details.requestId);
    }
  };

  filter.onstop = () => {
    try {
      if (state.decision === "patch") {
        // Build payload fresh so any concurrent timezone change
        // (rare, but possible mid-flight) is reflected in the next
        // completed worker script.
        const identifier = cachedSettings?.timezone?.identifier;
        const payload = identifier ? buildStandaloneWorkerPayload(identifier) : "";
        if (payload) {
          if (cachedSettings?.debugLogging) {
            logger.info(`[worker-filter] patching worker script: ${state.url}`);
          }
          filter.write(new TextEncoder().encode(payload));
        }
        for (const chunk of state.chunks) {
          filter.write(chunk);
        }
        filter.close();
      } else if (state.decision === "pass") {
        // ondata already wrote chunks through; just close.
        filter.close();
      } else {
        // Decision never arrived — treat as pass-through. Flush any
        // buffered chunks so the browser sees the original response.
        for (const chunk of state.chunks) {
          filter.write(chunk);
        }
        filter.close();
      }
    } catch (err) {
      logger.warn(
        `[worker-filter] onstop threw for ${state.url}:`,
        err instanceof Error ? err.message : String(err)
      );
      try {
        filter.disconnect();
      } catch {
        /* cleanup never masks primary failure */
      }
    } finally {
      // Release buffer memory as soon as the request is done.
      state.chunks.length = 0;
      pending.delete(details.requestId);
    }
  };

  filter.onerror = () => {
    // Browser-side failure (e.g. SRI hash mismatch, request aborted,
    // tab closed). The browser falls through to its default handling
    // of the request — if bytes have already been flushed we can't
    // un-flush, but the filter infrastructure stops waiting on us.
    const reason = filter.error || "(no reason reported)";
    logger.warn(`[worker-filter] filter error for ${state.url}: ${reason}`);
    state.chunks.length = 0;
    pending.delete(details.requestId);
  };
}

/**
 * onBeforeSendHeaders: classify the request via `Sec-Fetch-Dest` (or
 * the allowlist fallback) and record the decision so `ondata` /
 * `onstop` know what to do. Non-blocking — we only read headers.
 */
function onBeforeWorkerSendHeaders(details: WebRequestDetailsWithHeaders): void {
  const state = pending.get(details.requestId);
  if (!state) return;

  const decision = classifyRequest(details);
  state.decision = decision;

  if (cachedSettings?.debugLogging) {
    const dest = readSecFetchDest(details.requestHeaders) ?? "(absent)";
    logger.debug(
      `[worker-filter] classify: requestId=${details.requestId} sec-fetch-dest=${dest} decision=${decision} url=${details.url}`
    );
  }

  // If classification flipped to "pass" after data already started
  // buffering (rare corner case when response body races the header
  // event), flush the buffered chunks through so the browser doesn't
  // see a truncated script.
  if (decision === "pass" && state.chunks.length > 0) {
    try {
      for (const chunk of state.chunks) {
        state.filter.write(chunk);
      }
    } catch (err) {
      logger.warn(
        `[worker-filter] pass-through flush threw for ${state.url}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    state.chunks.length = 0;
  }
}

// ── Install / uninstall ──────────────────────────────────────────────

/**
 * Install both webRequest listeners. Idempotent — subsequent calls
 * are no-ops. Feature-detects `filterResponseData` at install time
 * and silently skips installation on engines that don't support it
 * (all non-Firefox engines).
 */
export async function installWorkerRequestFilter(): Promise<void> {
  if (beforeRequestListener) return;

  if (!isWorkerFilterSupported()) {
    logger.debug("[worker-filter] filterResponseData not supported, skipping install");
    return;
  }

  // Prime the settings cache before the first listener invocation.
  try {
    cachedSettings = await loadSettings();
  } catch (err) {
    logger.warn(
      "[worker-filter] failed to prime settings cache:",
      err instanceof Error ? err.message : String(err)
    );
    // Continue — cachedSettings will remain undefined until the first
    // settings update arrives. The listeners short-circuit on undefined.
  }

  try {
    const wr = browser.webRequest as unknown as WebRequestWithFilter;
    if (!wr.onBeforeRequest || !wr.onBeforeSendHeaders) {
      logger.debug("[worker-filter] required webRequest events not available");
      return;
    }

    beforeRequestListener = onBeforeWorkerRequest;
    wr.onBeforeRequest.addListener(
      beforeRequestListener,
      {
        urls: ["http://*/*", "https://*/*"],
        types: ["script"],
      },
      ["blocking"]
    );

    beforeSendHeadersListener = onBeforeWorkerSendHeaders;
    wr.onBeforeSendHeaders.addListener(
      beforeSendHeadersListener,
      {
        urls: ["http://*/*", "https://*/*"],
        types: ["script"],
      },
      ["requestHeaders"]
    );

    logger.info(
      "[worker-filter] installed webRequest listeners (onBeforeRequest + onBeforeSendHeaders)"
    );
  } catch (err) {
    beforeRequestListener = null;
    beforeSendHeadersListener = null;
    logger.warn(
      "[worker-filter] install failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Remove both webRequest listeners. Idempotent. Used for tests and,
 * in principle, for runtime shutdown on unsupported engines.
 */
export function uninstallWorkerRequestFilter(): void {
  try {
    const wr = browser.webRequest as unknown as WebRequestWithFilter;
    if (beforeRequestListener) {
      wr.onBeforeRequest?.removeListener(beforeRequestListener);
    }
    if (beforeSendHeadersListener) {
      wr.onBeforeSendHeaders?.removeListener(beforeSendHeadersListener);
    }
  } catch (err) {
    logger.warn(
      "[worker-filter] uninstall failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
  beforeRequestListener = null;
  beforeSendHeadersListener = null;
}
