/**
 * Module Worker probe script — served from a real URL with type: "module".
 * Reports timezone data back to the parent via postMessage.
 */
self.onmessage = function () {
  try {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    const offsetMinutes = new Date().getTimezoneOffset()
    const temporalTimeZone =
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null
    self.postMessage({ ok: true, timeZone, offsetMinutes, temporalTimeZone })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
