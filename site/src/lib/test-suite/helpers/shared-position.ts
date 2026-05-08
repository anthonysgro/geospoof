/**
 * Shared, run-scoped `GeolocationPosition` cache.
 *
 * Most of the tampering-shape tests (own-property-names, own-symbols,
 * toJSON shape, Symbol.toStringTag, prototype-layout, etc.) need a
 * single `GeolocationPosition` object to inspect. They don't actually
 * need a fresh GPS fix — they're reading the object's structure, not
 * its coordinates. Issuing independent `getCurrentPosition` calls from
 * each test was causing two separate problems:
 *
 *   1. Safari serialises concurrent / rapid-fire geolocation calls.
 *      The second/third/nth call queues behind the first, some drop,
 *      and many tests hit their 5s timeout. On the user's trace this
 *      produced 10+ spurious "did not resolve within 5000ms" errors
 *      in a single run.
 *   2. Even when calls succeed, native readings jitter by a few
 *      meters between samples, which can push the coords across a
 *      4-decimal-place rounding boundary (40.76245 → "40.7624" on one
 *      call, "40.7625" on the next). That looked like a precision
 *      mismatch but was just two independent samples.
 *
 * Both problems go away if we share one position across every shape
 * test within a run. We always request `maximumAge: Infinity` so the
 * browser serves whatever it has cached natively (the identity
 * panel's own call primes that cache), which also makes the suite
 * dramatically faster on every engine.
 *
 * The cache is scoped to the current `TestRunContext.signal` — a
 * fresh "Run again" produces a new AbortController, so the cache is
 * transparently invalidated when the user re-runs the suite. This
 * also guarantees we don't leak stale positions between the dashboard's
 * "initial run" and a later "run again" when the Identity Panel has
 * been refreshed.
 *
 * The Identity Panel also seeds the cache with its own initial
 * `getCurrentPosition` call via `primeSharedPosition`, so the panel
 * and the tests read from the exact same object. Without that seed,
 * two independent calls can produce readings that straddle a 4dp
 * rounding boundary and make tests falsely fail.
 */

import type { TestRunContext } from "../types"

const POSITION_TIMEOUT_MS = 5_000

/**
 * Per-run cache. The key is the AbortSignal of the current run — fresh
 * runs get a fresh signal, so they miss the cache naturally.
 */
const cacheByRun = new WeakMap<AbortSignal, Promise<GeolocationPosition>>()

/**
 * Identity-panel-seeded default position. When the Identity Panel
 * obtains a position it calls `primeSharedPosition(pos)`; subsequent
 * `getSharedPosition` calls (before any run-scoped entry is created)
 * resolve to this object. Cleared when the panel refreshes so we
 * don't hand out a stale position after a "Run again".
 */
let seededPosition: GeolocationPosition | null = null

/**
 * Seed the shared cache with a position the Identity Panel already
 * obtained. Call this from the provider's `getLocation` success
 * callback before tests start running. Clearing the seed to null
 * when refreshing is safe; the run-scoped map handles the per-run
 * lifetime on its own.
 */
export function primeSharedPosition(pos: GeolocationPosition | null): void {
  seededPosition = pos
}

/**
 * Fetch a `GeolocationPosition` for the current run, reusing the
 * previously-resolved position if one is available. Subsequent
 * callers within the same run receive the same Promise, so they all
 * share the same position object.
 *
 * The call is issued with `maximumAge: Infinity`, which tells the
 * browser "any cached position is fine" — combined with the Identity
 * Panel's earlier call that primed the cache, this typically returns
 * synchronously (sub-millisecond) on every engine.
 *
 * Falls back to issuing a fresh call when no cached position exists
 * and rejects cleanly on timeout so the caller's `observe()` can
 * report a normal error rather than hanging the whole suite.
 */
export function getSharedPosition(
  ctx: TestRunContext
): Promise<GeolocationPosition> {
  const existing = cacheByRun.get(ctx.signal)
  if (existing) return existing

  // If the Identity Panel has already captured a position for this
  // run, hand it back directly. This guarantees the panel and the
  // tests read from the exact same object — without it, two
  // independent `getCurrentPosition` calls can produce readings that
  // straddle a 4-decimal-place rounding boundary (e.g. the panel sees
  // -73.98645 → "40.7625, -73.9864" and a test sees -73.98650 →
  // "40.7625, -73.9865"), causing false precision-mismatch failures.
  if (seededPosition !== null) {
    const cached = Promise.resolve(seededPosition)
    cacheByRun.set(ctx.signal, cached)
    return cached
  }

  const pending = new Promise<GeolocationPosition>((resolve, reject) => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.geolocation === "undefined"
    ) {
      reject(new Error("navigator.geolocation is not available"))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          `getCurrentPosition did not resolve within ${POSITION_TIMEOUT_MS}ms`
        )
      )
    }, POSITION_TIMEOUT_MS)
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(pos)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new Error(`getCurrentPosition error: ${err.message}`))
        },
        {
          // Always accept a cached fix — the Identity Panel already
          // primed the browser's cache, and every subsequent test in
          // the run wants the same cached position.
          maximumAge: Number.POSITIVE_INFINITY,
          timeout: POSITION_TIMEOUT_MS,
        }
      )
    } catch (err) {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })

  cacheByRun.set(ctx.signal, pending)

  // If the call rejects, drop the cached promise so a subsequent test
  // in the same run gets a fresh attempt rather than a permanent
  // rejection for the rest of the run.
  pending.catch(() => {
    cacheByRun.delete(ctx.signal)
  })

  return pending
}
