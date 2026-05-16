/**
 * Module Worker probe script — served from a real URL with type: "module".
 * Reports timezone data back to the parent via postMessage.
 */
self.onmessage = function () {
  try {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMinutes = new Date().getTimezoneOffset();
    self.postMessage({ ok: true, timeZone, offsetMinutes });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
