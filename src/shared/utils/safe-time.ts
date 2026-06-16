/**
 * Safe monotonic clock for all extension contexts.
 *
 * `performance.now()` is ideal for duration math, but it cannot be
 * assumed to exist. Hardened browser profiles and anti-fingerprinting
 * extensions sometimes neutralize the Performance API by setting
 * `window.performance = null` rather than leaving it undefined.
 *
 * That breaks the common guard:
 *
 *   typeof performance !== "undefined" && typeof performance.now === "function"
 *
 * because `typeof null === "object"` passes the first check and
 * `null.now` then throws. A single unguarded `performance.now()` at the
 * top level of the content script is enough to abort initialization
 * before the message listener registers — which surfaces in the
 * background as "Content script not responding / Receiving end does not
 * exist."
 *
 * `now()` prefers `performance.now()`, falls back to `Date.now()`, and
 * never throws.
 */
export function now(): number {
  try {
    const perf: Performance | null | undefined = (
      globalThis as { performance?: Performance | null }
    ).performance;
    if (perf != null && typeof perf.now === "function") {
      return perf.now();
    }
  } catch {
    // fall through to Date.now()
  }
  return Date.now();
}
