/**
 * Coordinate → timezone resolution for the /verify page.
 *
 * Uses `browser-geo-tz` against the boundary data served from cdn.geospoof.com —
 * a CloudFront distribution over a private S3 bucket (provisioned by the CDK app
 * in cdk/). The library only range-fetches the small shard it needs per lookup,
 * so the client stays light while the full dataset lives at the CloudFront edge.
 *
 * Why cdn.geospoof.com (not jsdelivr, not the Vercel same-origin copy):
 *   - cdn.geospoof.com is the SAME SITE as the verify page (same eTLD+1,
 *     geospoof.com), so this cross-origin fetch is NOT subject to Safari's
 *     cross-site tracking prevention. The distribution returns
 *     Access-Control-Allow-Origin: * and consistent `206` range responses.
 *   - jsdelivr served the immutable `.dat` as `200` (whole file) on a cache hit
 *     but `206` on a miss; Safari's range/cache layer mishandled that
 *     inconsistency into intermittent 416s that silently broke the
 *     "does your timezone match your coordinates?" check.
 *   - Serving from the CDN (rather than the Vercel same-origin /geo-tz/ copy)
 *     also keeps this data off the main site's bandwidth budget.
 *
 * We use the full `timezones.geojson` dataset (not the `-1970` variant) to match
 * the extension's own resolution (`src/background/timezone.ts`), which avoids
 * the 1970 variant because it lands coastal points in Etc/GMT zones.
 *
 * SSR-safe: the geo-tz instance is created lazily on first call, which only
 * happens from a browser effect. Nothing here touches the network or a browser
 * global at import time.
 */

// CDN paths to the boundary data (CloudFront over S3, provisioned by cdk/).
//
// VERSIONED by the geo-tz data version. The `.index.json` (table of contents)
// and the `.dat` it indexes are fetched separately and cached `immutable`; if
// the data ever changes under a stable URL, a returning visitor could pair a
// stale cached index with new `.dat` byte ranges and get silently wrong
// lookups. A version in the path means new data = new URL, so the pair can
// never mismatch. This literal MUST equal the geo-tz package version; the build
// (scripts/copy-geo-tz-data.mjs) fails loudly if it drifts.
const GEO_TZ_DATA_VERSION = "8.1.6"
const GEO_TZ_BASE = `https://cdn.geospoof.com/geo-tz/${GEO_TZ_DATA_VERSION}`
const GEO_TZ_DATA_URL = `${GEO_TZ_BASE}/timezones.geojson.geo.dat`
const GEO_TZ_INDEX_URL = `${GEO_TZ_BASE}/timezones.geojson.index.json`

type GeoTzFinder = { find: (lat: number, lon: number) => Promise<Array<string>> }

let finderPromise: Promise<GeoTzFinder> | null = null

function getFinder(): Promise<GeoTzFinder> {
  if (finderPromise) return finderPromise
  finderPromise = import("browser-geo-tz")
    .then((mod) =>
      (mod.init as (geoUrl: string, indexUrl: string) => GeoTzFinder)(
        GEO_TZ_DATA_URL,
        GEO_TZ_INDEX_URL
      )
    )
    .catch((err) => {
      // Reset so a transient import/init failure can be retried on the next call
      // rather than being cached as a permanently-rejected promise.
      finderPromise = null
      throw err
    })
  return finderPromise
}

/**
 * Resolve the IANA timezone for a coordinate. Returns null on any failure
 * (boundary data unavailable, point over open water with no zone, etc.).
 *
 * Retries once: the same-origin range fetch is reliable, but a transient hiccup
 * (cold edge cache, dropped connection) shouldn't leave the verify row stuck —
 * the caller treats null as "couldn't verify" rather than "no leak".
 */
export async function timezoneForCoordinates(
  lat: number,
  lon: number
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const finder = await getFinder()
      const zones = await finder.find(lat, lon)
      return zones[0] ?? null
    } catch {
      // Drop the cached finder so the retry re-initializes (re-fetches index).
      finderPromise = null
      if (attempt === 1) return null
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  return null
}

/**
 * The current UTC offset of an IANA zone, expressed in the same convention
 * as `Date.prototype.getTimezoneOffset()` — positive minutes mean *west* of
 * UTC (e.g. New York in winter returns +300). Returns null if the zone can't
 * be resolved by the engine.
 *
 * Sub-minute precision: pre-standard-time (LMT) offsets carry seconds, e.g.
 * Asia/Tokyo in 1880 is `GMT+9:18:59`. We parse the seconds and return a
 * fractional result so it matches Firefox/Gecko's native `getTimezoneOffset`
 * (which preserves the fraction). Chrome/V8 truncates that same value to a
 * whole minute natively, so callers comparing against a live browser offset
 * should allow a sub-minute tolerance rather than exact equality.
 */
export function getTimezoneOffsetConvention(
  identifier: string,
  at: Date = new Date()
): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: identifier,
      timeZoneName: "shortOffset",
    })
    const part = fmt.formatToParts(at).find((p) => p.type === "timeZoneName")
    const value = part ? part.value : "GMT"
    if (value === "GMT" || value === "UTC") return 0
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(value)
    if (!m) return null
    // shortOffset is east-positive (GMT+9 → +540); getTimezoneOffset is
    // west-positive, so negate.
    const sign = m[1] === "+" ? 1 : -1
    const mins = m[3] ? parseInt(m[3], 10) : 0
    const secs = m[4] ? parseInt(m[4], 10) : 0
    const eastMinutes = sign * (parseInt(m[2], 10) * 60 + mins + secs / 60)
    return -eastMinutes
  } catch {
    return null
  }
}
