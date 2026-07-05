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
// Concise-method form (the ES2015 { m(){} }.m syntax) so the installed
// toString has NO own "prototype" and NO [[Construct]] slot — exactly like a
// native method. A plain function expression would carry both and be a tell.
var __maskedToString = {
  toString() {
    var name = __overrideRegistry.get(this);
    if (name !== undefined) {
      return __nativeP1 + name + __nativeP2;
    }
    return __nativeToString.call(this);
  }
}.toString;
__register(__maskedToString, "toString");
Function.prototype.toString = __maskedToString;

// --- Native-method fidelity wrapper ---
// A native prototype method / static is NOT a constructor: it has no own
// "prototype" property and no [[Construct]] internal slot, so
// "new Date.prototype.getHours()" and "Reflect.construct(Array, [], getHours)"
// throw "not a constructor". A plain "function foo(){}" override carries both a
// prototype and [[Construct]], which a fingerprinter running inside a worker
// can detect (hasOwnProperty("prototype"), Reflect.construct-with-new.target).
//
// __nativeMethod wraps a spoofing implementation in a concise method — the only
// callable form that is simultaneously non-constructable, prototype-less, AND
// binds 'this' dynamically (an arrow can't carry 'this'; a function expression
// carries [[Construct]]). It also stamps the native name + arity and registers
// the wrapper for toString masking, so length/name/toString probes pass too.
// Mirrors the main realm's stripConstruct + disguiseAsNative. Constructors
// (SpoofedDate / SpoofedDTF) are intentionally NOT routed through this — they
// must keep their prototype and [[Construct]].
function __nativeMethod(fn, name, length) {
  var wrapped = {
    m() {
      return Reflect.apply(fn, this, Array.prototype.slice.call(arguments));
    }
  }.m;
  try {
    Object.defineProperty(wrapped, "name", {
      value: name,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch (e) {
    // non-configurable name on some engines — toString masking still carries it.
  }
  try {
    Object.defineProperty(wrapped, "length", {
      value: length,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch (e) {
    // best effort — length rarely non-configurable.
  }
  __register(wrapped, name);
  return wrapped;
}

// --- Intl.DateTimeFormat override ---
var OrigDTF = Intl.DateTimeFormat;
var origResolvedOptions = OrigDTF.prototype.resolvedOptions;
var explicitTzInstances = new WeakSet();

function SpoofedDTF() {
  var args = Array.prototype.slice.call(arguments);
  // Honor new.target so subclassing / Reflect.construct preserve the subclass
  // prototype; when called without new (DateTimeFormat() still returns an
  // instance) fall back to the native constructor as the target.
  var nt = new.target || OrigDTF;
  var opts = args[1];
  if (opts && typeof opts === "object" && "timeZone" in opts) {
    var instance = Reflect.construct(OrigDTF, [args[0], opts], nt);
    explicitTzInstances.add(instance);
    return instance;
  }
  var newOpts = Object.assign({}, opts || {}, { timeZone: __tz_id });
  return Reflect.construct(OrigDTF, [args[0], newOpts], nt);
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
var spoofedRO = __nativeMethod(function resolvedOptions() {
  var result = origRO.call(this);
  if (!explicitTzInstances.has(this)) {
    result.timeZone = __tz_id;
  }
  return result;
}, "resolvedOptions", 0);
OrigDTF.prototype.resolvedOptions = spoofedRO;

// --- Date.prototype.getTimezoneOffset override ---
var origGTZO = Date.prototype.getTimezoneOffset;
var spoofedGTZO = __nativeMethod(function getTimezoneOffset() {
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
}, "getTimezoneOffset", 0);
Date.prototype.getTimezoneOffset = spoofedGTZO;

// --- Date.prototype.toLocaleString family ---
var origTLS = Date.prototype.toLocaleString;
var origTLDS = Date.prototype.toLocaleDateString;
var origTLTS = Date.prototype.toLocaleTimeString;
var spoofedTLS = __nativeMethod(function toLocaleString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLS.call(this, args[0], opts);
}, "toLocaleString", 0);
var spoofedTLDS = __nativeMethod(function toLocaleDateString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLDS.call(this, args[0], opts);
}, "toLocaleDateString", 0);
var spoofedTLTS = __nativeMethod(function toLocaleTimeString() {
  var args = Array.prototype.slice.call(arguments);
  var opts = args[1] && typeof args[1] === "object" ? Object.assign({}, args[1]) : {};
  if (!("timeZone" in opts)) opts.timeZone = __tz_id;
  return origTLTS.call(this, args[0], opts);
}, "toLocaleTimeString", 0);
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
  // All local Date getters have native arity 0.
  Date.prototype[gName] = __nativeMethod(spoofedGetter(gName), gName, 0);
}

// getMilliseconds is timezone-independent (whole-minute offsets don't affect
// the ms component), so this is a passthrough — installed only so its toString
// is masked consistently with the other getters, matching the main realm which
// also registers a passthrough here.
var __origGetMs = Date.prototype.getMilliseconds;
var __spoofedGetMs = __nativeMethod(function getMilliseconds() {
  return __origGetMs.call(this);
}, "getMilliseconds", 0);
Date.prototype.getMilliseconds = __spoofedGetMs;

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

Date.prototype.toString = __nativeMethod(function toString() {
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
}, "toString", 0);

Date.prototype.toTimeString = __nativeMethod(function toTimeString() {
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
}, "toTimeString", 0);

Date.prototype.toDateString = __nativeMethod(function toDateString() {
  if (isNaN(this.getTime())) return "Invalid Date";
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id, weekday: "short", month: "short",
    day: "2-digit", year: "numeric"
  });
  var p = f.formatToParts(this);
  var get = function(t) { for (var i=0;i<p.length;i++) if(p[i].type===t) return p[i].value; return ""; };
  return get("weekday") + " " + get("month") + " " + get("day") + " " + get("year");
}, "toDateString", 0);

// --- Date constructor + Date.parse override ---
// The prototype overrides above spoof how an existing Date is READ. But
// constructing a Date from an ambiguous local-time string ("2020-06-01T12:00:00")
// or from multi-argument components interprets those in the worker's REAL system
// zone, producing an epoch a page can diff against the main thread to recover the
// real offset. Mirror the main-realm date-constructor.ts: detect ambiguous inputs
// and shift the epoch by (realOffset - spoofedOffset) so construction behaves as
// if the worker were in the spoofed zone. origGTZO (captured above) is the native
// getTimezoneOffset — i.e. the REAL system offset — which is exactly what the
// adjustment needs.
var OrigDate = Date;
var OrigDateParse = Date.parse;

// Engine truncation of sub-minute historical offsets: V8 (Chrome/Chromium/Edge)
// truncates getTimezoneOffset to whole minutes; SpiderMonkey (Firefox) keeps the
// fraction. Keyed off engine identity to match state.ts. The old approach probed
// the Intl shortOffset string for a ":SS" component, but modern V8 now emits
// seconds there while still truncating getTimezoneOffset, so that probe
// misclassified current Chrome. InternalError is a SpiderMonkey-only global; its
// absence means a V8-like (truncating) engine.
var __engineTruncatesOffset = (function () {
  try {
    return typeof InternalError === "undefined";
  } catch (e) {
    return true;
  }
})();

// Parse "GMT±HH:MM" / "GMT±HHMM" / "GMT" into minutes east of UTC, or null.
function __parseOffsetEast(tzPart) {
  var m = /^GMT(?:([+-])(\\d{1,2})(?::?(\\d{2}))?)?$/.exec(tzPart);
  if (!m) return null;
  if (!m[1]) return 0;
  var h = parseInt(m[2], 10);
  var mn = m[3] ? parseInt(m[3], 10) : 0;
  return (m[1] === "+" ? 1 : -1) * (h * 60 + mn);
}

// Spoofed-zone offset (minutes east of UTC) at a given instant.
function __spoofedOffsetEast(date, fallback) {
  try {
    var f = new OrigDTF("en-US", {
      timeZone: __tz_id,
      timeZoneName: "shortOffset",
    });
    var parts = f.formatToParts(date);
    var tzPart = "GMT";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "timeZoneName") { tzPart = parts[i].value; break; }
    }
    var off = __parseOffsetEast(tzPart);
    return off === null ? fallback : off;
  } catch (e) {
    return fallback;
  }
}

