/**
 * Worker constructor interception for timezone spoofing inside Workers.
 *
 * Web Workers run in a separate global scope where content-script overrides
 * don't apply. This module wraps `window.Worker` and `window.SharedWorker`
 * so that when a page constructs a Worker, we prepend a self-contained
 * timezone spoofing payload to the Worker's source before it executes.
 *
 * ## Supported construction patterns:
 *
 *   - `new Worker(blobURL)` — blob is fetched, payload prepended, new blob created
 *   - `new Worker("https://example.com/worker.js")` — script fetched, payload prepended
 *   - `new Worker("data:application/javascript,...")` — decoded, payload prepended
 *   - `new SharedWorker(url)` — same treatment as Worker
 *
 * ## Limitations:
 *
 *   - Module Workers (`{ type: "module" }`) — blob URLs break relative imports.
 *     We skip interception for module workers and let them run unpatched.
 *   - CSP `worker-src` restrictions — if the site blocks `blob:` URLs for workers,
 *     our blob construction fails. We catch the error and fall back to the
 *     original unpatched Worker.
 *   - `self.location` inside the patched worker shows `blob:...` instead of the
 *     original URL. We override `WorkerLocation` in the payload to mask this.
 *   - ServiceWorker — different lifecycle, requires stable URL, not intercepted.
 *   - Nested Workers — the payload also wraps `self.Worker` inside the worker
 *     so child workers spawned from within also get the spoofing payload.
 *
 * ## Settings delivery:
 *
 * The payload bakes in the current timezone settings at Worker construction
 * time. If settings change mid-session, already-running Workers keep the
 * old timezone. This matches the main-thread behavior before settings arrive.
 */

import {
  timezoneData,
  spoofingEnabled,
  advancedWorkerProtectionEnabled,
  ANNOUNCE_EVENT_NAME,
} from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { SPOOF_CORE } from "@/shared/worker-payload";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Announce an imminent worker-script fetch to the content script, which
 * forwards it to the background. The background adds `url` to a short-
 * lived allowlist so its webRequest.filterResponseData listener knows
 * to modify the next HTTP response for that URL.
 *
 * ## Sync vs. async
 *
 * `browser.runtime.sendMessage` is async. The `new Worker(url)` call
 * below is synchronous and the browser dispatches the underlying
 * network request on the current task's microtask queue — which means
 * a naive async announce loses the race: the webRequest `onBeforeRequest`
 * event fires before the background has populated the allowlist.
 *
 * We address this with a CustomEvent instead: it's synchronous end-to-end.
 * The content script's listener for this event calls
 * `browser.runtime.sendMessage` — which IS still async on the
 * background side — but the event dispatch itself blocks until the
 * content script has spawned the sendMessage. That's enough for the
 * sendMessage to be in-flight by the time `new Worker(url)` runs,
 * and Firefox prioritises runtime messages over page-initiated network
 * dispatch for main-thread Workers.
 *
 * Remaining race: if `browser.runtime.sendMessage` serialisation takes
 * longer than the browser's internal Worker-fetch dispatch, the
 * allowlist won't have the URL yet when onBeforeRequest fires. In
 * practice we've found this to be reliable on Firefox but the
 * `isAllowlisted` check short-circuits cleanly when it isn't, so the
 * failure mode is a pass-through (no spoofing) rather than a
 * hanging worker.
 */
function announceWorkerFetch(url: string): void {
  try {
    const event = new CustomEvent(ANNOUNCE_EVENT_NAME, { detail: { url } });
    window.dispatchEvent(event);
  } catch (err) {
    logger.debug("[worker-patching] announceWorkerFetch failed:", err);
  }
}

// ── Original constructors ────────────────────────────────────────────

const OriginalWorker: typeof Worker | undefined =
  typeof Worker !== "undefined" ? Worker : undefined;

const OriginalSharedWorker: typeof SharedWorker | undefined =
  typeof SharedWorker !== "undefined" ? SharedWorker : undefined;

// ── Payload generation ───────────────────────────────────────────────

