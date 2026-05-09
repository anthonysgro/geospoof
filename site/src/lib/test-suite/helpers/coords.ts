/**
 * Coordinate comparison helpers shared across geolocation tests.
 *
 * ### Why not just compare `.toFixed(4) === .toFixed(4)`?
 *
 * Earlier versions of these tests compared coordinates to 4 decimal
 * places by stringifying both sides with `.toFixed(4)`. That works
 * fine when both values come from the same cached snapshot, but
 * breaks in two real-world cases:
 *
 *   1. **Safari CoreLocation jitter.** Native geolocation on macOS
 *      re-triangulates from WiFi / cell towers on each live
 *      `getCurrentPosition` / `watchPosition` call. Two calls a few
 *      milliseconds apart can differ by 1-2 meters. At ~40° latitude,
 *      1m ≈ 0.00001°, so a raw value sitting near a rounding boundary
 *      (e.g. `40.76245...`) can round to `40.7624` on one call and
 *      `40.7625` on the next — a failed 4dp string compare, even
 *      though the two positions are 1m apart.
 *
 *   2. **Shared-position cache hits across independent calls.** When
 *      one test reads from the run-shared position cache and another
 *      issues a fresh live call, Safari's fresh call may produce a
 *      slightly different reading than the cached one for the same
 *      reason. Firefox and Chromium both cache more aggressively so
 *      this doesn't show up there.
 *
 * ### What we use instead
 *
 * `coordsMatchWithin(a, b, toleranceMeters)` computes the great-
 * circle distance between the two coordinate pairs (via the
 * haversine formula) and returns true when it's under the supplied
 * threshold. We default the threshold to 15 meters — well below any
 * real spoofing-detection vector (which is concerned with whole-
 * city-scale accuracy) but well above any native-CoreLocation
 * jitter a stationary desktop machine produces.
 *
 * ### Why 15 meters specifically
 *
 * Three anchoring facts:
 *   - `navigator.geolocation` on desktop reports `accuracy` values
 *     in the 10-50m range (Wi-Fi / MLS). A real user reading their
 *     own position back to themselves 100ms later gets values
 *     inside that accuracy circle.
 *   - 4-decimal-place equivalence used to be our threshold; 4dp ≈
 *     11m at the equator, 8m at 40°, 5m at 60°. 15m cleanly
 *     encompasses the worst case of 4dp-equivalent comparisons that
 *     genuinely agree to within a rounding boundary.
 *   - A spoofer that emits "same continent, wrong city" coords —
 *     or even "wrong block" — is tens of kilometers away from the
 *     expected value, not 15m. So 15m is too tight to miss real
 *     detection signals.
 *
 * If a specific test needs a tighter bound (e.g. a cache-identity
 * check that expects byte-exact reproduction), pass a smaller
 * tolerance explicitly.
 */

export interface Coords {
  latitude: number
  longitude: number
}

/**
 * Default tolerance: 15 meters. See module doc for rationale.
 */
const DEFAULT_TOLERANCE_M = 15

/**
 * Earth mean radius in meters. The haversine formula uses this as
 * its single dimensional constant; any value in the 6,370-6,378 km
 * range produces results indistinguishable at the meter scale this
 * helper operates at. 6,371,000 is the WGS-84 "mean radius" used by
 * most geofencing libraries.
 */
const EARTH_MEAN_RADIUS_M = 6_371_000

/**
 * Great-circle distance between two coordinate pairs, in meters.
 * Uses the haversine formula — accurate to well under a meter for
 * the planet-wide inputs this helper takes, which is way below our
 * comparison tolerance.
 *
 * Exported so individual tests can render the measured distance in
 * their `describe` output when helpful for diagnostics.
 */
export function haversineMeters(a: Coords, b: Coords): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * True when `a` and `b` refer to the same real-world location
 * within `toleranceMeters`. Default tolerance (15 m) is well below
 * any real spoofing-detection signal and well above native-
 * CoreLocation jitter.
 *
 * Handles NaN / Infinity inputs safely — any non-finite value on
 * either side returns `false`, so an unparseable reading never
 * accidentally compares equal.
 */
export function coordsMatchWithin(
  a: Coords,
  b: Coords,
  toleranceMeters: number = DEFAULT_TOLERANCE_M,
): boolean {
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  ) {
    return false
  }
  return haversineMeters(a, b) <= toleranceMeters
}

/**
 * Convenience wrapper with the default 15m tolerance, suitable for
 * drop-in replacement of the old `coordsMatch4dp`. Kept separate
 * from `coordsMatchWithin` so callers reading the code can see at
 * a glance that they're using the shared default, not overriding it.
 */
export function coordsMatchApprox(a: Coords, b: Coords): boolean {
  return coordsMatchWithin(a, b, DEFAULT_TOLERANCE_M)
}
