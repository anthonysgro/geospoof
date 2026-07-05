/**
 * SharedWorker probe script — served from a real URL.
 * Reports timezone data back to connecting ports via postMessage.
 */
importScripts("./tz-signature.js")

self.onconnect = function (e) {
  var port = e.ports[0]
  port.onmessage = function (ev) {
    try {
      var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
      var offsetMinutes = new Date().getTimezoneOffset()
      var temporalTimeZone =
        typeof Temporal !== "undefined" &&
        Temporal.Now &&
        Temporal.Now.timeZoneId
          ? Temporal.Now.timeZoneId()
          : null
      var sigBase = ev && ev.data && ev.data.sigBase
      var sig =
        sigBase != null && self.__tzSignature
          ? self.__tzSignature(sigBase)
          : null
      port.postMessage({
        ok: true,
        timeZone: timeZone,
        offsetMinutes: offsetMinutes,
        temporalTimeZone: temporalTimeZone,
        sig: sig,
      })
    } catch (err) {
      port.postMessage({
        ok: false,
        error: err && err.message ? err.message : String(err),
      })
    }
  }
  port.start()
}
