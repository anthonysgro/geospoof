/**
 * Firefox-only `webRequest.filterResponseData` worker script patcher.
 *
 * ## Problem
 *
 * Content scripts cannot inject into Web Worker, SharedWorker, or
 * ServiceWorker contexts. The content-script-level worker-patching
 * module wraps `new Worker(url)` and prepends a blob-URL bootstrap for
 * classic workers, but this approach has two architectural limits:
 *
 *   1. Module workers (`{ type: "module" }`) — blob URLs break relative
 *      `import` statements because they have no meaningful base for
 *      resolution.
 *   2. Service workers — the browser requires same-origin HTTPS URLs
 *      for the script (blob URLs rejected at `register()` time) and
 *      manages its own update-check lifecycle.
 *
 * ## Solution
 *
 * Firefox still exposes `webRequest.filterResponseData` in MV3, a
 * Chromium-discontinued API that lets an extension pipe the raw bytes
 * of an HTTP response through a transformation. We use it to prepend
 * the timezone spoofing payload to any worker script response, leaving
 * the URL/origin/CSP/import-resolution behaviour untouched — from the
 * browser's perspective nothing unusual happened, it just fetched a
 * script that happened to contain our payload at the top.
 *
 * ## Scope of URLs we modify
 *
 * `webRequest` reports a `type` field for each request. Firefox lists:
 *
 *   - `script` — top-level HTML `<script>` tags (we ignore these)
 *   - `xmlhttprequest` — fetch / XHR (we ignore)
 *   - `worker` — dedicated Worker scripts (we patch)
 *   - `shared_worker` — SharedWorker scripts (we patch)
 *   - `serviceworker` — ServiceWorker register() scripts (we patch)
 *   - `xslt` — XSLT stylesheets (we ignore)
 *
 * Only the three worker types get piped through our filter. Everything
 * else passes through untouched.
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
 *   5. **One payload per response** — The filter reads the entire
 *      response into memory before writing back (small scripts only;
 *      workers are usually <1MB). For very large worker scripts this
 *      has a memory cost, though still bounded by the script size.
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
}

interface WebRequestDetails {
  requestId: string;
  url: string;
  type: string;
  method: string;
  tabId: number;
  frameId: number;
}

/**
 * We only need to register the listener against `type: "script"`
 * because Firefox reports all worker variants (dedicated, shared,
 * service) under that same bucket. The content-script handshake
 * below is what actually distinguishes a worker script load from
 * a regular `<script>` tag.
 */

// ── State ────────────────────────────────────────────────────────────

let installedListener: ((details: WebRequestDetails) => void) | null = null;

/**
 * Cached settings snapshot. Refreshed on every settings change and
 * read synchronously inside the webRequest listener (listeners
 * can't be async on Firefox). When undefined, the listener is in
 * its "before-first-load" state and short-circuits to a no-op.
 */
let cachedSettings: Settings | undefined;

/**
 * Short-lived allowlist of worker script URLs the content script has
 * announced it's about to fetch. Entries auto-expire after
 * ALLOWLIST_TTL_MS so a stale entry can never match an unrelated
 * future request.
 *
 * Why an allowlist? Firefox reports all worker scripts as
 * `type: "script"`, same as any regular `<script src="...">` tag.
 * Without the handshake we'd be unable to tell apart a Worker script
 * load from a normal page script load — and prepending the spoofing
 * payload to every JavaScript file the browser fetches would break
 * every page (strict-mode conflicts, import collisions, duplicate
 * declarations, etc).
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
 * Check whether a URL is currently on the allowlist. Removes the
 * entry on match (one-shot) so subsequent identical requests still
 * need a fresh ANNOUNCE_WORKER_FETCH.
 *
 * Exception: service workers may be re-fetched by the browser's
 * update-check cycle without the content script announcing them.
 * We leave the entry in place for 10s after a match to cover the
 * immediate update-check that Firefox sometimes issues right after
 * register().
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
 * Update the cached settings snapshot that the listener reads.
 * Called from background/messages.ts whenever settings change and
 * from the initialize() path at startup.
 */
