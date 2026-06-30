/**
 * Early timezone probe.
 *
 * This module exists to capture a reading of the browser's timezone
 * as early as JavaScript can possibly run on the page — at module-load
 * time, before any React component mounts, before any lifecycle effect
 * fires, before any await resolves. The captured value is compared
 * later against the settled timezone to detect whether a page-load
 * timing race was won or lost.
 *
 * The race: a browser extension that overrides `Intl.DateTimeFormat`
 * installs its overrides at `document_start`, but the actual spoofing
 * settings arrive asynchronously via a background-script round-trip.
 * During that window (typically 50-250ms on cold page load), any
 * timezone read falls through to the real system zone. A commercial
 * fingerprinting script executes its timezone probe synchronously in
 * `<head>`, specifically to hit this window. Our "early probe" does
 * the same thing — reads `Intl.DateTimeFormat().resolvedOptions()
 * .timeZone` at the earliest possible moment — so the downstream test
 * suite can report whether the extension won or lost the race.
 *
 * This module is evaluated the first time any file imports from it.
 * Consumers should import it as early as possible in the dashboard's
 * import graph. The value is cached on first read and never changes.
 *
 * SSR safety: the IIFE is wrapped in a `typeof Intl` guard so Node
 * imports without exploding.
 */

import { now } from "./safe-time"

/**
 * Timezone identifier captured at earliest module-load time, before
 * any React lifecycle. `null` when `Intl` isn't available (SSR) or
 * when the read threw.
 */
export const EARLY_TIMEZONE_PROBE: string | null = (() => {
  try {
    if (
      typeof Intl === "undefined" ||
      typeof Intl.DateTimeFormat !== "function"
    ) {
      return null
    }
    return new Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return null
  }
})()

/**
 * Millisecond timestamp of when the probe was taken. Used by the
 * race test to report how early in the page lifecycle the read
 * happened.
 */
export const EARLY_TIMEZONE_PROBE_AT: number = (() => {
  try {
    return now()
  } catch {
    return 0
  }
})()