// Ambiguous = no explicit tz designator (Z / UTC / GMT / ±HH[:MM]); an ISO
// date-only string (YYYY-MM-DD) is explicit UTC per spec, so not ambiguous.
function __isAmbiguousDateString(str) {
  var t = str.trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(t)) return false;
  var explicit =
    /Z$/i.test(t) ||
    /\\b(?:UTC|GMT)\\b/i.test(str) ||
    /[+-]\\d{2}(?::?\\d{2})?$/.test(t);
  return !explicit;
}

// ms to add to an epoch so a real-zone interpretation becomes a spoofed-zone
// one. Mirrors computeEpochAdjustment: resolve the spoofed offset at the
// wall-clock instant, refine once for DST boundaries, truncate on V8.
function __computeEpochAdjustment(parsedDate) {
  var realOffset = origGTZO.call(parsedDate); // minutes, positive = west
  var utcEpoch = parsedDate.getTime() + realOffset * 60000;
  try {
    var est = __spoofedOffsetEast(new OrigDate(utcEpoch), 0);
    var probe = new OrigDate(utcEpoch - est * 60000);
    var spoofedOffset = __spoofedOffsetEast(probe, est);
    if (spoofedOffset !== est) {
      var refined = new OrigDate(utcEpoch - spoofedOffset * 60000);
      spoofedOffset = __spoofedOffsetEast(refined, spoofedOffset);
    }
    var effective = __engineTruncatesOffset
      ? Math.trunc(spoofedOffset)
      : spoofedOffset;
    return Math.round((-effective - realOffset) * 60000);
  } catch (e) {
    return 0;
  }
}