export function updateWorkerFilterSettings(settings: Settings): void {
  cachedSettings = settings;
}

// ── Feature detection ────────────────────────────────────────────────

/**
 * The four optional permissions that must all be granted for
 * `webRequest.filterResponseData` to actually attach to a response.
 * Exported so popup/settings code can ask for or revoke the set via
 * the shared helper functions below.
 *
 * Typed as `string[]` and cast at each call site because
 * `@types/firefox-webext-browser@143` has not yet added
 * `webRequestFilterResponse` and
 * `webRequestFilterResponse.serviceWorkerScript` to its
 * `OptionalPermission` union — the runtime accepts them fine but
 * the current type definitions don't list them.
 */
export const WORKER_FILTER_PERMISSIONS: string[] = [
  "webRequest",
  "webRequestBlocking",
  "webRequestFilterResponse",
  "webRequestFilterResponse.serviceWorkerScript",
];

/**
 * Return true when the current engine exposes the
 * `webRequest.filterResponseData` API. Firefox (all MV3 versions)
 * returns true; Chromium / Safari / engines without the API return
 * false and the worker filter becomes a no-op.
 *
 * Note: this checks only whether the runtime API exists. It does NOT
 * check whether the user has granted the optional permissions — that
 * check happens inside `installWorkerRequestFilter()` via
 * `hasWorkerFilterPermissions()`.
 */
export function isWorkerFilterSupported(): boolean {
  try {
    const wr = (browser.webRequest as unknown as WebRequestWithFilter) || {};
    return typeof wr.filterResponseData === "function";
  } catch {
    return false;
  }
}

/**
 * Return true when the user has granted all four optional permissions
 * required for the worker filter to operate. Called on startup to
 * decide whether to install the listener, and after a permission
 * request to confirm the grant succeeded.
 *
 * On engines without `browser.permissions` (very old Safari builds)
 * returns false — the filter install is then a no-op, which is
 * correct because those engines also lack `filterResponseData`.
 */
