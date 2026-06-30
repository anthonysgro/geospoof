/**
 * Classic Worker probe script — served from a real URL.
 * Reports timezone data back to the parent via postMessage.
 */
self.onmessage = function () {
  try {
    var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    var offsetMinutes = new Date().getTimezoneOffset()
    self.postMessage({
      ok: true,
      timeZone: timeZone,
      offsetMinutes: offsetMinutes,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
