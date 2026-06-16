/**
 * Safe monotonic clock.
 *
 * `performance.now()` is the right tool for measuring durations, but it
 * cannot be assumed to exist. Some hardened browser profiles and
 * anti-fingerprinting extensions deliberately neutralize the Performance
 * API — and they do not always do it cleanly. Instead of leaving
 * `performance` undefined, they sometimes set `window.performance = null`.
 *
 * That detail matters: a guard like
 *
 *   typeof performance !== "undefined" && typeof performance.now === "function"
 *
 * still throws, because `typeof null === "object"` passes the first check
 * and `null.now` then throws a TypeError. A single unguarded call at
 * module-load time is enough to abort the whole bundle's initialization,
 * which is exactly the "site crashes on my work laptop but not my
 * personal one" symptom.
 *
 * `now()` returns a millisecond timestamp suitable for duration math. It
 * prefers `performance.now()`, falls back to `Date.now()`, and never
 * throws.
 */
export function now(): number {
  try {
    const perf: Performance | null | undefined = (
      globalThis as { performance?: Performance | null }
    ).performance
    if (perf != null && typeof perf.now === "function") {
      return perf.now()
    }
  } catch {
    // fall through to Date.now()
  }
  return Date.now()
}