export async function hasWorkerFilterPermissions(): Promise<boolean> {
  try {
    if (!browser.permissions || typeof browser.permissions.contains !== "function") {
      return false;
    }

    return await browser.permissions.contains({
      // Cast: `@types/firefox-webext-browser@143` lacks
      // `webRequestFilterResponse` in its OptionalPermission union.
      // Runtime accepts these strings on Firefox 110+.
      permissions: WORKER_FILTER_PERMISSIONS,
    });
  } catch (err) {
    logger.warn(
      "[worker-filter] permissions.contains threw:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Ask the user for all four optional permissions required by the
 * worker filter. Firefox shows a single consent prompt listing the
 * strings (notably "Block content on any page"). Returns true when
 * the user accepts, false when they cancel or any error fires.
 *
 * Must be called from a user-gesture handler (a button click) or
 * Firefox will reject without prompting. The popup's advanced-worker
 * toggle handler is the intended call site.
 */
export async function requestWorkerFilterPermissions(): Promise<boolean> {
  try {
    if (!browser.permissions || typeof browser.permissions.request !== "function") {
      logger.warn("[worker-filter] permissions.request not available");
      return false;
    }

    return await browser.permissions.request({
      permissions: WORKER_FILTER_PERMISSIONS as unknown as browser._manifest.OptionalPermission[],
    });
  } catch (err) {
    logger.warn(
      "[worker-filter] permissions.request threw:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Release the four optional permissions. Called when the user flips
 * Advanced Worker Protection off, so the "Block content on any page"
 * permission disappears from `about:addons` until they opt in again.
 *
 * Best-effort — if the removal fails we continue operating with the
 * permission still held. The listener is uninstalled separately so
 * toggling the setting off always stops filter activity regardless
 * of permission state.
 */
export async function revokeWorkerFilterPermissions(): Promise<void> {
  try {
    if (!browser.permissions || typeof browser.permissions.remove !== "function") {
      return;
    }

    await browser.permissions.remove({
      permissions: WORKER_FILTER_PERMISSIONS as unknown as browser._manifest.OptionalPermission[],
    });
  } catch (err) {
    logger.warn(
      "[worker-filter] permissions.remove threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ── Listener ─────────────────────────────────────────────────────────

/**
 * The webRequest listener body. Examines every outgoing request and,
 * when it's a worker script request AND advanced protection is on,
 * attaches a filter that prepends the spoofing payload.
 *
 * All work inside this function is synchronous (filter attach must
 * happen before the request continues) — we read cachedSettings
 * rather than awaiting loadSettings().
 */
function onBeforeWorkerRequest(details: WebRequestDetails): void {
  // DIAGNOSTIC: log every single request that reaches us so we can
  // see what Firefox is actually dispatching. This fires a LOT —
  // remove after debugging is done. Gate on debugLogging so normal
  // users don't drown in console noise.
  if (cachedSettings?.debugLogging) {
    logger.debug(
      `[worker-filter] onBeforeRequest: type=${details.type} url=${details.url} requestId=${details.requestId}`
    );
  }

  // Short-circuits in order of cheapness

  // 1. Settings not yet loaded.
  if (!cachedSettings) return;

  // 2. Setting disabled.
  if (!cachedSettings.advancedWorkerProtection) return;

  // 3. Spoofing disabled — nothing to prepend.
  if (!cachedSettings.enabled) return;

  // 4. No timezone configured.
  const identifier = cachedSettings.timezone?.identifier;
  if (!identifier) return;

  // 5. Wrong resource type. Firefox reports ALL worker scripts
  //    (dedicated, shared, service) as `type: "script"` — there is
  //    no separate "worker" type in the public ResourceType enum.
  //    We previously filtered on `["worker", "shared_worker",
  //    "serviceworker"]` which matched nothing on Firefox. Now we
  //    accept `script` and rely on the content-script handshake
  //    allowlist (below) to distinguish worker script requests
  //    from normal page script loads.
  if (details.type !== "script") {
    if (cachedSettings.debugLogging) {
      logger.debug(`[worker-filter] skipping non-script type: ${details.type} ${details.url}`);
    }
    return;
  }

  // 6. Non-HTTP(S) URLs — skip (blob, data, about, etc.). Those are
  //    handled by the content-script wrapper because webRequest
  //    doesn't see them.
  if (!/^https?:\/\//.test(details.url)) return;

  // 7. Content-script handshake. The content script's worker wrapper
  //    sends us a ANNOUNCE_WORKER_FETCH message just before it calls
  //    `new Worker(url)` or `serviceWorker.register(url)`, adding the
  //    URL to a short-lived allowlist. If this request's URL isn't
  //    on the list we assume it's a regular `<script>` load and
  //    don't touch it — otherwise we'd prepend our payload to every
  //    JavaScript file the browser fetches, which would break every
  //    page on the internet.
  if (!isAllowlisted(details.url)) {
    if (cachedSettings.debugLogging) {
      logger.debug(
        `[worker-filter] script request not on worker allowlist, skipping: ${details.url}`
      );
    }
    return;
  }

  if (cachedSettings.debugLogging) {
    logger.info(`[worker-filter] patching worker script: ${details.url}`);
  }

  // Build payload with current timezone — every time, so toggling
  // timezone mid-session is respected for the NEXT worker request.
  // Workers already running keep their old payload; that's inherent
  // to worker process isolation.
  const payload = buildStandaloneWorkerPayload(identifier);
  if (!payload) return;

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

  // Accumulate the entire response body, then emit payload + body +
  // close. This avoids parsing the script source — we just prepend
  // the payload bytes to whatever the server sent. The filter must
  // always call close() or disconnect() or the request hangs forever.
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  filter.ondata = (event) => {
    try {
      chunks.push(new Uint8Array(event.data));
    } catch (err) {
      logger.warn(
        `[worker-filter] ondata threw for ${details.url}:`,
        err instanceof Error ? err.message : String(err)
      );
      try {
        filter.disconnect();
      } catch {
        /* cleanup never masks primary failure */
      }
    }
  };

  filter.onstop = () => {
    try {
      filter.write(payloadBytes);
      for (const chunk of chunks) {
        filter.write(chunk);
      }
      filter.close();
    } catch (err) {
      logger.warn(
        `[worker-filter] onstop write/close threw for ${details.url}:`,
        err instanceof Error ? err.message : String(err)
      );
      try {
        filter.disconnect();
      } catch {
        /* cleanup never masks primary failure */
      }
    }
  };

  filter.onerror = () => {
    // Browser-side failure (e.g. SRI hash mismatch, request aborted,
    // tab closed). Let the browser fall through to its default
    // handling of the request — if bytes have already been flushed
    // we can't un-flush, but calling disconnect() tells the filter
    // infrastructure to stop waiting on us. The worker request will
    // fail in its normal way (which is the right UX on SRI-protected
    // sites — the site's own error handling kicks in, rather than
    // us silently breaking the worker).
    const reason = filter.error || "(no reason reported)";
    logger.warn(`[worker-filter] filter error for ${details.url}: ${reason}`);
  };
}

/**
 * Install the webRequest listener. Idempotent — subsequent calls are
 * no-ops. Feature-detects `filterResponseData` at install time and
 * silently skips installation on engines that don't support it OR
 * when the optional permissions have not been granted. Call
 * `requestWorkerFilterPermissions()` from a user-gesture context
 * before calling this to prompt the user for the permissions.
 */
export async function installWorkerRequestFilter(): Promise<void> {
  if (installedListener) return;

  if (!isWorkerFilterSupported()) {
    logger.debug("[worker-filter] filterResponseData not supported, skipping install");
    return;
  }

  // Permissions are optional on Firefox — the manifest lists them
  // under `optional_permissions`, and they're only granted after the
  // user flips Advanced Worker Protection on and accepts the
  // browser's consent prompt. Without the grant, `addListener` below
  // would throw a generic "permission denied" error. Short-circuit
  // cleanly instead.
  if (!(await hasWorkerFilterPermissions())) {
    logger.debug("[worker-filter] optional webRequest permissions not granted, skipping install");
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
    // settings update arrives. The listener short-circuits on undefined.
  }

  try {
    const wr = browser.webRequest as unknown as WebRequestWithFilter;
    if (!wr.onBeforeRequest) {
      logger.debug("[worker-filter] webRequest.onBeforeRequest not available");
      return;
    }
    installedListener = onBeforeWorkerRequest;
    // Register against the widest URL filter (all http/https) and
    // `script` resource type — Firefox reports dedicated, shared,
    // and service worker scripts all as type `script`. The listener
    // body further narrows via the allowlist populated by the
    // content-script handshake, so normal `<script>` loads pass
    // through untouched.
    wr.onBeforeRequest.addListener(
      installedListener,
      {
        urls: ["http://*/*", "https://*/*"],
        types: ["script"],
      },
      ["blocking"]
    );
    logger.info(
      "[worker-filter] installed webRequest.filterResponseData listener for worker scripts"
    );
  } catch (err) {
    installedListener = null;
    logger.warn(
      "[worker-filter] install failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Remove the webRequest listener. Idempotent. Used for tests and,
 * in principle, for runtime shutdown on unsupported engines.
 */
export function uninstallWorkerRequestFilter(): void {
  if (!installedListener) return;
  try {
    const wr = browser.webRequest as unknown as WebRequestWithFilter;
    wr.onBeforeRequest?.removeListener(installedListener);
  } catch (err) {
    logger.warn(
      "[worker-filter] uninstall failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
  installedListener = null;
}
