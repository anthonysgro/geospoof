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
 * The helper only DEFINES the function; it's called later (in the probe's
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
