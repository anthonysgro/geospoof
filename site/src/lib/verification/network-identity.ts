/**
 * Client-side "network identity" lookup for the /verify leak detector.
 *
 * Reads what the *network* says about the visitor — the public IP and the
 * ISP / city / country / coordinates / timezone that IP geolocates to. This
 * is the server-visible side of the visitor's identity (what a VPN is
 * supposed to be masking), to be contrasted against what the *browser*
 * leaks client-side (HTML5 geolocation, system timezone, locale).
 *
 * Resolution order:
 *   1. Same-origin server function (`fetchEdgeNetworkIdentity`). Reads the IP
 *      and Vercel's geo headers server-side, so it can't be blocked by Safari's
 *      cross-site tracker prevention (which kills the third-party calls below),
 *      works behind iCloud Private Relay, and needs no external request.
 *   2. https://get.geojs.io/v1/ip/geo.json   (IP + geo + ISP + tz)
 *   3. https://free.freeipapi.com/api/json    (same data, no tz id)
 *
 * SSR-safe: no browser globals are touched at import time. `fetch` is only
 * called from `resolveNetworkIdentity`, which runs in a browser effect.
 */

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server"

const GEOJS_URL = "https://ipv4.geojs.io/v1/ip/geo.json"
const FREEIPAPI_URL = "https://free.freeipapi.com/api/json"
const LOOKUP_TIMEOUT_MS = 8_000

/**
 * The network's view of the visitor, normalized across providers.
 */
export interface NetworkIdentity {
  ip: string
  /** ISP / hosting org / VPN provider name, when the provider supplies it. */
  isp: string | null
  city: string
  region: string
  countryName: string
  /** 2-letter ISO country code, uppercased. */
  countryCode: string
  latitude: number | null
  longitude: number | null
  /** IANA timezone the IP geolocates to (geojs only), else null. */
  timezone: string | null
  /** Which provider answered. */
  provider: "edge" | "geojs" | "freeipapi"
}

/** Map a 2-letter ISO country code to its English name (e.g. "US" → "United States"). */
function countryNameFromCode(code: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? ""
  } catch {
    return ""
  }
}

/**
 * Same-origin server function: read the visitor's IP + geolocation straight
 * from the request headers the platform (Vercel) attaches. Returns null when
 * there's no usable public IP (e.g. local dev), so the client falls back to
 * the third-party providers.
 *
 * This is the reliable path on Safari / iCloud Private Relay, where the
 * browser-side calls to geojs/freeipapi get blocked as cross-site trackers.
 */
export const fetchEdgeNetworkIdentity = createServerFn({ method: "GET" }).handler(
  (): NetworkIdentity | null => {
    // Prevent Vercel's CDN (and browser) from caching this response — the
    // result depends on the caller's current IP, which changes on VPN switch.
    setResponseHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")

    const get = (name: string): string | null => {
      const v = getRequestHeader(name)
      return typeof v === "string" && v.trim().length > 0 ? v.trim() : null
    }

    // Vercel sets x-vercel-forwarded-for / x-forwarded-for to the client IP
    // (the Private Relay egress IP when that's on). Take the first hop.
    const ipRaw =
      get("x-vercel-forwarded-for") ?? get("x-forwarded-for") ?? get("x-real-ip")
    const ip = ipRaw ? ipRaw.split(",")[0].trim() : null

    // No usable public IP (local dev, loopback) — let the client fall back.
    if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.")) {
      return null
    }

    const countryCode = (get("x-vercel-ip-country") ?? "").toUpperCase()
    // Vercel URL-encodes the city/region (e.g. "New%20York").
    const decode = (v: string | null): string => {
      if (!v) return ""
      try {
        return decodeURIComponent(v)
      } catch {
        return v
      }
    }

    return {
      ip,
      isp: null,
      city: decode(get("x-vercel-ip-city")),
      region: decode(get("x-vercel-ip-country-region")),
      countryName: countryNameFromCode(countryCode),
      countryCode,
      latitude: get("x-vercel-ip-latitude")
        ? Number(get("x-vercel-ip-latitude"))
        : null,
      longitude: get("x-vercel-ip-longitude")
        ? Number(get("x-vercel-ip-longitude"))
        : null,
      timezone: get("x-vercel-ip-timezone"),
      provider: "edge",
    }
  }
)

