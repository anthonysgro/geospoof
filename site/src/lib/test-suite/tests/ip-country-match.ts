/**
 * IP location vs. spoofed location cross-checks.
 *
 * The detection vector: fingerprinting scripts commonly cross-check a
 * user's public IP against their browser-reported geolocation. Two
 * grains matter, and real fraud stacks check them at different
 * thresholds:
 *
 *   1. **Country match** — nearly universal. Ticket sellers, banks,
 *      streaming services, anti-fraud platforms (Sift, Radar, iovation,
 *      Kount) all compare IP country to geolocation country. A
 *      different country is a near-certain "this user is manipulating
 *      location" signal.
 *
 *   2. **Regional proximity** — used by ticketing, delivery, and
 *      geo-fenced content providers. Same country but 3,000km apart
 *      (e.g. US IP in NY spoofing to LA) trips fine-grained fraud
 *      models even when country-level matches. Roughly "same
 *      metropolitan region" is the standard threshold; we use 500km
 *      which maps to regional-scale plausibility in most countries.
 *
 * Neither gap can be closed by a browser extension alone — the only
 * way to align IP geolocation with the spoofed coords is to route
 * traffic through a VPN exit in the spoofed region. These tests
 * surface the remaining exposure so users understand why GeoSpoof
 * recommends pairing with a VPN (and why the extension ships a VPN
 * Sync feature).
 *
 * ## Network calls
 *
 * Unlike every other test in this suite, these two make external
 * network calls. Both tests share a single run-scoped cache so the
 * actual HTTP traffic is one successful lookup per run.
 *
 * Providers mirror those used by the extension's VPN Sync module so
 * users on strict privacy settings (Firefox ETP, uBlock) don't see
 * different behaviour here than in the extension itself:
 *
 *   - Primary: `https://get.geojs.io/v1/ip/geo.json` — one-shot
 *     lookup that returns IP + country + lat/lon for the caller.
 *     CORS-friendly, no API key, not on any tracking blocklist.
 *   - Fallback: `https://free.freeipapi.com/api/json` — same data
 *     shape at a different origin, used when geojs is blocked.
 *   - `https://nominatim.openstreetmap.org/reverse` — reverse
 *     geocoding for the spoofed coordinates' country.
 *
 * Both tests skip rather than error on any network failure — a
 * hiccup or a blocklist isn't a regression signal.
 *
 * Browser-global access lives inside the callbacks, so the module
 * is safe to dynamic-import from `loadAllTests`.
 */

import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import { requireLocationSnapshot } from "../helpers/location"
import type { TestDefinition, TestRunContext } from "../types"

const GEOJS_URL = "https://get.geojs.io/v1/ip/geo.json"
const FREEIPAPI_URL = "https://free.freeipapi.com/api/json"
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
const LOOKUP_TIMEOUT_MS = 8_000
/**
 * Distance threshold (in km) above which the regional-proximity test
 * fails. 500km maps to roughly "same metropolitan region" / "same
 * coastline" in most countries — coarse enough to avoid carrier-geoip
 * false positives while still catching "US IP in New York spoofing to
 * Los Angeles" style mismatches.
 */
const REGION_DISTANCE_THRESHOLD_KM = 500

interface IpCountryResult {
  ip: string
  countryCode: string
  countryName: string
  latitude: number | null
  longitude: number | null
  city: string
  region: string
}

interface ReverseCountryResult {
  countryCode: string
  countryName: string
}

// geojs.io returns coordinates as strings. Most other fields are strings too.
interface GeojsResponse {
  ip?: unknown
  country_code?: unknown
  country?: unknown
  latitude?: unknown
  longitude?: unknown
  city?: unknown
  region?: unknown
}

// freeipapi returns coordinates as numbers and uses camelCase.
interface FreeipapiResponse {
  ipAddress?: unknown
  countryCode?: unknown
  countryName?: unknown
  latitude?: unknown
  longitude?: unknown
  cityName?: unknown
  regionName?: unknown
}