function __spoofedDateParse(str) {
  if (typeof str !== "string") return OrigDateParse(str);
  var epoch = OrigDateParse(str);
  if (isNaN(epoch)) return NaN;
  if (__isAmbiguousDateString(str)) {
    return epoch + __computeEpochAdjustment(new OrigDate(epoch));
  }
  return epoch;
}

function __multiArgList(args) {
  return [
    args[0],
    args[1],
    args[2] != null ? args[2] : 1,
    args[3] != null ? args[3] : 0,
    args[4] != null ? args[4] : 0,
    args[5] != null ? args[5] : 0,
    args[6] != null ? args[6] : 0
  ];
}

function __multiArgDate(args) {
  return Reflect.construct(OrigDate, __multiArgList(args));
}

function SpoofedDate() {
  var args = Array.prototype.slice.call(arguments);
  var nt = new.target;
  // Called without new → current time as a string. Native returns a
  // system-zone string; route through the spoofed toString so it matches
  // "new Date().toString()" (CreepJS valid.date consistency).
  if (nt === undefined) {
    return new OrigDate().toString();
  }
  // Construct through new.target so subclassing / Reflect.construct preserve
  // the caller's prototype (native fidelity). For the ordinary new Date() case
  // nt is SpoofedDate, whose prototype IS OrigDate.prototype.
  var construct = function (ctorArgs) {
    return Reflect.construct(OrigDate, ctorArgs, nt);
  };
  if (args.length === 0) return construct([]);
  if (args.length === 1) {
    var a = args[0];
    if (typeof a === "number") return construct([a]);
    if (typeof a === "string") {
      try {
        var parsed = new OrigDate(a);
        if (isNaN(parsed.getTime())) return construct([a]);
        if (__isAmbiguousDateString(a)) {
          return construct([parsed.getTime() + __computeEpochAdjustment(parsed)]);
        }
        return construct([a]);
      } catch (e) {
        return construct([a]);
      }
    }
    return construct([a]);
  }
  try {
    var p = __multiArgDate(args);
    return construct([p.getTime() + __computeEpochAdjustment(p)]);
  } catch (e) {
    return construct(__multiArgList(args));
  }
}

