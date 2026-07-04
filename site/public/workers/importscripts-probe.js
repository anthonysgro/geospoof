/**
 * Classic Worker that uses importScripts to load a secondary script.
 * Tests whether importScripts-loaded code also sees the spoofed timezone.
 */
importScripts("./importscripts-helper.js")

self.onmessage = function () {
  // __helperResult is set by the imported script
  try {
    var direct = {
      timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      offsetMinutes: new Date().getTimezoneOffset(),
      temporalTimeZone:
        typeof Temporal !== "undefined" &&
        Temporal.Now &&
        Temporal.Now.timeZoneId
          ? Temporal.Now.timeZoneId()
          : null,
    }
    self.postMessage({
      ok: true,
      direct: direct,
      imported: self.__helperResult || null,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
