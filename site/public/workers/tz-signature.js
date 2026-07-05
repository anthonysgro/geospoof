/**
 * Shared worker timezone-signature helper.
 *
 * Loaded by every served worker probe — via `importScripts("./tz-signature.js")`
 * for the classic / shared / service / importScripts workers, and via
 * `import "./tz-signature.js"` for the module worker. A file with no import/
 * export statements is valid as both a classic script and an ES module, so one
 * file serves all five surfaces.
 *
 * It defines `self.__tzSignature(base)`, which computes a signature across the
 * entire spoofable Date / Intl / Temporal surface. This MUST stay in lockstep
 * with `computeTzSignature()` in worker-timezone.ts: the full-parity cards
 * compare the two field-by-field, so any drift fails the test (drift is
 * self-detecting, not silent).
 *
 * It also defines `self.__methodFidelity()`, the native-method fidelity probe
 * for served worker surfaces — the served twin of `collectMethodFidelityFailures()`
 * in worker-timezone.ts (which the inline blob/data/nested cards use). Keep the
 * two in lockstep: both assert the same overrides have native shape.
 *
 * The helper only DEFINES the functions; they're called later (in the probe's
 * message handler), by which point the injected spoofing payload has already
 * replaced Date / Intl / Temporal in the worker realm.
 */
