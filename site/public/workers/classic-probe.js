/**
 * Classic Worker probe script — served from a real URL.
 * Reports timezone data back to the parent via postMessage.
 */
self.onmessage = function () {
  try {
    var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    var offsetMinutes = new Date().getTimezoneOffset()
    var temporalTimeZone =
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null
    self.postMessage({
      ok: true,
      timeZone: timeZone,
      offsetMinutes: offsetMinutes,
      temporalTimeZone: temporalTimeZone,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