interface GeojsResponse {
  ip?: unknown
  country?: unknown
  country_code?: unknown
  region?: unknown
  city?: unknown
  latitude?: unknown
  longitude?: unknown
  timezone?: unknown
  organization_name?: unknown
  organization?: unknown
}

interface FreeipapiResponse {
  ipAddress?: unknown
  countryName?: unknown
  countryCode?: unknown
  regionName?: unknown
  cityName?: unknown
  latitude?: unknown
  longitude?: unknown
}

function coerceCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Strip a leading "ASxxxxx " token geojs prepends to `organization`, so the
 * ISP reads as a clean name ("Mullvad VPN" not "AS3856 Mullvad VPN").
 */
function cleanIsp(orgName: string, org: string): string | null {
  const raw = orgName || org
  if (!raw) return null
  return raw.replace(/^AS\d+\s+/i, "").trim() || null
}

async function resolveViaGeojs(): Promise<NetworkIdentity> {
  const res = await fetchWithTimeout(GEOJS_URL, LOOKUP_TIMEOUT_MS)
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
    isp: cleanIsp(str(data.organization_name), str(data.organization)),
    city: str(data.city),
    region: str(data.region),
    countryName: str(data.country),
    countryCode: data.country_code.toUpperCase(),
    latitude: coerceCoord(data.latitude),
    longitude: coerceCoord(data.longitude),
    timezone: str(data.timezone) || null,
    provider: "geojs",
  }
}

async function resolveViaFreeipapi(): Promise<NetworkIdentity> {
  const res = await fetchWithTimeout(FREEIPAPI_URL, LOOKUP_TIMEOUT_MS)
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
    isp: null,
    city: str(data.cityName),
    region: str(data.regionName),
    countryName: str(data.countryName),
    countryCode: data.countryCode.toUpperCase(),
    latitude: coerceCoord(data.latitude),
    longitude: coerceCoord(data.longitude),
    timezone: null,
    provider: "freeipapi",
  }
}

/**
 * Resolve the visitor's network identity, trying geojs first and falling
 * back to freeipapi. Rejects only when both providers fail (e.g. both
 * blocked by tracking protection), so callers can surface a graceful
 * "couldn't read your network" state.
 */
export async function resolveNetworkIdentity(): Promise<NetworkIdentity> {
  const errors: Array<string> = []

  // 1. Same-origin server function — reads the IP + geo from request headers.
  // Unblockable by Safari tracker prevention and works behind Private Relay.
  try {
    const edge = await fetchEdgeNetworkIdentity()
    if (edge) return edge
  } catch (err) {
    errors.push(`edge: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Third-party providers (local dev, or non-Vercel hosting).
  try {
    return await resolveViaGeojs()
  } catch (err) {
    errors.push(`geojs: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    return await resolveViaFreeipapi()
  } catch (err) {
    errors.push(
      `freeipapi: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  throw new Error(`Network lookup failed — ${errors.join(" · ")}`)
}

/**
 * Great-circle distance in km between two coordinates (Haversine).
 */
export function haversineKm(
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
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Human-readable km, matching the test-suite's formatting.
 */
export function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`
  if (km < 1000) return `${Math.round(km)} km`
  return `${(km / 1000).toFixed(1)}k km`
}

/**
 * The IANA region/country a timezone identifier implies, e.g.
 * "America/New_York" → "America". Used for a coarse "does the system
 * timezone even belong to the IP's part of the world" read without a
 * full tz-to-country table.
 */
export function timezoneContinent(tz: string): string {
  const slash = tz.indexOf("/")
  return slash === -1 ? tz : tz.slice(0, slash)
}
