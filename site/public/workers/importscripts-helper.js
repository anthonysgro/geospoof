/**
 * Helper script loaded via importScripts inside a Worker.
 * Reads timezone data and stores it on self for the parent to read.
 */
try {
  self.__helperResult = {
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: new Date().getTimezoneOffset(),
  }
} catch (err) {
  self.__helperResult = {
    error: err && err.message ? err.message : String(err),
  }
}
