/**
 * Helper script loaded via importScripts inside a Worker.
 * Reads timezone data and stores it on self for the parent to read.
 */
try {
  self.__helperResult = {
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: new Date().getTimezoneOffset(),
    temporalTimeZone:
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null,
  }
} catch (err) {
  self.__helperResult = {
    error: err && err.message ? err.message : String(err),
  }
}