SpoofedDate.prototype = OrigDate.prototype;
Object.defineProperty(SpoofedDate, "name", {
  value: "Date",
  configurable: true,
  enumerable: false,
  writable: false,
});
Object.defineProperty(SpoofedDate, "length", {
  value: 7,
  configurable: true,
  enumerable: false,
  writable: false,
});
var __dateSkip = { prototype: 1, name: 1, length: 1, parse: 1 };
var __dateStatics = Object.getOwnPropertyNames(OrigDate);
for (var __dsi = 0; __dsi < __dateStatics.length; __dsi++) {
  var __sp = __dateStatics[__dsi];
  if (__dateSkip[__sp]) continue;
  var __spd = Object.getOwnPropertyDescriptor(OrigDate, __sp);
  if (__spd) Object.defineProperty(SpoofedDate, __sp, __spd);
}
Object.defineProperty(SpoofedDate, "parse", {
  value: __nativeMethod(__spoofedDateParse, "parse", 1),
  configurable: true,
  enumerable: false,
  writable: true,
});
try {
  Object.setPrototypeOf(SpoofedDate, Function.prototype);
} catch (e) {
  /* best effort */
}
__register(SpoofedDate, "Date");
Object.defineProperty(OrigDate.prototype, "constructor", {
  value: SpoofedDate,
  configurable: true,
  enumerable: false,
  writable: true,
});
try {
  Object.defineProperty(self, "Date", {
    value: SpoofedDate,
    writable: true,
    configurable: true,
    enumerable: false,
  });
} catch (e) {
  self.Date = SpoofedDate;
}

// --- Date setter overrides (local wall-clock setters) ---
// The getters above read in the spoofed zone; without matching setters,
// "d.setHours(9); d.getHours()" doesn't round-trip (set writes in the real
// zone, get reads in the spoofed zone) — a self-inconsistency detectable
// inside the worker alone, and the resulting epoch differs from the main
// thread. Mirror date-setters.ts: read the current spoofed wall-clock parts,
// substitute the changed components, recompose the UTC epoch through the
// spoofed offset (with one DST refinement), and commit via native setTime.
// setMilliseconds / setTime / setUTC* are timezone-independent and left native.
var __origSetHours = OrigDate.prototype.setHours;
var __origSetMinutes = OrigDate.prototype.setMinutes;
var __origSetSeconds = OrigDate.prototype.setSeconds;
var __origSetDate = OrigDate.prototype.setDate;
var __origSetMonth = OrigDate.prototype.setMonth;
var __origSetFullYear = OrigDate.prototype.setFullYear;
var __origSetTime = OrigDate.prototype.setTime;

