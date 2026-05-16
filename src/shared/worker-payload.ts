/**
 * Shared Worker timezone-spoofing payload.
 *
 * This module is consumed by both:
 *
 *   1. `src/content/injected/worker-patching.ts` — the content-script
 *      Worker constructor wrapper that handles classic, blob-URL, and
 *      data-URL workers by prepending the payload at construction time.
 *   2. `src/background/worker-request-filter.ts` — the Firefox-only
 *      `webRequest.filterResponseData` listener that prepends the
 *      payload to module-worker and service-worker script responses
 *      at the network layer.
 *
 * By sharing the exact same spoofing core between the two paths we
 * guarantee that a worker caught by either path sees identical
 * override behaviour — no drift between the content-script and
 * background versions.
 *
 * The core uses `var` and ES5-compatible syntax throughout so it
 * works in both classic workers (non-strict-by-default) and module
 * workers (strict-by-default) without transformation. The surrounding
 * IIFE handles the "use strict" difference by not relying on any
 * non-strict-mode behaviours.
 */

/**
 * The core timezone spoofing payload. Overrides `Date`, `Intl.DateTimeFormat`,
 * and the Date prototype methods inside whatever scope it runs in. Does NOT
 * include Worker-constructor interception or importScripts wrapping — those
 * are layered on top by callers that need them.
 *
 * Uses a `__SPOOF_TZ_ID__` placeholder that must be replaced with a
 * JSON-stringified IANA identifier before the payload is handed to a Worker.
 */
export const SPOOF_CORE = `
var __tz_id = __SPOOF_TZ_ID__;

// --- Function.prototype.toString masking ---
// Without this, fingerprinters (notably CreepJS) detect our overrides
// because SpoofedDTF.toString() returns the JS source instead of
// "function DateTimeFormat() { [native code] }". We maintain a
// registry of patched functions and make toString lie about them.
// The wrapper itself also lies about its own toString so it can't
// be detected by introspecting Function.prototype.toString.
//
// __register additionally sets fn.name to the native name so that
// detectors comparing Function.prototype.toString.call(fn) against
// "function " + fn.name + "() { [native code] }" (CreepJS's
// getClientCode pattern) see a consistent mask across both surfaces.
//
// Engine-specific native format: Chrome/V8 returns
//   "function X() { [native code] }"           (single line)
// while Firefox/SpiderMonkey returns
//   "function X() {\\n    [native code]\\n}"    (multi-line, 4-space indent)
// We derive __nativeP1 / __nativeP2 at runtime by splitting a
// known-native constructor's source around its name, so our mask
// matches whatever shape the host engine produces.
var __nativeToString = Function.prototype.toString;
var __overrideRegistry = new Map();
var __nativeSplit = __nativeToString.call(Number).split("Number");
var __nativeP1 = __nativeSplit[0]; // e.g. "function " or "function "
var __nativeP2 = __nativeSplit[1] || "() { [native code] }";
function __register(fn, nativeName) {
  __overrideRegistry.set(fn, nativeName);
  try {
    Object.defineProperty(fn, "name", {
      value: nativeName,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch(e) {
    // Some engines have non-configurable name on function declarations;
    // in that case toString masking alone has to carry the stealth.
  }
}
var __maskedToString = function toString() {
  var name = __overrideRegistry.get(this);
  if (name !== undefined) {
    return __nativeP1 + name + __nativeP2;
  }
  return __nativeToString.call(this);
};
__register(__maskedToString, "toString");
Function.prototype.toString = __maskedToString;

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
__register(SpoofedDTF, "DateTimeFormat");
Object.defineProperty(Intl, "DateTimeFormat", {
  value: SpoofedDTF,
  writable: true,
  configurable: true,
  enumerable: false
});

var origRO = origResolvedOptions;
var spoofedRO = function resolvedOptions() {
  var result = origRO.call(this);
  if (!explicitTzInstances.has(this)) {
    result.timeZone = __tz_id;
  }
  return result;
};
__register(spoofedRO, "resolvedOptions");
OrigDTF.prototype.resolvedOptions = spoofedRO;

// --- Date.prototype.getTimezoneOffset override ---
var origGTZO = Date.prototype.getTimezoneOffset;
var spoofedGTZO = function getTimezoneOffset() {
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
__register(spoofedGTZO, "getTimezoneOffset");
Date.prototype.getTimezoneOffset = spoofedGTZO;

// --- Date.prototype.toLocaleString family ---
var origTLS = Date.prototype.toLocaleString;
var origTLDS = Date.prototype.toLocaleDateString;
var origTLTS = Date.prototype.toLocaleTimeString;
var spoofedTLS = function toLocaleString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLS.call(this, args[0], opts);
};
var spoofedTLDS = function toLocaleDateString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLDS.call(this, args[0], opts);
};
var spoofedTLTS = function toLocaleTimeString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLTS.call(this, args[0], opts);
};
__register(spoofedTLS, "toLocaleString");
__register(spoofedTLDS, "toLocaleDateString");
__register(spoofedTLTS, "toLocaleTimeString");
Date.prototype.toLocaleString = spoofedTLS;
Date.prototype.toLocaleDateString = spoofedTLDS;
Date.prototype.toLocaleTimeString = spoofedTLTS;

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
  var gName = getterNames[si];
  var gFn = spoofedGetter(gName);
  __register(gFn, gName);
  Date.prototype[gName] = gFn;
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

Date.prototype.toString = function toString() {
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
__register(Date.prototype.toString, "toString");

Date.prototype.toTimeString = function toTimeString() {
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
__register(Date.prototype.toTimeString, "toTimeString");

Date.prototype.toDateString = function toDateString() {
  if (isNaN(this.getTime())) return "Invalid Date";
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id, weekday: "short", month: "short",
    day: "2-digit", year: "numeric"
  });
  var p = f.formatToParts(this);
  var get = function(t) { for (var i=0;i<p.length;i++) if(p[i].type===t) return p[i].value; return ""; };
  return get("weekday") + " " + get("month") + " " + get("day") + " " + get("year");
};
__register(Date.prototype.toDateString, "toDateString");
`;

/**
 * Build a minimal standalone payload suitable for prepending to a worker
 * script response. Wraps the spoofing core in an IIFE so it doesn't leak
 * its `var` declarations into the worker's global scope.
 *
 * Returns an empty string when `identifier` is falsy — callers should
 * treat that as "don't modify the response."
 */
export function buildStandaloneWorkerPayload(identifier: string | null | undefined): string {
  if (!identifier) return "";
  // Callback form so any `$`-backreference patterns in the identifier
  // (unlikely for real IANA IDs but possible for user input) are
  // passed through literally.
  const idJson = JSON.stringify(identifier);
  const core = SPOOF_CORE.replace("__SPOOF_TZ_ID__", () => idJson);
  return `(function(){\n"use strict";\n${core}\n})();\n`;
}
