/**
 * Coordinate → timezone resolution for the /verify page.
 *
 * Uses the same `browser-geo-tz` boundary data the extension itself uses to
 * decide which timezone a spoofed location should map to. That makes the
 * verify page's "does your timezone match your coordinates?" check use the
 * exact same source of truth the extension applied when spoofing.
 *
 * SSR-safe: the geo-tz instance is created lazily on first call, which only
 * happens from a browser effect. Nothing here touches the network or a
 * browser global at import time.
 */

// geo-tz version pinned to match the extension (src/background/timezone.ts)
// so the .dat and .index.json files are always a matched pair.
const GEO_TZ_VERSION = "8.1.5"

type GeoTzFinder = { find: (lat: number, lon: number) => Promise<Array<string>> }

let finderPromise: Promise<GeoTzFinder> | null = null

function getFinder(): Promise<GeoTzFinder> {
  if (finderPromise) return finderPromise
  finderPromise = import("browser-geo-tz").then((mod) =>
    (mod.init as (geoUrl: string, indexUrl: string) => GeoTzFinder)(
      `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones.geojson.geo.dat`,
      `https://cdn.jsdelivr.net/npm/geo-tz@${GEO_TZ_VERSION}/data/timezones.geojson.index.json`
    )
  )
  return finderPromise
}

/**
 * Resolve the IANA timezone for a coordinate. Returns null on any failure
 * (boundary data unavailable, point over open water with no zone, etc.).
 */
export async function timezoneForCoordinates(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const finder = await getFinder()
    const zones = await finder.find(lat, lon)
    return zones[0] ?? null
  } catch {
    return null
  }
}

/**
 * The current UTC offset of an IANA zone, expressed in the same convention
 * as `Date.prototype.getTimezoneOffset()` — positive minutes mean *west* of
 * UTC (e.g. New York in winter returns +300). Returns null if the zone can't
 * be resolved by the engine.
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
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value)
    if (!m) return null
    // shortOffset is east-positive (GMT+9 → +540); getTimezoneOffset is
    // west-positive, so negate.
    const sign = m[1] === "+" ? 1 : -1
    const mins = m[3] ? parseInt(m[3], 10) : 0
    const eastMinutes = sign * (parseInt(m[2], 10) * 60 + mins)
    return -eastMinutes
  } catch {
    return null
  }
}