// Resolve a date's wall-clock components in the spoofed zone. month0 is
// 0-indexed to match Date.UTC / the constructor. Milliseconds are read from
// the native getter (timezone-independent for whole-minute offsets).
function __spoofedParts(date) {
  var f = new OrigDTF("en-US", {
    timeZone: __tz_id,
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  var parts = f.formatToParts(date);
  var o = {};
  for (var i = 0; i < parts.length; i++) {
    o[parts[i].type] = parts[i].value;
  }
  var hour = parseInt(o.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(o.year, 10),
    month0: parseInt(o.month, 10) - 1,
    day: parseInt(o.day, 10),
    hour: hour,
    minute: parseInt(o.minute, 10),
    second: parseInt(o.second, 10),
  };
}

// UTC epoch that, read back in the spoofed zone, yields the given wall-clock
// components. Refines the offset once against the final instant for DST.
function __composeUtcFromSpoofedLocal(year, month0, day, hour, minute, second, ms) {
  if (
    !isFinite(year) || !isFinite(month0) || !isFinite(day) || !isFinite(hour) ||
    !isFinite(minute) || !isFinite(second) || !isFinite(ms)
  ) {
    return NaN;
  }
  var rawUtc;
  if (year >= 0 && year <= 99) {
    // setFullYear-style small years are literal, not 1900+year like Date.UTC.
    var tmp = new OrigDate(OrigDate.UTC(2000, month0, day, hour, minute, second, ms));
    tmp.setUTCFullYear(Math.trunc(year));
    rawUtc = tmp.getTime();
  } else {
    rawUtc = OrigDate.UTC(year, month0, day, hour, minute, second, ms);
  }
  if (!isFinite(rawUtc)) return NaN;
  var est = __spoofedOffsetEast(new OrigDate(rawUtc), 0);
  var probe1 = new OrigDate(rawUtc - est * 60000);
  var offset = __spoofedOffsetEast(probe1, est);
  var utcEpoch = rawUtc - offset * 60000;
  var refined = __spoofedOffsetEast(new OrigDate(utcEpoch), offset);
  if (refined !== offset) {
    offset = refined;
    utcEpoch = rawUtc - offset * 60000;
  }
  return utcEpoch;
}

function __spoofedSetHours(h, m, s, ms) {
  var a = arguments;
  try {
    if (isNaN(this.getTime())) return NaN;
    var p = __spoofedParts(this);
    var nh = Number(h);
    var nm = a.length >= 2 ? Number(m) : p.minute;
    var ns = a.length >= 3 ? Number(s) : p.second;
    var nms = a.length >= 4 ? Number(ms) : this.getMilliseconds();
    var e = __composeUtcFromSpoofedLocal(p.year, p.month0, p.day, nh, nm, ns, nms);
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetHours.apply(this, a);
  }
}

function __spoofedSetMinutes(m, s, ms) {
  var a = arguments;
  try {
    if (isNaN(this.getTime())) return NaN;
    var p = __spoofedParts(this);
    var nm = Number(m);
    var ns = a.length >= 2 ? Number(s) : p.second;
    var nms = a.length >= 3 ? Number(ms) : this.getMilliseconds();
    var e = __composeUtcFromSpoofedLocal(p.year, p.month0, p.day, p.hour, nm, ns, nms);
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetMinutes.apply(this, a);
  }
}

function __spoofedSetSeconds(s, ms) {
  var a = arguments;
  try {
    if (isNaN(this.getTime())) return NaN;
    var p = __spoofedParts(this);
    var ns = Number(s);
    var nms = a.length >= 2 ? Number(ms) : this.getMilliseconds();
    var e = __composeUtcFromSpoofedLocal(p.year, p.month0, p.day, p.hour, p.minute, ns, nms);
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetSeconds.apply(this, a);
  }
}

function __spoofedSetDate(d) {
  var a = arguments;
  try {
    if (isNaN(this.getTime())) return NaN;
    var p = __spoofedParts(this);
    var e = __composeUtcFromSpoofedLocal(
      p.year, p.month0, Number(d), p.hour, p.minute, p.second, this.getMilliseconds()
    );
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetDate.apply(this, a);
  }
}

function __spoofedSetMonth(m, d) {
  var a = arguments;
  try {
    if (isNaN(this.getTime())) return NaN;
    var p = __spoofedParts(this);
    var nMonth = Number(m);
    var nDay = a.length >= 2 ? Number(d) : p.day;
    var e = __composeUtcFromSpoofedLocal(
      p.year, nMonth, nDay, p.hour, p.minute, p.second, this.getMilliseconds()
    );
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetMonth.apply(this, a);
  }
}

function __spoofedSetFullYear(y, m, d) {
  var a = arguments;
  try {
    var epoch = this.getTime();
    // Spec: setFullYear on a NaN date starts from epoch 0.
    var p = isNaN(epoch) ? __spoofedParts(new OrigDate(0)) : __spoofedParts(this);
    var ms = isNaN(epoch) ? 0 : this.getMilliseconds();
    var nYear = Number(y);
    var nMonth = a.length >= 2 ? Number(m) : p.month0;
    var nDay = a.length >= 3 ? Number(d) : p.day;
    var e = __composeUtcFromSpoofedLocal(nYear, nMonth, nDay, p.hour, p.minute, p.second, ms);
    __origSetTime.call(this, e);
    return e;
  } catch (err) {
    return __origSetFullYear.apply(this, a);
  }
}

function __installSetter(name, fn, length) {
  OrigDate.prototype[name] = __nativeMethod(fn, name, length);
}
// Native arities: setHours(4) setMinutes(3) setSeconds(2) setDate(1)
// setMonth(2) setFullYear(3).
__installSetter("setHours", __spoofedSetHours, 4);
__installSetter("setMinutes", __spoofedSetMinutes, 3);
__installSetter("setSeconds", __spoofedSetSeconds, 2);
__installSetter("setDate", __spoofedSetDate, 1);
__installSetter("setMonth", __spoofedSetMonth, 2);
__installSetter("setFullYear", __spoofedSetFullYear, 3);

// --- Temporal.Now override ---
// Temporal.Now.timeZoneId() returns the system zone, and the plain*ISO /
// zonedDateTimeISO methods read the system zone when called with no explicit
// timezone argument — both leak the real timezone inside a worker even when
// Date/Intl are spoofed. Mirror the main-realm temporal.ts overrides: return
// the spoofed identifier for timeZoneId, and substitute it whenever the caller
// passed no explicit zone. The ZonedDateTime offset getters are intentionally
// left untouched — once the zone is spoofed they already derive the correct
// (spoofed) offset. Feature-detected: a no-op on engines without Temporal.
if (typeof Temporal !== "undefined" && Temporal && Temporal.Now) {
  try {
    var __TNow = Temporal.Now;
    var __origTZId = __TNow.timeZoneId.bind(__TNow);
    var __origPDTISO = __TNow.plainDateTimeISO.bind(__TNow);
    var __origPDISO = __TNow.plainDateISO.bind(__TNow);
    var __origPTISO = __TNow.plainTimeISO.bind(__TNow);
    var __origZDTISO = __TNow.zonedDateTimeISO.bind(__TNow);

    var __installNow = function(name, fn) {
      // All Temporal.Now.* methods have native arity 0.
      var wrapped = __nativeMethod(fn, name, 0);
      var d = Object.getOwnPropertyDescriptor(__TNow, name);
      Object.defineProperty(__TNow, name, {
        value: wrapped,
        writable: d ? d.writable : true,
        configurable: d ? d.configurable : true,
        enumerable: d ? d.enumerable : false
      });
    };

    // Keep __origTZId referenced so a future change can delegate to it; the
    // spoofed timeZoneId returns the baked identifier directly.
    void __origTZId;

    __installNow("timeZoneId", function timeZoneId() { return __tz_id; });
    __installNow("plainDateTimeISO", function plainDateTimeISO(tz) {
      return __origPDTISO(tz === undefined ? __tz_id : tz);
    });
    __installNow("plainDateISO", function plainDateISO(tz) {
      return __origPDISO(tz === undefined ? __tz_id : tz);
    });
    __installNow("plainTimeISO", function plainTimeISO(tz) {
      return __origPTISO(tz === undefined ? __tz_id : tz);
    });
    __installNow("zonedDateTimeISO", function zonedDateTimeISO(tz) {
      return __origZDTISO(tz === undefined ? __tz_id : tz);
    });
  } catch(e) {
    // Temporal override failed — leave originals in place.
  }
}
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