// The core spoofing payload is imported from `@/shared/worker-payload`
// so the content-script Worker wrapper and the Firefox-only
// `webRequest.filterResponseData` listener share exactly one source
// of truth. Any change to timezone overrides automatically applies
// to both paths.

/**
 * Wrapper that runs inside a Worker to:
 *   1. Resolve `importScripts` relative paths against the original
 *      script URL (not the blob URL the Worker was instantiated from)
 *   2. Intercept `self.Worker` for nested Worker recursion — child
 *      workers spawned from within this Worker get the same spoofing
 *      core prepended to their source.
 *
 * The `__ORIGINAL_SCRIPT_URL__` placeholder is replaced with the
 * absolute URL of the Worker script we're wrapping, so relative
 * imports resolve correctly. The `__SPOOF_CORE__` placeholder is
 * replaced with a JSON-stringified copy of the core so nested
 * workers can get it too.
 */
const WORKER_WRAPPER = `
// --- Global-install helper (stealth) ---
//
// CreepJS's getClientCode() enumerates Object.getOwnPropertyNames(self)
// and flags any function-valued own property whose toString() doesn't
// match the native "[native code]" mould. Native Worker globals like
// Worker and importScripts are INHERITED from WorkerGlobalScope's
// prototype — they're not own properties of self. If we replaced them
// via self.X = ... or Object.defineProperty(self, "X", ...) we
// would create an own property where none existed before, and CreepJS
// would flag the new own property in its "code:" hash even if the
// value's toString was masked to look native.
//
// This helper walks up self's prototype chain to find the exact
// object that originally owns the property, and installs the
// replacement there — preserving the native layout where self itself
// has no own property for the global.
var __installWorkerGlobal = function(name, value) {
  var target = self;
  var descriptor = Object.getOwnPropertyDescriptor(target, name);
  while (!descriptor) {
    target = Object.getPrototypeOf(target);
    if (!target) break;
    descriptor = Object.getOwnPropertyDescriptor(target, name);
  }
  if (!target) {
    // Property not found in prototype chain — best-effort install on self.
    try {
      Object.defineProperty(self, name, {
        value: value, writable: true, configurable: true, enumerable: false
      });
    } catch(e) {
      try { self[name] = value; } catch(e2) { /* non-writable */ }
    }
    return;
  }
  try {
    Object.defineProperty(target, name, {
      value: value,
      writable: descriptor.writable !== false,
      configurable: descriptor.configurable !== false,
      enumerable: !!descriptor.enumerable
    });
  } catch(e) {
    // Prototype level refused redefinition — fall back to self as
    // last resort. This leaves a stealth gap (code: hash will flag
    // the new own property) but keeps the override functional.
    try {
      Object.defineProperty(self, name, {
        value: value, writable: true, configurable: true, enumerable: false
      });
    } catch(e2) {
      try { self[name] = value; } catch(e3) { /* non-writable */ }
    }
  }
};

// --- importScripts relative-path resolution ---
//
// Installed via __installWorkerGlobal so the override lives on
// WorkerGlobalScope.prototype (where the native lives) rather than
// becoming a new own property of self. Also registered with
// SPOOF_CORE's __register map so the masked Function.prototype.toString
// reports "[native code]" for the replacement.
(function() {
  if (typeof self.importScripts !== "function") return;
  var origImportScripts = self.importScripts;
  var scriptBase = __ORIGINAL_SCRIPT_URL__;
  var spoofedImportScripts = function importScripts() {
    var resolved = [];
    for (var i = 0; i < arguments.length; i++) {
      try {
        resolved.push(new URL(arguments[i], scriptBase).href);
      } catch(e) {
        resolved.push(arguments[i]);
      }
    }
    return origImportScripts.apply(self, resolved);
  };
  if (typeof __register === "function") __register(spoofedImportScripts, "importScripts");
  __installWorkerGlobal("importScripts", spoofedImportScripts);
})();

// --- Nested Worker interception ---
//
// Same stealth treatment: register for toString masking, install at
// prototype level via __installWorkerGlobal.
(function() {
  if (typeof self.Worker === "undefined") return;
  var OrigW = self.Worker;
  var nestedCore = __SPOOF_CORE__;
  var nestedWrapperTemplate = __NESTED_WRAPPER_TEMPLATE__;

  function buildNestedPayload(originalUrl) {
    // All three placeholders must be re-substituted at each nesting
    // level: the outer substitution only replaced them for THIS
    // worker, but the child worker's wrapper starts as a fresh copy
    // of the template with placeholders still intact. We have both
    // nestedCore and nestedWrapperTemplate in scope (they were
    // baked in when our own wrapper was built) so we can use them
    // as the substitution values, enabling recursion to any depth.
    var wrapper = nestedWrapperTemplate
      .replace("__ORIGINAL_SCRIPT_URL__", JSON.stringify(originalUrl))
      .replace("__SPOOF_CORE__", JSON.stringify(nestedCore))
      .replace("__NESTED_WRAPPER_TEMPLATE__", JSON.stringify(nestedWrapperTemplate));
    return "(function(){" + nestedCore + wrapper + "})();";
  }

  var spoofedNestedWorker = function Worker(url, opts) {
    if (opts && opts.type === "module") {
      return new OrigW(url, opts);
    }
    try {
      var urlStr = url instanceof URL ? url.href : String(url);
      if (urlStr.indexOf("blob:") === 0) {
        // Blob URL: use importScripts approach
        var payload = buildNestedPayload(urlStr);
        var bootstrap = payload + 'importScripts(' + JSON.stringify(urlStr) + ');';
        var blob = new Blob([bootstrap], { type: "application/javascript" });
        return new OrigW(URL.createObjectURL(blob), opts);
      }
      if (urlStr.indexOf("data:") === 0) {
        var commaIdx = urlStr.indexOf(",");
        var meta = urlStr.substring(5, commaIdx);
        var encoded = urlStr.substring(commaIdx + 1);
        var decoded;
        if (meta.indexOf(";base64") !== -1) {
          decoded = atob(encoded);
        } else {
          decoded = decodeURIComponent(encoded);
        }
        var payload2 = buildNestedPayload(self.location.href);
        var newBlob = new Blob([payload2 + "\\n" + decoded], { type: "application/javascript" });
        return new OrigW(URL.createObjectURL(newBlob), opts);
      }
      // HTTP(S) URL: resolve absolute against worker's location
      var absoluteUrl = new URL(urlStr, self.location.href).href;
      var payload3 = buildNestedPayload(absoluteUrl);
      var bootstrap2 = payload3 + 'importScripts(' + JSON.stringify(absoluteUrl) + ');';
      var blob2 = new Blob([bootstrap2], { type: "application/javascript" });
      return new OrigW(URL.createObjectURL(blob2), opts);
    } catch(e) {
      return new OrigW(url, opts);
    }
  };
  spoofedNestedWorker.prototype = OrigW.prototype;
  if (typeof __register === "function") __register(spoofedNestedWorker, "Worker");
  __installWorkerGlobal("Worker", spoofedNestedWorker);
})();
`;

