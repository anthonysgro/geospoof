/**
 * Pure formatting helpers used by the Verification Dashboard.
 *
 * This module MUST stay side-effect-free and MUST NOT reference any browser
 * global at import time — it is imported by SSR-safe components and also
 * covered by the SSR-safety integration test.
 */

/**
 * Round a number to the given number of decimal places and return the
 * stringified result preserving trailing zeros. Avoids the exponential
 * notation that `Number.prototype.toString()` can emit.
 */
function toFixedSafe(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return String(value)
  }
  return value.toFixed(decimals)
}

/**
 * Format a latitude value as a signed degree string to 4 decimal places.
 *
 * Examples: `formatSignedLat(37.7749)` → `"+37.7749°"`,
 * `formatSignedLat(-33.8688)` → `"-33.8688°"`.
 *
 * Validates Requirement 1.2 (leading sign, 4 decimal places, degree symbol).
 */
export function formatSignedLat(lat: number): string {
  if (!Number.isFinite(lat)) {
    return "—"
  }
  const sign = lat >= 0 ? "+" : "-"
  return `${sign}${toFixedSafe(Math.abs(lat), 4)}°`
}

/**
 * Format a longitude value as a signed degree string to 4 decimal places.
 *
 * Examples: `formatSignedLon(-122.4194)` → `"-122.4194°"`.
 *
 * Validates Requirement 1.2 (leading sign, 4 decimal places, degree symbol).
 */
export function formatSignedLon(lon: number): string {
  if (!Number.isFinite(lon)) {
    return "—"
  }
  const sign = lon >= 0 ? "+" : "-"
  return `${sign}${toFixedSafe(Math.abs(lon), 4)}°`
}

/**
 * Format a timezone offset as `±HH:MM`.
 *
 * The input follows the `Date.prototype.getTimezoneOffset()` convention —
 * **positive** values mean the local zone is **west** of UTC (e.g. PST
 * returns `+480`). The output is rendered in the user-facing sign
 * convention — east of UTC is positive, matching the `UTC±HH:MM` label
 * people expect. So `formatOffset(480)` returns `"-08:00"` and
 * `formatOffset(-330)` returns `"+05:30"`.
 *
 * Validates Requirement 2.2.
 */
export function formatOffset(minutes: number): string {
  if (!Number.isFinite(minutes)) {
    return "±00:00"
  }
  const signed = -Math.round(minutes)
  const sign = signed >= 0 ? "+" : "-"
  const abs = Math.abs(signed)
  const hh = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0")
  const mm = (abs % 60).toString().padStart(2, "0")
  return `${sign}${hh}:${mm}`
}

/**
 * Build an OpenStreetMap URL centred on the given coordinates.
 *
 * Produces a URL matching the Req 1.3 shape:
 * `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=12/<lat>/<lon>`
 */
export function osmUrl(lat: number, lon: number): string {
  const la = toFixedSafe(lat, 4)
  const lo = toFixedSafe(lon, 4)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=12/${la}/${lo}`
}

/**
 * Known browser token → display name.
 *
 * Ordered so that the more specific brand is matched before its common
 * substrings (e.g. "Edg" before "Chrome", "OPR" before "Chrome").
 */
const BROWSER_PATTERNS: ReadonlyArray<{
  name: string
  regex: RegExp
}> = [
  { name: "Edge", regex: /\bEdg(?:e|iOS|A)?\/([\d.]+)/ },
  { name: "Opera", regex: /\b(?:OPR|Opera)\/([\d.]+)/ },
  { name: "Brave", regex: /\bBrave\/([\d.]+)/ },
  { name: "Vivaldi", regex: /\bVivaldi\/([\d.]+)/ },
  { name: "Firefox", regex: /\bFirefox\/([\d.]+)/ },
  { name: "Chrome", regex: /\bChrome\/([\d.]+)/ },
  { name: "Safari", regex: /Version\/([\d.]+).*Safari\// },
]

/**
 * Known OS token → display name. Matched against the parenthesised UA
 * platform string.
 */
const OS_PATTERNS: ReadonlyArray<{
  name: string
  regex: RegExp
}> = [
  { name: "Windows", regex: /Windows NT\s+([\d.]+)/ },
  { name: "macOS", regex: /Mac OS X\s+([\d_.]+)/ },
  { name: "iOS", regex: /(?:iPhone|iPad|iPod).*?OS\s+([\d_]+)/ },
  { name: "Android", regex: /Android\s+([\d.]+)/ },
  { name: "ChromeOS", regex: /CrOS\s+\w+\s+([\d.]+)/ },
  { name: "Linux", regex: /Linux/ },
]

/**
 * Keep only the major (and, when present, minor) version component so we
 * never echo a full build string verbatim. Req 5.3 forbids reproducing
 * the raw UA; returning just `"140"` or `"16.4"` keeps the label
 * human-readable without leaking the full value.
 */
function toMajor(version: string | undefined): string | null {
  if (!version) return null
  const parts = version.replaceAll("_", ".").split(".")
  if (parts.length === 0) return null
  // For OS versions we commonly want major.minor (e.g. macOS 14.5); for
  // browsers the major alone is plenty. Cap at two segments either way.
  return parts.slice(0, 2).join(".").replace(/\.0$/, "")
}

/**
 * Parse a browser User-Agent string into a short human-readable label
 * such as `"Firefox 140 on macOS"`. Falls back to `"Unknown browser"`
 * when no known token is recognised.
 *
 * This helper intentionally does **not** echo the raw UA string verbatim
 * (Req 5.3). Keep the parser conservative — the output is a best-effort
 * summary, not a spoof-resistant identification.
 */
export function parseUserAgentSummary(ua: string): string {
  if (typeof ua !== "string" || ua.length === 0) {
    return "Unknown browser"
  }

  let browserName: string | null = null
  let browserVersion: string | null = null
  for (const pattern of BROWSER_PATTERNS) {
    const match = pattern.regex.exec(ua)
    if (match) {
      browserName = pattern.name
      browserVersion = toMajor(match[1])
      break
    }
  }

  let osName: string | null = null
  for (const pattern of OS_PATTERNS) {
    const match = pattern.regex.exec(ua)
    if (match) {
      osName = pattern.name
      break
    }
  }

  const browser = browserName
    ? browserVersion
      ? `${browserName} ${browserVersion}`
      : browserName
    : "Unknown browser"

  return osName ? `${browser} on ${osName}` : browser
}
