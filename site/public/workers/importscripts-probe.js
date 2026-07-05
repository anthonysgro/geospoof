/**
 * Classic Worker that uses importScripts to load a secondary script.
 * Tests whether importScripts-loaded code also sees the spoofed timezone.
 */
importScripts("./tz-signature.js")
importScripts("./importscripts-helper.js")

self.onmessage = function (e) {
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
    // Compute the full signature via imported code (self.__tzSignature), and
    // attach it to the imported result so the parity card reads it off the
    // importScripts-loaded surface.
    var imported = self.__helperResult || null
    var sigBase = e && e.data && e.data.sigBase
    if (imported && sigBase != null && self.__tzSignature) {
      imported.sig = self.__tzSignature(sigBase)
    }
    if (imported && self.__methodFidelity) {
      imported.fidelity = self.__methodFidelity()
    }
    self.postMessage({
      ok: true,
      direct: direct,
      imported: imported,
    })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
