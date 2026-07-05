/**
 * Classic Worker probe script — served from a real URL.
 * Reports timezone data back to the parent via postMessage.
 */
importScripts("./tz-signature.js")

self.onmessage = function (e) {
  try {
    var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    var offsetMinutes = new Date().getTimezoneOffset()
    var temporalTimeZone =
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null
    var sigBase = e && e.data && e.data.sigBase
    var sig =
      sigBase != null && self.__tzSignature ? self.__tzSignature(sigBase) : null
    var fidelity = self.__methodFidelity ? self.__methodFidelity() : null
    var offsetConsistency = self.__offsetConsistency
      ? self.__offsetConsistency()
      : null
    self.postMessage({
      ok: true,
      timeZone: timeZone,
      offsetMinutes: offsetMinutes,
      temporalTimeZone: temporalTimeZone,
      sig: sig,
      fidelity: fidelity,
      offsetConsistency: offsetConsistency,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
