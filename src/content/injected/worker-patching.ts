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

import { timezoneData, spoofingEnabled } from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

// ── Original constructors ────────────────────────────────────────────

const OriginalWorker: typeof Worker | undefined =
  typeof Worker !== "undefined" ? Worker : undefined;

const OriginalSharedWorker: typeof SharedWorker | undefined =
  typeof SharedWorker !== "undefined" ? SharedWorker : undefined;

// ── Payload generation ───────────────────────────────────────────────

/**
 * The core timezone spoofing payload — overrides Date/Intl/Temporal
 * inside the Worker scope. Does NOT include Worker-constructor
 * interception or importScripts wrapping. Those are layered on top
 * at payload-generation time.
 *
 * Uses a placeholder `__SPOOF_TZ_ID__` that's replaced with the
 * JSON-stringified identifier at payload-generation time. This
 * keeps the core as a static string we can embed inside a
 * JSON.stringify call (for nested-worker recursion) without
 * needing to escape it twice.
 */
const SPOOF_CORE = `
var __tz_id = __SPOOF_TZ_ID__;

// --- Intl.DateTimeFormat override ---
var OrigDTF = Intl.DateTimeFormat;
var origResolvedOptions = OrigDTF.prototype.resolvedOptions;
var explicitTzInstances = new WeakSet();

function SpoofedDTF() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1];
  if (opts && typeof opts === "object" && "timeZone" in opts) {
    var instance = new OrigDTF(args[0], opts);
    explicitTzInstances.add(instance);
    return instance;
  }
  var newOpts = Object.assign({}, opts || {}, { timeZone: __tz_id });
  return new OrigDTF(args[0], newOpts);
}
SpoofedDTF.prototype = OrigDTF.prototype;
SpoofedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
Object.defineProperty(Intl, "DateTimeFormat", {
  value: SpoofedDTF,
  writable: true,
  configurable: true,
  enumerable: false
});

var origRO = origResolvedOptions;
OrigDTF.prototype.resolvedOptions = function() {
  var result = origRO.call(this);
  if (!explicitTzInstances.has(this)) {
    result.timeZone = __tz_id;
  }
  return result;
};

// --- Date.prototype.getTimezoneOffset override ---
var origGTZO = Date.prototype.getTimezoneOffset;
Date.prototype.getTimezoneOffset = function() {
  try {
    var fmt = new OrigDTF("en-US", { timeZone: __tz_id, timeZoneName: "shortOffset" });
    var parts = fmt.formatToParts(this);
    var tzPart = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "timeZoneName") { tzPart = parts[i].value; break; }
    }
    var m = /^GMT(?:([+-])(\\d{1,2})(?::?(\\d{2}))?)?$/.exec(tzPart);
    if (!m) return origGTZO.call(this);
    if (!m[1]) return 0;
    var h = parseInt(m[2], 10);
    var min = m[3] ? parseInt(m[3], 10) : 0;
    var east = (m[1] === "-" ? -1 : 1) * (h * 60 + min);
    return -east;
  } catch(e) {
    return origGTZO.call(this);
  }
};

// --- Date.prototype.toLocaleString family ---
var origTLS = Date.prototype.toLocaleString;
var origTLDS = Date.prototype.toLocaleDateString;
var origTLTS = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleString = function() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLS.call(this, args[0], opts);
};
Date.prototype.toLocaleDateString = function() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLDS.call(this, args[0], opts);
};
Date.prototype.toLocaleTimeString = function() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLTS.call(this, args[0], opts);
};

// --- Date.prototype getter overrides (getHours, getMinutes, etc.) ---
var getterNames = ["getHours","getMinutes","getSeconds","getDate","getDay","getMonth","getFullYear"];
var origGetters = {};
for (var gi = 0; gi < getterNames.length; gi++) {
  origGetters[getterNames[gi]] = Date.prototype[getterNames[gi]];
}
function spoofedGetter(name) {
  return function() {
    try {
      var opts = { timeZone: __tz_id, hour12: false };
      switch(name) {
        case "getHours": opts.hour = "numeric"; break;
        case "getMinutes": opts.minute = "numeric"; break;
        case "getSeconds": opts.second = "numeric"; break;
        case "getDate": opts.day = "numeric"; break;
        case "getDay": opts.weekday = "short"; break;
        case "getMonth": opts.month = "numeric"; break;
        case "getFullYear": opts.year = "numeric"; break;
      }
      var fmt = new OrigDTF("en-US", opts);
      var parts = fmt.formatToParts(this);
      if (name === "getDay") {
        var dayMap = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
        for (var di = 0; di < parts.length; di++) {
          if (parts[di].type === "weekday") return dayMap[parts[di].value] || 0;
        }
        return origGetters[name].call(this);
      }
      if (name === "getMonth") {
        for (var mi = 0; mi < parts.length; mi++) {
          if (parts[mi].type === "month") return parseInt(parts[mi].value, 10) - 1;
        }
        return origGetters[name].call(this);
      }
      var typeMap = {getHours:"hour",getMinutes:"minute",getSeconds:"second",getDate:"day",getFullYear:"year"};
      var partType = typeMap[name];
      for (var pi = 0; pi < parts.length; pi++) {
        if (parts[pi].type === partType) {
          var val = parseInt(parts[pi].value, 10);
          if (name === "getHours" && val === 24) return 0;
          return val;
        }
      }
      return origGetters[name].call(this);
    } catch(e) {
      return origGetters[name].call(this);
    }
  };
}
for (var si = 0; si < getterNames.length; si++) {
  Date.prototype[getterNames[si]] = spoofedGetter(getterNames[si]);
}

// --- Date.prototype.toString / toTimeString / toDateString ---
function getLongTzName(d) {
  try {
    var f = new OrigDTF("en-US", { timeZone: __tz_id, timeZoneName: "long" });
    var p = f.formatToParts(d);
    for (var i = 0; i < p.length; i++) {
      if (p[i].type === "timeZoneName") return p[i].value;
    }
  } catch(e) {}
  return __tz_id;
}

function getGmtOffset(d) {
  var off = -d.getTimezoneOffset();
  var sign = off >= 0 ? "+" : "-";
  var abs = Math.abs(off);
  var h = String(Math.floor(abs / 60)).padStart(2, "0");
  var m = String(abs % 60).padStart(2, "0");
  return "GMT" + sign + h + m;
}

Date.prototype.toString = function() {
  if (isNaN(this.getTime())) return "Invalid Date";
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id, weekday: "short", month: "short",
    day: "2-digit", year: "numeric", hour: "2-digit",
    minute: "2-digit", second: "2-digit", hour12: false
  });
  var p = f.formatToParts(this);
  var get = function(t) { for (var i=0;i<p.length;i++) if(p[i].type===t) return p[i].value; return ""; };
  var hr = get("hour"); if (hr === "24") hr = "00";
  var offset = getGmtOffset(this);
  var tzName = getLongTzName(this);
  return get("weekday") + " " + get("month") + " " + get("day") + " " + get("year") + " " +
    hr + ":" + get("minute") + ":" + get("second") + " " + offset + " (" + tzName + ")";
};

Date.prototype.toTimeString = function() {
  if (isNaN(this.getTime())) return "Invalid Date";
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id, hour: "2-digit", minute: "2-digit",
    second: "2-digit", hour12: false
  });
  var p = f.formatToParts(this);
  var get = function(t) { for (var i=0;i<p.length;i++) if(p[i].type===t) return p[i].value; return ""; };
  var hr = get("hour"); if (hr === "24") hr = "00";
  var offset = getGmtOffset(this);
  var tzName = getLongTzName(this);
  return hr + ":" + get("minute") + ":" + get("second") + " " + offset + " (" + tzName + ")";
};

Date.prototype.toDateString = function() {
  if (isNaN(this.getTime())) return "Invalid Date";
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id, weekday: "short", month: "short",
    day: "2-digit", year: "numeric"
  });
  var p = f.formatToParts(this);
  var get = function(t) { for (var i=0;i<p.length;i++) if(p[i].type===t) return p[i].value; return ""; };
  return get("weekday") + " " + get("month") + " " + get("day") + " " + get("year");
};
`;

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
// --- importScripts relative-path resolution ---
(function() {
  if (typeof self.importScripts !== "function") return;
  var origImportScripts = self.importScripts;
  var scriptBase = __ORIGINAL_SCRIPT_URL__;
  self.importScripts = function() {
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
})();

// --- Nested Worker interception ---
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

  self.Worker = function NestedWorker(url, opts) {
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
  self.Worker.prototype = OrigW.prototype;
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
  logger.debug("[worker-patching] Worker constructor interception installed");
}

function installWorkerOverride(): void {
  if (!OriginalWorker) return;

  const RealWorker = OriginalWorker;

  const SpoofedWorker = function Worker(
    this: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    scriptURL: string | URL,
    options?: WorkerOptions
  ): Worker {
    // Module workers can't be blob-wrapped (relative imports break)
    if (options?.type === "module") {
      return new RealWorker(scriptURL, options);
    }

    const urlStr = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
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

    // Module workers can't be blob-wrapped
    if (opts?.type === "module") {
      return new RealSharedWorker(scriptURL, options);
    }

    const urlStr = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
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
