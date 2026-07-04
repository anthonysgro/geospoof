/**
 * Service Worker probe script — served from a real URL.
 *
 * Reports its timezone via BroadcastChannel since service workers
 * communicate via message channels rather than direct postMessage
 * on a worker instance.
 *
 * Note: service workers require same-origin HTTPS and a stable URL.
 * This file must be served from /workers/service-probe.js for the
 * test to successfully register it.
 */

self.addEventListener("install", (event) => {
  // Skip waiting so the worker activates immediately on first install
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  // Claim any open clients so we can message them right away
  event.waitUntil(self.clients.claim())
})

self.addEventListener("message", function (event) {
  try {
    var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    var offsetMinutes = new Date().getTimezoneOffset()
    var temporalTimeZone =
      typeof Temporal !== "undefined" && Temporal.Now && Temporal.Now.timeZoneId
        ? Temporal.Now.timeZoneId()
        : null
    var channelName =
      (event.data && event.data.channel) || "geospoof-service-probe"
    var bc = new BroadcastChannel(channelName)
    bc.postMessage({
      ok: true,
      timeZone: timeZone,
      offsetMinutes: offsetMinutes,
      temporalTimeZone: temporalTimeZone,
    })
    bc.close()
  } catch (err) {
    try {
      var bc2 = new BroadcastChannel(
        (event.data && event.data.channel) || "geospoof-service-probe"
      )
      bc2.postMessage({
        ok: false,
        error: err && err.message ? err.message : String(err),
      })
      bc2.close()
    } catch (_) {
      // Nothing more we can do
    }
  }
})