/**
 * Generate the complete Worker payload by composing the core with
 * the wrapper (importScripts + nested Worker interception). The
 * `originalScriptUrl` is baked into the wrapper so relative
 * importScripts calls inside the Worker resolve correctly.
 *
 * Returns an empty string when spoofing is disabled or no timezone
 * data is available — the caller falls back to the unpatched Worker.
 */
function generateWorkerPayload(originalScriptUrl: string): string {
  if (!spoofingEnabled || !timezoneData) {
    return "";
  }

  const identifierJson = JSON.stringify(timezoneData.identifier);
  const core = SPOOF_CORE.replace("__SPOOF_TZ_ID__", identifierJson);
  const wrapper = WORKER_WRAPPER.replace(
    "__ORIGINAL_SCRIPT_URL__",
    JSON.stringify(originalScriptUrl)
  )
    .replace("__SPOOF_CORE__", JSON.stringify(core))
    .replace("__NESTED_WRAPPER_TEMPLATE__", JSON.stringify(WORKER_WRAPPER));

  return `(function(){\n"use strict";\n${core}\n${wrapper}\n})();`;
}

// ── URL resolution helpers ───────────────────────────────────────────

/**
 * Decode a data: URL into its source text. Returns null if the URL
 * doesn't look like a valid data URL.
 */
