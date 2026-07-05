/**
 * Module Worker probe script — served from a real URL with type: "module".
 * Reports timezone data back to the parent via postMessage.
 */
// Side-effect import defines self.__tzSignature. A module worker can't use
// importScripts, but it can import a plain (import/export-free) script.
import "./tz-signature.js"

self.onmessage = function (e) {
  try {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    const offsetMinutes = new Date().getTimezoneOffset()
    const temporalTimeZone =
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null
    const sigBase = e && e.data && e.data.sigBase
    const sig =
      sigBase != null && self.__tzSignature ? self.__tzSignature(sigBase) : null
    const fidelity = self.__methodFidelity ? self.__methodFidelity() : null
    const offsetConsistency = self.__offsetConsistency
      ? self.__offsetConsistency()
      : null
    self.postMessage({
      ok: true,
      timeZone,
      offsetMinutes,
      temporalTimeZone,
      sig,
      fidelity,
      offsetConsistency,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
