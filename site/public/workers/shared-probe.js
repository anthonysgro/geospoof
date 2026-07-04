/**
 * SharedWorker probe script — served from a real URL.
 * Reports timezone data back to connecting ports via postMessage.
 */
self.onconnect = function (e) {
  var port = e.ports[0]
  port.onmessage = function () {
    try {
      var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
      var offsetMinutes = new Date().getTimezoneOffset()
      var temporalTimeZone =
        typeof Temporal !== "undefined" &&
        Temporal.Now &&
        Temporal.Now.timeZoneId
          ? Temporal.Now.timeZoneId()
          : null
      port.postMessage({
        ok: true,
        timeZone: timeZone,
        offsetMinutes: offsetMinutes,
        temporalTimeZone: temporalTimeZone,
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