function decodeDataUrl(url: string): string | null {
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = url.substring(5, commaIndex); // after "data:"
  const encoded = url.substring(commaIndex + 1);
  if (meta.includes(";base64")) {
    try {
      return atob(encoded);
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * Create a blob URL from source text prepended with the spoofing payload.
 */
function createPatchedBlobUrl(source: string, payload: string): string {
  const combined = payload + "\n" + source;
  const blob = new Blob([combined], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Create a blob URL that bootstraps with the payload and then loads
 * the original script via importScripts. This avoids fetching the
 * script ourselves (which can fail due to CORS) and preserves the
 * Worker's ability to use relative importScripts paths (since
 * importScripts resolves relative to the Worker's script URL, but
 * we pass the absolute URL so it works from a blob context).
 */
function createImportScriptsBlobUrl(originalUrl: string, payload: string): string {
  // Resolve to absolute URL so importScripts works from blob context
  const absoluteUrl = new URL(originalUrl, window.location.href).href;
  const bootstrap = `${payload}\nimportScripts(${JSON.stringify(absoluteUrl)});\n`;
  const blob = new Blob([bootstrap], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

// ── Worker constructor wrapper ───────────────────────────────────────

/**
 * Install the Worker and SharedWorker constructor interceptions.
 *
 * The wrapped constructors:
 * 1. Generate the spoofing payload from current settings
 * 2. For classic workers: create a blob that prepends the payload and
 *    loads the original script via importScripts
 * 3. For module workers: pass through unmodified (blob URLs break imports)
 * 4. On any failure: fall back to the original constructor
 */
export function installWorkerPatching(): void {
  if (OriginalWorker) {
    installWorkerOverride();
  }
  if (OriginalSharedWorker) {
    installSharedWorkerOverride();
  }
  installServiceWorkerAnnouncer();
  logger.debug("[worker-patching] Worker constructor interception installed");
}

/**
 * Wrap `navigator.serviceWorker.register` to announce the script URL
 * to the background's webRequest listener before the browser fetches
 * it. Unlike Worker/SharedWorker, we don't modify the call itself —
 * service workers require a stable URL that the browser manages for
 * update checks, so any source modification must come from the
 * network layer. We just tell the background "the next fetch for
 * this URL is a service worker script, please patch it."
 *
 * No-op when `navigator.serviceWorker` is undefined (some contexts
 * like private browsing on certain Firefox versions disable it).
 */
function installServiceWorkerAnnouncer(): void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const container = navigator.serviceWorker;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- method re-bound inside wrapper
    const originalRegister = container.register;
    if (typeof originalRegister !== "function") return;

    const wrappedRegister = function register(
      this: ServiceWorkerContainer,
      scriptURL: string | URL,
      options?: RegistrationOptions
    ): Promise<ServiceWorkerRegistration> {
      try {
        if (advancedWorkerProtectionEnabled) {
          const urlStr = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
          if (/^https?:\/\//.test(urlStr) || !urlStr.includes(":")) {
            // Resolve against the document origin so the allowlist key
            // exactly matches what webRequest will see for the request.
            const absolute = new URL(urlStr, window.location.href).href;
            announceWorkerFetch(absolute);
          }
        }
      } catch (err) {
        logger.debug("[worker-patching] SW announce failed:", err);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return originalRegister.call(this, scriptURL, options);
    };

    registerOverride(wrappedRegister, "register");
    disguiseAsNative(wrappedRegister, "register", 1);
    Object.defineProperty(container, "register", {
      value: wrappedRegister,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch (err) {
    logger.warn("[worker-patching] installServiceWorkerAnnouncer failed:", err);
  }
}

function installWorkerOverride(): void {
  if (!OriginalWorker) return;

  const RealWorker = OriginalWorker;

  const SpoofedWorker = function Worker(
    this: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    scriptURL: string | URL,
    options?: WorkerOptions
  ): Worker {
    // Module workers can't be blob-wrapped (relative imports break).
    // When advanced worker protection is on, the background script's
    // webRequest.filterResponseData listener is handling module workers
    // at the network layer — we announce the URL so the listener knows
    // to patch the next response, then let the worker construction
    // proceed untouched. When advanced protection is OFF, we also pass
    // through, leaving module workers as a documented known limitation
    // on that configuration.
    if (options?.type === "module") {
      if (advancedWorkerProtectionEnabled) {
        const mUrl = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
        // Any non-inline URL needs to be announced. The browser will
        // fetch blob: and data: URLs without going through webRequest,
        // so there's no point announcing those — nothing to filter.
        // Everything else (relative paths, root-relative paths,
        // protocol-relative URLs, absolute URLs) resolves against
        // document origin into an absolute URL that webRequest WILL see.
        if (!mUrl.startsWith("blob:") && !mUrl.startsWith("data:")) {
          try {
            announceWorkerFetch(new URL(mUrl, window.location.href).href);
          } catch {
            // Malformed URL — browser will reject the construction anyway.
          }
        }
      }
      return new RealWorker(scriptURL, options);
    }

    const urlStr = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);

    // For URL-based classic workers, when advanced worker protection
    // is on, the webRequest filter will prepend the payload to the
    // network response — announce the URL, then pass through.
    // The worker runs from the real URL with `self.location.href`
    // showing the real script URL (not a blob), so relative
    // importScripts paths resolve correctly and the resulting
    // environment is indistinguishable from a native worker except
    // for the spoofed Date/Intl behaviour that the filter injected.
    if (
      advancedWorkerProtectionEnabled &&
      !urlStr.startsWith("blob:") &&
      !urlStr.startsWith("data:")
    ) {
      try {
        announceWorkerFetch(new URL(urlStr, window.location.href).href);
      } catch {
        // Malformed URL — browser will reject the construction anyway.
      }
      return new RealWorker(scriptURL, options);
    }

    // Resolve absolute URL so that relative importScripts() calls
    // inside the Worker can be resolved against it. For blob: and
    // data: URLs, we use the current page URL as the base since the
    // original script has no meaningful relative-path context.
    const absoluteUrl =
      urlStr.startsWith("blob:") || urlStr.startsWith("data:")
        ? window.location.href
        : new URL(urlStr, window.location.href).href;

    const payload = generateWorkerPayload(absoluteUrl);
    if (!payload) {
      // Spoofing disabled or no timezone data — pass through
      return new RealWorker(scriptURL, options);
    }

    try {
      // Blob URLs: we can't easily fetch them back (they're opaque after
      // creation). Use importScripts approach — the blob URL is already
      // accessible from within a Worker via importScripts.
      if (urlStr.startsWith("blob:")) {
        const blobUrl = createImportScriptsBlobUrl(urlStr, payload);
        return new RealWorker(blobUrl, options);
      }

      // Data URLs: decode inline, prepend payload, create new blob
      if (urlStr.startsWith("data:")) {
        const source = decodeDataUrl(urlStr);
        if (source !== null) {
          const patchedUrl = createPatchedBlobUrl(source, payload);
          return new RealWorker(patchedUrl, options);
        }
        // Couldn't decode — fall through to importScripts approach
      }

      // HTTP(S) URLs: use importScripts bootstrap (avoids CORS issues
      // with fetching the script ourselves). The payload was built with
      // the absolute URL so relative importScripts paths resolve
      // correctly against the Worker's original script URL.
      const blobUrl = createImportScriptsBlobUrl(absoluteUrl, payload);
      return new RealWorker(blobUrl, options);
    } catch (err) {
      // CSP blocked blob: URLs, or other failure — fall back to unpatched
      logger.debug("[worker-patching] Worker interception failed, falling back:", err);
      return new RealWorker(scriptURL, options);
    }
  } as unknown as typeof Worker;

  // Preserve prototype chain so instanceof checks work
  SpoofedWorker.prototype = RealWorker.prototype;
  Object.defineProperty(SpoofedWorker, "prototype", {
    value: RealWorker.prototype,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  // Register for toString masking
  registerOverride(SpoofedWorker as unknown as (...args: unknown[]) => unknown, "Worker");
  disguiseAsNative(SpoofedWorker as unknown as (...args: unknown[]) => unknown, "Worker", 1);

  // Install on window
  Object.defineProperty(window, "Worker", {
    value: SpoofedWorker,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function installSharedWorkerOverride(): void {
  if (!OriginalSharedWorker) return;

  const RealSharedWorker = OriginalSharedWorker;

  const SpoofedSharedWorker = function SharedWorker(
    this: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    scriptURL: string | URL,
    options?: string | WorkerOptions
  ): SharedWorker {
    // SharedWorker's second arg can be a string (name) or options object
    const opts: WorkerOptions | undefined =
      typeof options === "string" ? { name: options } : options;

    // Module workers can't be blob-wrapped. On Firefox with advanced
    // protection the webRequest filter handles them — announce + pass.
    if (opts?.type === "module") {
      if (advancedWorkerProtectionEnabled) {
        const mUrl = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
        if (!mUrl.startsWith("blob:") && !mUrl.startsWith("data:")) {
          try {
            announceWorkerFetch(new URL(mUrl, window.location.href).href);
          } catch {
            // Malformed URL — browser will reject the construction anyway.
          }
        }
      }
      return new RealSharedWorker(scriptURL, options);
    }

    const urlStr = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);

    // On Firefox with advanced protection, let URL-based SharedWorkers
    // flow through the network filter same as dedicated workers.
    if (
      advancedWorkerProtectionEnabled &&
      !urlStr.startsWith("blob:") &&
      !urlStr.startsWith("data:")
    ) {
      try {
        announceWorkerFetch(new URL(urlStr, window.location.href).href);
      } catch {
        // Browser will reject malformed URLs anyway.
      }
      return new RealSharedWorker(scriptURL, options);
    }

    const absoluteUrl =
      urlStr.startsWith("blob:") || urlStr.startsWith("data:")
        ? window.location.href
        : new URL(urlStr, window.location.href).href;

    const payload = generateWorkerPayload(absoluteUrl);
    if (!payload) {
      return new RealSharedWorker(scriptURL, options);
    }

    try {
      if (urlStr.startsWith("blob:")) {
        const blobUrl = createImportScriptsBlobUrl(urlStr, payload);
        return new RealSharedWorker(blobUrl, options);
      }

      if (urlStr.startsWith("data:")) {
        const source = decodeDataUrl(urlStr);
        if (source !== null) {
          const patchedUrl = createPatchedBlobUrl(source, payload);
          return new RealSharedWorker(patchedUrl, options);
        }
      }

      const blobUrl = createImportScriptsBlobUrl(absoluteUrl, payload);
      return new RealSharedWorker(blobUrl, options);
    } catch (err) {
      logger.debug("[worker-patching] SharedWorker interception failed, falling back:", err);
      return new RealSharedWorker(scriptURL, options);
    }
  } as unknown as typeof SharedWorker;

  // Preserve prototype chain
  SpoofedSharedWorker.prototype = RealSharedWorker.prototype;
  Object.defineProperty(SpoofedSharedWorker, "prototype", {
    value: RealSharedWorker.prototype,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  // Register for toString masking
  registerOverride(
    SpoofedSharedWorker as unknown as (...args: unknown[]) => unknown,
    "SharedWorker"
  );
  disguiseAsNative(
    SpoofedSharedWorker as unknown as (...args: unknown[]) => unknown,
    "SharedWorker",
    1
  );

  // Install on window
  Object.defineProperty(window, "SharedWorker", {
    value: SpoofedSharedWorker,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