self.__tzSignature = function (base) {
  var d = new Date(base)
  var rt = new Date(base)
  rt.setHours(9, 30, 15, 0)
  var T = self.Temporal
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

/**
 * Native-method fidelity probe. Verifies every spoofed Date/Intl/Temporal
 * method is indistinguishable from a native method — no own `prototype`, no
 * `[[Construct]]` slot, native name/length/[native code] toString — and that
 * the two real constructors stay constructable with an own prototype. Returns
 * the list of divergences (empty ⇒ all native-faithful).
 *
 * Lockstep with `collectMethodFidelityFailures()` in worker-timezone.ts.
 */
self.__methodFidelity = function () {
  var failures = []
  // Isolate [[Construct]] from the body: `fn` as new.target against Array never
  // runs fn's body — it throws ONLY if fn lacks [[Construct]].
  var hasConstruct = function (fn) {
    try {
      Reflect.construct(Array, [], fn)
      return true
    } catch (e) {
      return false
    }
  }
  var checkMethod = function (label, fn, wantName, wantLength) {
    if (typeof fn !== "function") {
      failures.push(label + ": not a function")
      return
    }
    if (Object.prototype.hasOwnProperty.call(fn, "prototype")) {
      failures.push(label + ": has own prototype")
    }
    if (hasConstruct(fn)) failures.push(label + ": constructable")
    if (fn.name !== wantName) failures.push(label + ": name=" + fn.name)
    if (fn.length !== wantLength) {
      failures.push(label + ": length=" + fn.length + " want " + wantLength)
    }
    if (Function.prototype.toString.call(fn).indexOf("[native code]") === -1) {
      failures.push(label + ": toString not native")
    }
  }
  var checkCtor = function (label, fn) {
    if (typeof fn !== "function") {
      failures.push(label + ": not a function")
      return
    }
    if (!Object.prototype.hasOwnProperty.call(fn, "prototype")) {
      failures.push(label + ": missing own prototype")
    }
    if (!hasConstruct(fn)) failures.push(label + ": not constructable")
  }
  var DP = Date.prototype
  var zeroArity = [
    "getHours",
    "getMinutes",
    "getSeconds",
    "getMilliseconds",
    "getDate",
    "getDay",
    "getMonth",
    "getFullYear",
    "getTimezoneOffset",
    "toString",
    "toDateString",
    "toTimeString",
    "toLocaleString",
    "toLocaleDateString",
    "toLocaleTimeString",
  ]
  for (var i = 0; i < zeroArity.length; i++) {
    checkMethod(zeroArity[i], DP[zeroArity[i]], zeroArity[i], 0)
  }
  var setters = [
    ["setHours", 4],
    ["setMinutes", 3],
    ["setSeconds", 2],
    ["setDate", 1],
    ["setMonth", 2],
    ["setFullYear", 3],
  ]
  for (var s = 0; s < setters.length; s++) {
    checkMethod(setters[s][0], DP[setters[s][0]], setters[s][0], setters[s][1])
  }
  checkMethod(
    "resolvedOptions",
    Intl.DateTimeFormat.prototype.resolvedOptions,
    "resolvedOptions",
    0
  )
  checkMethod("Date.parse", Date.parse, "parse", 1)
  checkMethod(
    "Function.prototype.toString",
    Function.prototype.toString,
    "toString",
    0
  )
  var T = self.Temporal
  if (T && T.Now) {
    var tnames = [
      "timeZoneId",
      "plainDateTimeISO",
      "plainDateISO",
      "plainTimeISO",
      "zonedDateTimeISO",
    ]
    for (var t = 0; t < tnames.length; t++) {
      checkMethod("Temporal.Now." + tnames[t], T.Now[tnames[t]], tnames[t], 0)
    }
  }
  checkCtor("Date", Date)
  checkCtor("Intl.DateTimeFormat", Intl.DateTimeFormat)
  return failures
}

/**
 * Cross-method offset self-consistency probe for served worker surfaces.
 *
 * The served twin of `computeWorkerOffsetConsistency()` in worker-timezone.ts
 * (used by the inline blob/data/nested cards) — keep the two in lockstep.
 *
 * For Jan 15 and Jul 15 of several years it resolves the UTC offset via all six
 * independent surfaces (getTimezoneOffset, epoch arithmetic, Date.parse, Intl
 * shortOffset, component arithmetic, Temporal offsetNanoseconds) and checks they
 * agree to within the per-era tolerance (1 minute pre-1906 for sub-minute LMT
 * rounding, exact otherwise). Returns `{ ok, describe }`.
 *
 * This is a SELF-consistency check: a clean/unpatched worker is natively
 * consistent and passes; it only fails when a spoofing payload is present but
 * one of its override paths disagrees with the others.
 */
self.__offsetConsistency = function () {
  var years = [1879, 1952, 1976, 2025]
  var seasons = [
    { label: "Jan", month: 1, day: 15 },
    { label: "Jul", month: 7, day: 15 },
  ]
  var pad = function (n) {
    return String(n).padStart(2, "0")
  }
  var offsets = function (year, month, day, hour) {
    var r = {}
    try {
      r.getTimezoneOffset = new Date(
        year,
        month - 1,
        day,
        hour,
        0,
        0
      ).getTimezoneOffset()
    } catch (e) {
      r.getTimezoneOffset = null
    }
    try {
      var l = new Date(year, month - 1, day, hour, 0, 0).getTime()
      var u = Date.UTC(year, month - 1, day, hour, 0, 0)
      r.epochArithmetic = Math.round((l - u) / 60000)
    } catch (e) {
      r.epochArithmetic = null
    }
    try {
      var iso =
        year + "-" + pad(month) + "-" + pad(day) + "T" + pad(hour) + ":00:00"
      r.dateParse = Math.round(
        (Date.parse(iso) - Date.parse(iso + "Z")) / 60000
      )
    } catch (e) {
      r.dateParse = null
    }
    try {
      var d = new Date(year, month - 1, day, hour, 0, 0)
      var p = new Intl.DateTimeFormat("en-US", {
        timeZoneName: "shortOffset",
      }).formatToParts(d)
      var t = ""
      for (var i = 0; i < p.length; i++) {
        if (p[i].type === "timeZoneName") t = p[i].value
      }
      var m = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(t)
      if (!m) r.intlShortOffset = null
      else if (!m[1]) r.intlShortOffset = 0
      else {
        var east =
          (m[1] === "-" ? -1 : 1) *
          (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0))
        r.intlShortOffset = -east
      }
    } catch (e) {
      r.intlShortOffset = null
    }
    try {
      var dc = new Date(year, month - 1, day, hour, 0, 0)
      var lc = Date.UTC(
        dc.getFullYear(),
        dc.getMonth(),
        dc.getDate(),
        dc.getHours(),
        dc.getMinutes(),
        dc.getSeconds()
      )
      var uc = Date.UTC(
        dc.getUTCFullYear(),
        dc.getUTCMonth(),
        dc.getUTCDate(),
        dc.getUTCHours(),
        dc.getUTCMinutes(),
        dc.getUTCSeconds()
      )
      r.componentArithmetic = Math.round((uc - lc) / 60000)
    } catch (e) {
      r.componentArithmetic = null
    }
    try {
      var T = self.Temporal
      if (
        !T ||
        !T.Now ||
        typeof T.Now.timeZoneId !== "function" ||
        !T.Instant ||
        typeof T.Instant.from !== "function"
      ) {
        r.temporalOffset = null
      } else {
        var isoUtc =
          year + "-" + pad(month) + "-" + pad(day) + "T" + pad(hour) + ":00:00Z"
        var zdt = T.Instant.from(isoUtc).toZonedDateTimeISO(T.Now.timeZoneId())
        r.temporalOffset = Math.round(-Number(zdt.offsetNanoseconds) / 1e9 / 60)
      }
    } catch (e) {
      r.temporalOffset = null
    }
    return r
  }
  var problems = []
  for (var y = 0; y < years.length; y++) {
    var tol = years[y] < 1970 ? 1 : 0
    for (var s = 0; s < seasons.length; s++) {
      var o = offsets(years[y], seasons[s].month, seasons[s].day, 12)
      var keys = Object.keys(o).filter(function (k) {
        return o[k] !== null
      })
      var vals = keys.map(function (k) {
        return o[k]
      })
      if (!vals.length) {
        problems.push(
          years[y] + " " + seasons[s].label + ": no methods returned a value"
        )
        continue
      }
      if (Math.max.apply(null, vals) - Math.min.apply(null, vals) > tol) {
        var by = {}
        keys.forEach(function (k) {
          var v = String(o[k])
          ;(by[v] = by[v] || []).push(k)
        })
        var brk = Object.keys(by)
          .map(function (v) {
            return v + ": [" + by[v].join(", ") + "]"
          })
          .join(" | ")
        problems.push(
          years[y] + " " + seasons[s].label + " (tol " + tol + "m): " + brk
        )
      }
    }
  }
  return {
    ok: problems.length === 0,
    describe: problems.length
      ? problems.join(" ; ")
      : "all six methods agree across " + years.join(", "),
  }
}