interface NominatimReverseResponse {
  error?: unknown
  address?: {
    country_code?: unknown
    country?: unknown
  }
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Coerce a coordinate value (number or numeric string) to a finite
 * number, or null when it can't be parsed. geojs serialises coords as
 * strings; freeipapi as numbers.
 */
function coerceCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

async function resolveViaGeojs(): Promise<IpCountryResult> {
  const res = await fetchWithTimeout(
    GEOJS_URL,
    { cache: "no-store" },
    LOOKUP_TIMEOUT_MS
  )
  if (!res.ok) throw new Error(`geojs.io returned ${res.status}`)
  const data = (await res.json()) as GeojsResponse
  if (
    typeof data.ip !== "string" ||
    typeof data.country_code !== "string" ||
    data.country_code.length !== 2
  ) {
    throw new Error("geojs.io returned an unexpected shape")
  }
  return {
    ip: data.ip,
    countryCode: data.country_code.toUpperCase(),
    countryName: typeof data.country === "string" ? data.country : "",
    latitude: coerceCoord(data.latitude),
    longitude: coerceCoord(data.longitude),
    city: typeof data.city === "string" ? data.city : "",
    region: typeof data.region === "string" ? data.region : "",
  }
}

async function resolveViaFreeipapi(): Promise<IpCountryResult> {
  const res = await fetchWithTimeout(
    FREEIPAPI_URL,
    { cache: "no-store" },
    LOOKUP_TIMEOUT_MS
  )
  if (!res.ok) throw new Error(`freeipapi returned ${res.status}`)
  const data = (await res.json()) as FreeipapiResponse
  if (
    typeof data.ipAddress !== "string" ||
    typeof data.countryCode !== "string" ||
    data.countryCode.length !== 2
  ) {
    throw new Error("freeipapi returned an unexpected shape")
  }
  return {
    ip: data.ipAddress,
    countryCode: data.countryCode.toUpperCase(),
    countryName: typeof data.countryName === "string" ? data.countryName : "",
    latitude: coerceCoord(data.latitude),
    longitude: coerceCoord(data.longitude),
    city: typeof data.cityName === "string" ? data.cityName : "",
    region: typeof data.regionName === "string" ? data.regionName : "",
  }
}

/**
 * Resolve the public IP's geoip data, trying geojs.io first and
 * falling through to freeipapi on any failure. Throws `SkipTestError`
 * only when both providers fail — the common cases (one provider
 * blocked by tracking protection) still resolve cleanly.
 */
async function resolvePublicIpLocation(): Promise<IpCountryResult> {
  const errors: Array<string> = []
  try {
    return await resolveViaGeojs()
  } catch (err) {
    errors.push(
      `geojs: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  try {
    return await resolveViaFreeipapi()
  } catch (err) {
    errors.push(
      `freeipapi: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  throw new SkipTestError(`IP geolocation failed — ${errors.join(" · ")}`)
}

/**
 * Reverse-geocode the spoofed coordinates to a country via Nominatim.
 * Throws `SkipTestError` on any failure.
 */
async function resolveSpoofedCountry(
  latitude: number,
  longitude: number
): Promise<ReverseCountryResult> {
  const url = new URL(NOMINATIM_REVERSE_URL)
  url.searchParams.set("lat", String(latitude))
  url.searchParams.set("lon", String(longitude))
  url.searchParams.set("format", "json")
  url.searchParams.set("addressdetails", "1")
  // Zoom 10 ≈ city level. Nominatim's reverse endpoint at zoom 10
  // does a named-feature lookup and always populates the full
  // address hierarchy (including country_code) when the coords fall
  // on any known landmass. Lower values (e.g. zoom 3) hit the
  // country-polygon index which has spotty coverage in some
  // regions — reports of this vary, but Azerbaijan/Baku is a
  // known gap. Using 10 is reliable at the cost of a marginally
  // larger response body, which we don't care about.
  url.searchParams.set("zoom", "10")

  let res: Response
  try {
    res = await fetchWithTimeout(
      url.toString(),
      {
        cache: "no-store",
        headers: { "Accept-Language": "en" },
      },
      LOOKUP_TIMEOUT_MS
    )
  } catch (err) {
    throw new SkipTestError(
      `nominatim request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!res.ok) {
    throw new SkipTestError(`nominatim returned ${res.status}`)
  }
  let data: NominatimReverseResponse
  try {
    data = (await res.json()) as NominatimReverseResponse
  } catch {
    throw new SkipTestError("nominatim returned non-JSON body")
  }
  // Nominatim returns HTTP 200 with `{ error: "Unable to geocode" }`
  // on coords that miss every polygon at the requested zoom (happens
  // mid-ocean, over poles, and — before we bumped to zoom 10 — for
  // certain countries like Azerbaijan at low zoom). Surface the
  // server's own reason rather than our generic "no country code"
  // when this happens.
  if (typeof data.error === "string") {
    throw new SkipTestError(`nominatim: ${data.error}`)
  }
  const code = data.address?.country_code
  const name = data.address?.country
  if (typeof code !== "string" || code.length !== 2) {
    throw new SkipTestError(
      "nominatim did not return a country code for the spoofed coordinates"
    )
  }
  return {
    countryCode: code.toUpperCase(),
    countryName: typeof name === "string" ? name : "",
  }
}

// ---------------------------------------------------------------------------
// Run-scoped cache
// ---------------------------------------------------------------------------

interface SharedLookup {
  ip: IpCountryResult
  spoofed: ReverseCountryResult
  spoofedLat: number
  spoofedLon: number
}

const cache = new WeakMap<TestRunContext, Promise<SharedLookup>>()

async function getSharedLookup(ctx: TestRunContext): Promise<SharedLookup> {
  const cached = cache.get(ctx)
  if (cached) return cached
  const promise = (async (): Promise<SharedLookup> => {
    const location = await requireLocationSnapshot(ctx)
    const [ip, spoofed] = await Promise.all([
      resolvePublicIpLocation(),
      resolveSpoofedCountry(location.latitude, location.longitude),
    ])
    return {
      ip,
      spoofed,
      spoofedLat: location.latitude,
      spoofedLon: location.longitude,
    }
  })()
  cache.set(ctx, promise)
  promise.catch(() => cache.delete(ctx))
  return promise
}

// ---------------------------------------------------------------------------
// Distance (Haversine)
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`
  if (km < 1000) return `${Math.round(km)} km`
  return `${(km / 1000).toFixed(1)}k km`
}

function labelCountry(code: string, name: string): string {
  return name ? `${code} (${name})` : code
}

// ---------------------------------------------------------------------------
// Test 1 — Country-level match
// ---------------------------------------------------------------------------

const ipCountryMatchTest = buildBehavioralTest<string>({
  id: "tampering.ip.country-matches-spoofed-location",
  group: "geolocation-stealth",
  name: "Public IP country matches the spoofed location country",
  description:
    "Fingerprinting scripts cross-check a visitor's IP-derived country against the country implied by their reported geolocation. A country mismatch is the most common reason a spoofed location gets rejected — streaming services, ticket sellers, banks, and anti-fraud platforms all watch for it. Closing the gap requires routing traffic through a VPN exit in the spoofed country; GeoSpoof's VPN Sync feature is built around this. Makes external network calls to geojs.io (with freeipapi fallback) and nominatim.openstreetmap.org.",
  technique:
    "Fetch the public IP's country code from geojs.io, reverse-geocode the spoofed coordinates via Nominatim, and compare the two 2-letter ISO codes.",
  codeSnippet: `const ip = await fetch("https://get.geojs.io/v1/ip/geo.json").then(r => r.json())
const rev = await fetch(\`https://nominatim.openstreetmap.org/reverse?lat=\${lat}&lon=\${lon}&format=json\`).then(r => r.json())
ip.country_code === rev.address.country_code`,
  expected: async (ctx) => {
    const { spoofed } = await getSharedLookup(ctx)
    return {
      value: spoofed.countryCode,
      describe: `IP country = ${labelCountry(spoofed.countryCode, spoofed.countryName)}`,
    }
  },
  observe: async (ctx) => {
    const { ip, spoofed } = await getSharedLookup(ctx)
    return {
      value: ip.countryCode,
      describe: `IP: ${labelCountry(ip.countryCode, ip.countryName)} · Spoofed: ${labelCountry(spoofed.countryCode, spoofed.countryName)}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Test 2 — Regional proximity (same country AND within threshold)
// ---------------------------------------------------------------------------

const ipRegionProximityTest = buildBehavioralTest<boolean>({
  id: "tampering.ip.location-within-regional-distance",
  group: "geolocation-stealth",
  name: `Public IP is within ${REGION_DISTANCE_THRESHOLD_KM} km of the spoofed location`,
  description: `Ticketing, delivery, and geo-fenced services go beyond country match and check regional plausibility. A ${REGION_DISTANCE_THRESHOLD_KM} km threshold maps roughly to "same metropolitan region" in most countries — tight enough to catch intra-country spoofing (e.g. a New York IP claiming Los Angeles coordinates) but loose enough to avoid carrier-geoip false positives. An extension can't change this; pairing with a VPN exit near the spoofed coordinates is the only fix.`,
  technique: `Using the IP's returned latitude and longitude, compute great-circle distance (Haversine) to the spoofed coordinates and check it's under ${REGION_DISTANCE_THRESHOLD_KM} km.`,
  codeSnippet: `const ip = await fetch("https://get.geojs.io/v1/ip/geo.json").then(r => r.json())
const distanceKm = haversine(ip.latitude, ip.longitude, spoofedLat, spoofedLon)
distanceKm < ${REGION_DISTANCE_THRESHOLD_KM}`,
  expected: async () => {
    return {
      value: true,
      describe: `under ${REGION_DISTANCE_THRESHOLD_KM} km`,
    }
  },
  observe: async (ctx) => {
    const { ip, spoofedLat, spoofedLon } = await getSharedLookup(ctx)
    if (ip.latitude === null || ip.longitude === null) {
      throw new SkipTestError(
        "IP geolocation provider did not return latitude/longitude"
      )
    }
    const distanceKm = haversineKm(
      ip.latitude,
      ip.longitude,
      spoofedLat,
      spoofedLon
    )
    const withinThreshold = distanceKm < REGION_DISTANCE_THRESHOLD_KM
    const where = [ip.city, ip.region].filter(Boolean).join(", ")
    return {
      value: withinThreshold,
      describe: where
        ? `${formatKm(distanceKm)} apart (IP near ${where})`
        : `${formatKm(distanceKm)} apart`,
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const ipCountryMatchTests: ReadonlyArray<TestDefinition> = [
  ipCountryMatchTest,
  ipRegionProximityTest,
]
