import { createFileRoute } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { Check, Loader2, MapPin, Globe, Clock, Wifi, X, ChevronDown, ShieldCheck, ShieldAlert } from "lucide-react"

import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  IdentityProvider,
  useIdentity,
} from "@/lib/verification/identity-context"
import {
  resolveNetworkIdentity,
  haversineKm,
  timezoneContinent,
  type NetworkIdentity,
} from "@/lib/verification/network-identity"
import { probeWebrtc, type WebrtcResult } from "@/lib/verification/webrtc-probe"
import { LeafletMap } from "@/components/verification/LeafletMap"
import {
  timezoneForCoordinates,
  getTimezoneOffsetConvention,
} from "@/lib/verification/geo-timezone"

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Verify your spoofed location | GeoSpoof" },
      {
        name: "description",
        content:
          "Quickly verify what GeoSpoof is spoofing — geolocation, timezone, and WebRTC. See the values your browser is reporting right now.",
      },
    ],
  }),
})

type NetworkState =
  | { status: "pending" }
  | { status: "ready"; value: NetworkIdentity }
  | { status: "error"; error: string }

type WebrtcState =
  | { status: "pending" }
  | { status: "ready"; value: WebrtcResult }

type RowStatus = "pending" | "good" | "bad" | "info"

interface Row {
  id: string
  icon: React.ReactNode
  label: string
  value: string
  status: RowStatus
  note?: string
}

function VerifyPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <IdentityProvider>
          <VerifyInner />
        </IdentityProvider>
        <DownloadSection className="border-t border-(--color-canvas-border)" />
      </main>
      <Footer />
    </div>
  )
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse")
    url.searchParams.set("lat", String(lat))
    url.searchParams.set("lon", String(lon))
    url.searchParams.set("format", "json")
    url.searchParams.set("zoom", "10")
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "Accept-Language": "en" },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      address?: {
        city?: string
        town?: string
        village?: string
        country?: string
      }
    }
    const place =
      data.address?.city ?? data.address?.town ?? data.address?.village ?? null
    const country = data.address?.country ?? null
    if (!place && !country) return null
    return [place, country].filter(Boolean).join(", ")
  } catch {
    return null
  }
}

function useReverseGeocode(
  lat: number | null,
  lon: number | null
): string | null {
  const [place, setPlace] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (lat == null || lon == null) return
    let cancelled = false
    void reverseGeocode(lat, lon).then((result) => {
      if (!cancelled) setPlace(result)
    })
    return () => { cancelled = true }
  }, [lat, lon])
  return place
}

/** Resolve the geolocation permission state (forced to "granted" by spoofing). */
function useGeolocationPermission(): string | null {
  const [state, setState] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then(
        (status) => {
          if (!cancelled) setState(status.state)
        },
        () => {
          /* unsupported / rejected — leave null */
        }
      )
    }
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Resolve the timezone the given coordinates should map to (and its offset). */
function useGeoTimezone(
  lat: number | null,
  lon: number | null
): { zone: string; offsetMins: number } | null {
  const [tz, setTz] = React.useState<{ zone: string; offsetMins: number } | null>(null)
  React.useEffect(() => {
    if (lat == null || lon == null) {
      setTz(null)
      return
    }
    let cancelled = false
    void timezoneForCoordinates(lat, lon).then((zone) => {
      if (cancelled || !zone) return
      const offsetMins = getTimezoneOffsetConvention(zone)
      if (offsetMins != null) setTz({ zone, offsetMins })
    })
    return () => {
      cancelled = true
    }
  }, [lat, lon])
  return tz
}

function VerifyInner() {
  const { snapshot } = useIdentity()
  const [network, setNetwork] = React.useState<NetworkState>({ status: "pending" })
  const [webrtc, setWebrtc] = React.useState<WebrtcState>({ status: "pending" })

  React.useEffect(() => {
    let cancelled = false
    resolveNetworkIdentity().then(
      (value) => !cancelled && setNetwork({ status: "ready", value }),
      (err: unknown) =>
        !cancelled &&
        setNetwork({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
    )
    void probeWebrtc().then((value) => {
      if (!cancelled) setWebrtc({ status: "ready", value })
    })
    return () => { cancelled = true }
  }, [])

  const net = network.status === "ready" ? network.value : null
  const loc = snapshot.location
  const tz = snapshot.timezone

  const geoLat = loc.status === "ready" && loc.value ? loc.value.latitude : null
  const geoLon = loc.status === "ready" && loc.value ? loc.value.longitude : null
  const geoAccuracy = loc.status === "ready" && loc.value ? loc.value.accuracy : null
  const geoPlace = useReverseGeocode(geoLat, geoLon)
  const permissionState = useGeolocationPermission()
  const geoTz = useGeoTimezone(geoLat, geoLon)

  const apiGroups = React.useMemo(
    () =>
      buildValueGroups(
        geoLat != null && geoLon != null
          ? { lat: geoLat, lon: geoLon, accuracy: geoAccuracy }
          : null,
        permissionState,
        geoTz
      ),
    [geoLat, geoLon, geoAccuracy, permissionState, geoTz]
  )

  // IP cross-checks — does the browser's story match what the network says?
  // Only meaningful once the IP lookup has succeeded (net present).
  const geoVsIpMismatch =
    loc.status === "ready" &&
    loc.value != null &&
    net?.latitude != null &&
    net?.longitude != null &&
    haversineKm(loc.value.latitude, loc.value.longitude, net.latitude, net.longitude) >
      200

  const tzVsIpMismatch =
    !!tz.identifier &&
    !!net?.timezone &&
    timezoneContinent(tz.identifier) !== timezoneContinent(net.timezone)

  const rows: Array<Row> = [
    // Geolocation
    (() => {
      if (loc.status === "pending") {
        return {
          id: "geo",
          icon: <MapPin className="size-4" />,
          label: "Geolocation",
          value: "Waiting for permission…",
          status: "pending" as RowStatus,
        }
      }
      if (loc.status === "error" || !loc.value) {
        return {
          id: "geo",
          icon: <MapPin className="size-4" />,
          label: "Geolocation",
          value: "Blocked / denied",
          status: "good" as RowStatus,
          note: "Location API returned no coordinates",
        }
      }
      const { latitude, longitude, accuracy } = loc.value
      const coordStr = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

      const noteparts = [
        geoPlace,
        accuracy != null ? `±${Math.round(accuracy)} m` : null,
        geoVsIpMismatch ? "doesn't match IP location" : null,
      ].filter(Boolean)
      return {
        id: "geo",
        icon: <MapPin className="size-4" />,
        label: "Geolocation",
        value: coordStr,
        status: (geoVsIpMismatch ? "bad" : "info") as RowStatus,
        note: noteparts.length > 0 ? noteparts.join(" · ") : undefined,
      }
    })(),

    // Timezone
    (() => {
      const noteParts = [
        tz.longName || null,
        tzVsIpMismatch ? "doesn't match IP location" : null,
      ].filter(Boolean)

      return {
        id: "tz",
        icon: <Clock className="size-4" />,
        label: "Timezone",
        value: tz.identifier || "—",
        status: (tzVsIpMismatch ? "bad" : tz.identifier ? "info" : "pending") as RowStatus,
        note: noteParts.length > 0 ? noteParts.join(" · ") : undefined,
      }
    })(),

    // Current time
    {
      id: "time",
      icon: <Clock className="size-4" />,
      label: "Current time",
      value: new Date().toString(),
      status: "info" as RowStatus,
    },

    // IP address
    {
      id: "ip",
      icon: <Globe className="size-4" />,
      label: "IP Address",
      value:
        network.status === "pending"
          ? "Looking up…"
          : network.status === "error"
            ? "Lookup failed"
            : (net?.ip ?? "—"),
      status:
        network.status === "pending"
          ? "pending"
          : network.status === "error"
            ? "bad"
            : "info",
      note:
        net
          ? [net.city, net.countryName].filter(Boolean).join(", ") || undefined
          : undefined,
    },

    // WebRTC
    (() => {
      if (webrtc.status === "pending") {
        return {
          id: "webrtc",
          icon: <Wifi className="size-4" />,
          label: "WebRTC",
          value: "Probing…",
          status: "pending" as RowStatus,
        }
      }
      const leaked = webrtc.value.publicIps.length > 0
      return {
        id: "webrtc",
        icon: <Wifi className="size-4" />,
        label: "WebRTC",
        value: leaked
          ? webrtc.value.publicIps.filter((ip) => ip !== "(leaked)").join(", ") || "IP leaked"
          : "No IP leak detected",
        status: leaked ? "bad" : ("good" as RowStatus),
        note: leaked ? (webrtc.value.leakDetail || "Real IP exposed via WebRTC") : undefined,
      }
    })(),
  ]

  const allResolved =
    loc.status !== "pending" &&
    network.status !== "pending" &&
    webrtc.status !== "pending"

  // Aggregate verdict — no WebRTC leak, every spoofed API surface internally
  // consistent and aligned with the chosen location, AND the location and
  // timezone match the IP (a mismatch is what gets VPN users flagged).
  const webrtcLeaking =
    webrtc.status === "ready" && webrtc.value.publicIps.length > 0
  const failingGroups = apiGroups.filter((g) => !g.consistent)
  const verdictReady =
    webrtc.status === "ready" &&
    loc.status !== "pending" &&
    network.status !== "pending"
  const allGood =
    verdictReady &&
    !webrtcLeaking &&
    failingGroups.length === 0 &&
    !geoVsIpMismatch &&
    !tzVsIpMismatch

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 md:px-5 md:py-24">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Verification
        </p>
        <h1 className="mb-3 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          What your browser is reporting
        </h1>
        <p className="text-(--color-canvas-muted)">
          Live values from your browser right now. We test dozens of APIs attackers
          use to fingerprint location — these are the highlights.
        </p>
      </div>

      {/* Verdict banner */}
      <VerdictBanner
        ready={verdictReady}
        allGood={allGood}
        webrtcLeaking={webrtcLeaking}
        failingGroupTitles={failingGroups.map((g) => g.title)}
        geoVsIpMismatch={geoVsIpMismatch}
        tzVsIpMismatch={tzVsIpMismatch}
      />

      {/* Map — shown once we have coordinates */}
      {geoLat != null && geoLon != null && (
        <div className="mb-6 overflow-hidden rounded-2xl">
          <LeafletMap lat={geoLat} lon={geoLon} zoom={5} className="rounded-none! h-[220px] sm:h-[260px]" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {rows.map((row, i) => (
          <VerifyRow key={row.id} row={row} last={i === rows.length - 1} />
        ))}
      </div>

      {allResolved && (
        <p className="mt-6 text-center text-sm text-(--color-canvas-muted)">
          Reload the page to run the checks again. If using VPN sync, allow up to
          10 seconds after changing locations for overrides to update.
        </p>
      )}

      {/* API values — wider on desktop */}
      <div className="mt-12 lg:-mx-32 xl:-mx-48">
        <p className="mb-1 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Browser API surface
        </p>
        <p className="mb-6 text-sm text-(--color-canvas-muted)">
          Key fingerprinting surfaces attackers check. Expand any group to see the
          values they get — they should all tell the same story.
        </p>
        <ApiChecks groups={apiGroups} />
      </div>

      <p className="mt-10 text-center text-sm text-(--color-canvas-muted)">
        See something wrong, or a result you don&rsquo;t expect?{" "}
        <Link
          to="/support"
          className="font-medium text-(--color-brand) hover:underline"
        >
          Get support
        </Link>
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// API value groups — shows what each spoofed API actually returns,
// grouped by family, with a consistency light and a collapsible value table.
// ---------------------------------------------------------------------------

interface ValueRow {
  /** API surface, e.g. "Intl.DateTimeFormat().resolvedOptions().timeZone". */
  api: string
  /** The value it returned right now. */
  value: string
  /** UTC surfaces are expected to stay on true UTC, not the spoofed zone. */
  utc?: boolean
}

interface ValueGroup {
  id: string
  title: string
  /** Shown in the collapsed header — the headline value for the family. */
  headline: string
  /** Whether the surfaces in this family agree with each other. */
  consistent: boolean
  /** Explanation shown when the group is flagged (red). */
  note?: string
  rows: Array<ValueRow>
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function fmtOffset(mins: number): string {
  const sign = mins <= 0 ? "+" : "-"
  const abs = Math.abs(mins)
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

function safe(fn: () => string): string {
  try {
    return fn()
  } catch {
    return "unavailable"
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

function buildValueGroups(
  geo: {
    lat: number
    lon: number
    accuracy: number | null
  } | null,
  permissionState: string | null,
  geoTz: { zone: string; offsetMins: number } | null
): Array<ValueGroup> {
  const now = new Date()
  const groups: Array<ValueGroup> = []

  // ── Geolocation ─────────────────────────────────────────────────────────
  if (geo) {
    const geoRows: Array<ValueRow> = [
      { api: "coords.latitude", value: String(geo.lat) },
      { api: "coords.longitude", value: String(geo.lon) },
      {
        api: "coords.accuracy",
        value: geo.accuracy != null ? `${Math.round(geo.accuracy)} m` : "—",
      },
    ]

    // Add permissions check to geolocation group
    if (permissionState) {
      geoRows.push({
        api: "permissions.query({name:'geolocation'}).state",
        value: permissionState,
      })
    }

    groups.push({
      id: "geo",
      title: "Geolocation",
      headline: `${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}`,
      consistent: true,
      rows: geoRows,
    })
  }

  // ── Timezone ────────────────────────────────────────────────────────────
  const intlZone = safe(() => new Intl.DateTimeFormat().resolvedOptions().timeZone)
  const offsetMins = now.getTimezoneOffset()

  // Does the browser's timezone line up with the spoofed coordinates? This is
  // the catch for spoofers that change geolocation but leave the timezone
  // pointing at the user's real region. Compared by offset so equivalent
  // zones (e.g. New York vs Toronto) don't false-positive.
  const geoMismatch = geoTz != null && geoTz.offsetMins !== offsetMins
  const geoNote = geoTz
    ? `Doesn't match your coordinates — they're in ${geoTz.zone} (${fmtOffset(geoTz.offsetMins)})`
    : undefined

  // Historical timezone offsets
  const historicalYears = [1880, 1950, 1975, 2000, 2025]
  const browserOffsets: Record<number, number> = {}
  for (const year of historicalYears) {
    browserOffsets[year] = new Date(year, 0, 1).getTimezoneOffset()
  }

  // Compute *expected* offsets for the coordinate's timezone across the same
  // historical dates. If the browser's offsets don't match what the coordinates'
  // timezone should have historically, we've caught a mismatch.
  const expectedOffsets: Record<number, number | null> = {}
  if (geoTz) {
    for (const year of historicalYears) {
      expectedOffsets[year] = getTimezoneOffsetConvention(
        geoTz.zone,
        new Date(year, 0, 1)
      )
    }
  }

  // Check if browser offsets match expected offsets for the coordinates' timezone
  const historicalMismatch = geoTz
    ? historicalYears.some(
        (year) =>
          expectedOffsets[year] != null &&
          browserOffsets[year] !== expectedOffsets[year]
      )
    : false

  const tzRows: Array<ValueRow> = [
    { api: "Intl…resolvedOptions().timeZone", value: intlZone },
    {
      api: "Date.getTimezoneOffset()",
      value: `${fmtOffset(offsetMins)} (${offsetMins})`,
    },
    { api: "Date.now()", value: safe(() => String(Date.now())), utc: true },
    { api: "Date.parse('2024-01-01')", value: safe(() => String(Date.parse("2024-01-01"))), utc: true },
    { api: "Date.UTC(2024,0,1)", value: safe(() => String(Date.UTC(2024, 0, 1))), utc: true },
  ]

  // Add historical offset rows
  for (const year of historicalYears) {
    const browser = browserOffsets[year]
    const expected = expectedOffsets[year]
    const match = expected != null && browser === expected
    tzRows.push({
      api: `new Date(${year},0,1).getTimezoneOffset()`,
      value:
        expected != null && !match
          ? `${browser} mins (expected ${expected} for ${geoTz?.zone})`
          : `${browser} mins`,
    })
  }

  const tzConsistent = (() => {
    try {
      const fmt = new Intl.DateTimeFormat("en", {
        timeZone: intlZone || undefined,
        timeZoneName: "shortOffset",
      })
      const part = fmt.formatToParts(now).find((p) => p.type === "timeZoneName")
      const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(part?.value ?? "")
      if (!m) return true
      const sign = m[1] === "+" ? -1 : 1
      const intlOffset = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? "0", 10))
      if (intlOffset !== offsetMins) return false

      // Also verify Date statics return consistent UTC epochs
      const utc = Date.UTC(2024, 0, 1)
      if (utc !== 1704067200000) return false
      
      return true
    } catch {
      return true
    }
  })()

  const historicalNote = historicalMismatch
    ? `Historical offsets don't match ${geoTz?.zone} — timezone spoofing may be incomplete`
    : geoMismatch
      ? geoNote
      : undefined

  groups.push({
    id: "tz",
    title: "Timezone & offsets",
    headline: `${intlZone || "—"} · ${fmtOffset(offsetMins)}`,
    consistent: tzConsistent && !geoMismatch && !historicalMismatch,
    note: historicalNote,
    rows: tzRows,
  })

  // ── Date components (getters) ───────────────────────────────────────────
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const componentRows: Array<ValueRow> = [
    { api: "getFullYear()", value: safe(() => String(now.getFullYear())) },
    { api: "getMonth()", value: safe(() => `${now.getMonth()} (${MONTHS[now.getMonth()]})`) },
    { api: "getDate()", value: safe(() => String(now.getDate())) },
    { api: "getDay()", value: safe(() => `${now.getDay()} (${DAYS[now.getDay()]})`) },
    { api: "getHours()", value: safe(() => String(now.getHours())) },
    { api: "getMinutes()", value: safe(() => String(now.getMinutes())) },
    { api: "getSeconds()", value: safe(() => String(now.getSeconds())) },
    { api: "getTimezoneOffset()", value: safe(() => `${now.getTimezoneOffset()} mins`) },
    { api: "getTime()", value: safe(() => String(now.getTime())), utc: true },
    { api: "valueOf()", value: safe(() => String(now.valueOf())), utc: true },
    { api: "getUTCFullYear()", value: safe(() => String(now.getUTCFullYear())), utc: true },
    { api: "getUTCHours()", value: safe(() => String(now.getUTCHours())), utc: true },
    { api: "getUTCDate()", value: safe(() => String(now.getUTCDate())), utc: true },
  ]

  // Consistency: local getters agree with the Intl-formatted equivalents.
  const componentsConsistent = (() => {
    try {
      const localeH = parseInt(
        now.toLocaleTimeString("en-US", { hour: "numeric", hour12: false }),
        10
      )
      const normalised = localeH === 24 ? 0 : localeH
      if (now.getHours() !== normalised) return false
      const intlYear = parseInt(now.toLocaleDateString("en-US", { year: "numeric" }), 10)
      if (now.getFullYear() !== intlYear) return false
      const weekday = now.toLocaleDateString("en-US", { weekday: "long" })
      if (DAYS[now.getDay()] !== weekday) return false
      // Verify getTime() === valueOf()
      if (now.getTime() !== now.valueOf()) return false
      return true
    } catch {
      return false
    }
  })()

  groups.push({
    id: "date-components",
    title: "Date components",
    headline: safe(
      () =>
        `${MONTHS[now.getMonth()].slice(0, 3)} ${now.getDate()}, ${now.getFullYear()} · ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
    ),
    consistent: componentsConsistent && !geoMismatch,
    note: geoMismatch ? geoNote : undefined,
    rows: componentRows,
  })

  // ── Date & time strings ─────────────────────────────────────────────────
  const dateRows: Array<ValueRow> = [
    { api: "Date.toString()", value: safe(() => now.toString()) },
    { api: "Date.toDateString()", value: safe(() => now.toDateString()) },
    { api: "Date.toTimeString()", value: safe(() => now.toTimeString()) },
    { api: "Date.toLocaleString()", value: safe(() => now.toLocaleString()) },
    { api: "Date.toLocaleDateString()", value: safe(() => now.toLocaleDateString()) },
    { api: "Date.toLocaleTimeString()", value: safe(() => now.toLocaleTimeString()) },
    { api: "Date.toISOString()", value: safe(() => now.toISOString()), utc: true },
  ]

  const dateConsistent = (() => {
    try {
      const localeH = parseInt(
        now.toLocaleTimeString("en-US", { hour: "numeric", hour12: false }),
        10
      )
      const normalised = localeH === 24 ? 0 : localeH
      if (now.getHours() !== normalised) return false
      const m = /GMT([+-])(\d{2})(\d{2})/.exec(now.toString())
      if (m) {
        const sign = m[1] === "+" ? -1 : 1
        const toStringOffset = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
        if (toStringOffset !== offsetMins) return false
      }
      return true
    } catch {
      return false
    }
  })()

  groups.push({
    id: "datetime",
    title: "Date & time strings",
    headline: safe(() =>
      now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    ),
    consistent: dateConsistent && !geoMismatch,
    note: geoMismatch ? geoNote : undefined,
    rows: dateRows,
  })

  // ── Intl formatting ─────────────────────────────────────────────────────
  const intlRows: Array<ValueRow> = [
    {
      api: "Intl.DateTimeFormat().format()",
      value: safe(() =>
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "full",
          timeStyle: "long",
        }).format(now)
      ),
    },
    {
      api: "…formatToParts() (joined)",
      value: safe(() =>
        new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" })
          .formatToParts(now)
          .map((p) => p.value)
          .join("")
      ),
    },
    {
      api: "…resolvedOptions().locale",
      value: safe(() => new Intl.DateTimeFormat().resolvedOptions().locale),
    },
    {
      api: "…resolvedOptions().timeZone",
      value: safe(() => new Intl.DateTimeFormat().resolvedOptions().timeZone),
    },
  ]

  // formatRange is feature-gated.
  const dtfProto = Intl.DateTimeFormat.prototype as unknown as {
    formatRange?: (a: Date, b: Date) => string
  }
  if (typeof dtfProto.formatRange === "function") {
    intlRows.push({
      api: "…formatRange()",
      value: safe(() => {
        const later = new Date(now.getTime() + 3 * 60 * 60 * 1000)
        return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).formatRange(
          now,
          later
        )
      }),
    })
  }

  const intlConsistent = (() => {
    try {
      const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
      return (
        now.toLocaleString("en-US", opts) ===
        new Intl.DateTimeFormat("en-US", opts).format(now)
      )
    } catch {
      return false
    }
  })()

  groups.push({
    id: "intl",
    title: "Intl formatting",
    headline: safe(() => new Intl.DateTimeFormat().resolvedOptions().locale),
    consistent: intlConsistent && !geoMismatch,
    note: geoMismatch ? geoNote : undefined,
    rows: intlRows,
  })

  // ── Temporal (feature-detected) ─────────────────────────────────────────
  const temporal = (globalThis as unknown as {
    Temporal?: {
      Now?: {
        timeZoneId?: () => string
        plainDateISO?: () => { toString: () => string }
        plainTimeISO?: () => { toString: () => string }
        plainDateTimeISO?: () => { toString: () => string }
        zonedDateTimeISO?: () => { toString: () => string }
      }
    }
  }).Temporal
  const temporalRows: Array<ValueRow> = []
  if (temporal?.Now) {
    const tNow = temporal.Now
    if (tNow.timeZoneId)
      temporalRows.push({ api: "Temporal.Now.timeZoneId()", value: safe(() => tNow.timeZoneId!()) })
    if (tNow.plainDateISO)
      temporalRows.push({ api: "Temporal.Now.plainDateISO()", value: safe(() => tNow.plainDateISO!().toString()) })
    if (tNow.plainTimeISO)
      temporalRows.push({ api: "Temporal.Now.plainTimeISO()", value: safe(() => tNow.plainTimeISO!().toString()) })
    if (tNow.plainDateTimeISO)
      temporalRows.push({ api: "Temporal.Now.plainDateTimeISO()", value: safe(() => tNow.plainDateTimeISO!().toString()) })
    if (tNow.zonedDateTimeISO)
      temporalRows.push({ api: "Temporal.Now.zonedDateTimeISO()", value: safe(() => tNow.zonedDateTimeISO!().toString()) })
  }

  // ── Document ────────────────────────────────────────────────────────────
  const documentRows: Array<ValueRow> = []
  if (typeof document !== "undefined") {
    documentRows.push({ api: "document.lastModified", value: safe(() => document.lastModified) })

    // DOMParser — parseFromString produces a document with lastModified
    if (typeof DOMParser !== "undefined") {
      documentRows.push({
        api: "DOMParser().parseFromString('','text/html').lastModified",
        value: safe(() => new DOMParser().parseFromString("", "text/html").lastModified),
      })
    }

    // parseHTMLUnsafe (feature-gated, newer API)
    const docProto = Document.prototype as unknown as {
      parseHTMLUnsafe?: (html: string) => Document
    }
    if (typeof docProto.parseHTMLUnsafe === "function") {
      documentRows.push({
        api: "Document.parseHTMLUnsafe('').lastModified",
        value: safe(() => Document.parseHTMLUnsafe!("").lastModified),
      })
    }
  }

  // ── Same-origin iframe ──────────────────────────────────────────────────
  const iframeRows: Array<ValueRow> = []
  if (typeof document !== "undefined" && typeof HTMLIFrameElement !== "undefined") {
    try {
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      document.body.appendChild(iframe)
      const iframeWin = iframe.contentWindow
      if (iframeWin) {
        const iframeDate = new iframeWin.Date()
        iframeRows.push({
          api: "iframe Date.toString()",
          value: safe(() => iframeDate.toString()),
        })
        iframeRows.push({
          api: "iframe Intl.DateTimeFormat().resolvedOptions().timeZone",
          value: safe(() => new iframeWin.Intl.DateTimeFormat().resolvedOptions().timeZone),
        })
      }
      document.body.removeChild(iframe)
    } catch {
      iframeRows.push({ api: "iframe test", value: "unavailable" })
    }
  }

  // ── Web Worker (blob URL) ───────────────────────────────────────────────
  const workerRows: Array<ValueRow> = []
  if (typeof Worker !== "undefined" && typeof Blob !== "undefined") {
    workerRows.push({
      api: "Worker coverage",
      value: "Blob/data URL workers patched on all engines; URL workers on Firefox only",
    })
  }

  // ── Advanced surfaces ───────────────────────────────────────────────────
  // Combine the obscure/advanced tests into a single group to reduce clutter
  const advancedRows: Array<ValueRow> = [
    ...documentRows,
    ...iframeRows,
    ...temporalRows,
    ...workerRows,
  ]

  if (advancedRows.length > 0) {
    // Check Temporal consistency — handle timezone aliases like Katmandu/Kathmandu
    const temporalConsistent = (() => {
      if (!temporal?.Now?.timeZoneId) return true
      try {
        const temporalZone = temporal.Now.timeZoneId()
        // Direct match
        if (temporalZone === intlZone) return true
        // Handle known aliases (normalize to canonical form)
        const normalize = (tz: string) => tz.replace(/Katmandu$/, "Kathmandu").replace(/Calcutta$/, "Kolkata")
        return normalize(temporalZone) === normalize(intlZone)
      } catch {
        return true
      }
    })()

    groups.push({
      id: "advanced",
      title: "Advanced surfaces",
      headline: `${advancedRows.length} exotic APIs tested`,
      consistent: temporalConsistent && !geoMismatch,
      note: geoMismatch ? geoNote : undefined,
      rows: advancedRows,
    })
  }

  return groups
}

function ApiChecks({ groups }: { groups: Array<ValueGroup> }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <ValueGroupCard key={group.id} group={group} />
      ))}
    </div>
  )
}

function VerdictBanner({
  ready,
  allGood,
  webrtcLeaking,
  failingGroupTitles,
  geoVsIpMismatch,
  tzVsIpMismatch,
}: {
  ready: boolean
  allGood: boolean
  webrtcLeaking: boolean
  failingGroupTitles: Array<string>
  geoVsIpMismatch: boolean
  tzVsIpMismatch: boolean
}) {
  // Loading state — neutral, calm.
  if (!ready) {
    return (
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas) px-6 py-5">
        <Loader2 className="size-7 shrink-0 animate-spin text-(--color-canvas-muted)" aria-hidden />
        <div>
          <p className="font-semibold text-(--color-canvas-foreground)">
            Running checks…
          </p>
          <p className="text-sm text-(--color-canvas-muted)">
            Reading your browser and probing for leaks.
          </p>
        </div>
      </div>
    )
  }

  // All clear — the dopamine hit.
  if (allGood) {
    return (
      <div
        className={cn(
          "mb-6 flex items-center gap-5 overflow-hidden rounded-2xl px-6 py-6",
          "border border-green-500/30",
          "bg-linear-to-br from-green-500/12 to-brand/8"
        )}
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 ring-4 ring-green-500/10 dark:text-green-400">
          <ShieldCheck className="size-8" aria-hidden />
        </span>
        <div>
          <p className="text-xl font-bold text-(--color-canvas-foreground)">
            All checks passed
          </p>
          <p className="mt-0.5 text-sm text-(--color-canvas-muted)">
            No WebRTC leak detected, and the location, timezone, and date APIs
            we tested all report a consistent story. Nothing we checked gives you away.
          </p>
        </div>
      </div>
    )
  }

  // Something's off.
  const problems: Array<string> = []
  if (webrtcLeaking) problems.push("WebRTC is leaking your real IP")
  if (geoVsIpMismatch) problems.push("your location doesn't match your IP")
  if (tzVsIpMismatch) problems.push("your timezone doesn't match your IP")
  if (failingGroupTitles.length > 0)
    problems.push(`${failingGroupTitles.join(", ")} ${failingGroupTitles.length === 1 ? "doesn't" : "don't"} line up`)

  return (
    <div className="mb-6 flex items-center gap-5 rounded-2xl border border-destructive/30 bg-destructive/8 px-6 py-6">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive ring-4 ring-destructive/10">
        <ShieldAlert className="size-8" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-xl font-bold text-(--color-canvas-foreground)">
          Some signals are exposed
        </p>
        <p className="mt-0.5 text-sm text-(--color-canvas-muted)">
          {capitalize(problems.join(" · "))}. A site cross-referencing these
          signals could flag you.
        </p>
        <a
          href="#download"
          onClick={(e) => {
            e.preventDefault()
            document
              .getElementById("download")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
          className={cn(
            "mt-4 inline-flex items-center justify-center rounded-brand px-6 py-2.5",
            "bg-(--color-brand) text-sm font-semibold text-white shadow-sm",
            "transition-all hover:bg-(--color-brand-dark) hover:shadow-md",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
          )}
        >
          Install GeoSpoof free
        </a>
      </div>
    </div>
  )
}

function ValueGroupCard({ group }: { group: ValueGroup }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas)"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-canvas-border/30">
        {/* Status light */}
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            group.consistent
              ? "bg-green-500/12 text-green-600 dark:text-green-400"
              : "bg-destructive/12 text-destructive"
          )}
          aria-hidden
        >
          {group.consistent ? <Check className="size-5" /> : <X className="size-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-(--color-canvas-foreground)">
            {group.title}
          </p>
          {group.note ? (
            <p className="text-sm text-destructive">{group.note}</p>
          ) : (
            <p className="truncate font-mono text-sm text-(--color-canvas-muted)">
              {group.headline}
            </p>
          )}
        </div>

        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-(--color-canvas-muted) transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-(--color-canvas-border)">
          <table className="w-full text-sm">
            <tbody>
              {group.rows.map((row, i) => (
                <tr
                  key={row.api}
                  className={cn(
                    i < group.rows.length - 1 &&
                      "border-b border-(--color-canvas-border)"
                  )}
                >
                  <td className="w-[45%] px-5 py-2.5 align-top font-mono text-xs text-(--color-canvas-muted) break-all">
                    {row.api}
                    {row.utc && (
                      <span className="ml-2 rounded bg-canvas-border/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-(--color-canvas-muted) uppercase">
                        UTC
                      </span>
                    )}
                  </td>
                  <td className="w-[55%] px-5 py-2.5 align-top font-mono text-xs break-words text-(--color-canvas-foreground)">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function VerifyRow({ row, last }: { row: Row; last: boolean }) {
  const statusColor: Record<RowStatus, string> = {
    pending: "text-(--color-canvas-muted)",
    good: "text-green-600 dark:text-green-400",
    bad: "text-destructive",
    info: "text-(--color-canvas-foreground)",
  }

  const iconBg: Record<RowStatus, string> = {
    pending: "bg-(--color-canvas-border)/60 text-(--color-canvas-muted)",
    good: "bg-green-500/10 text-green-600 dark:text-green-400",
    bad: "bg-destructive/10 text-destructive",
    info: "bg-(--color-brand)/10 text-(--color-brand)",
  }

  return (
    <div
      className={cn(
        "flex items-start gap-4 bg-(--color-canvas) px-5 py-4",
        !last && "border-b border-(--color-canvas-border)"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          iconBg[row.status]
        )}
        aria-hidden
      >
        {row.status === "pending" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : row.status === "good" ? (
          <Check className="size-4" />
        ) : row.status === "bad" ? (
          <X className="size-4" />
        ) : (
          row.icon
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-(--color-canvas-muted) uppercase">
          {row.label}
        </p>
        <p
          className={cn(
            "mt-0.5 break-all font-mono text-sm font-medium",
            statusColor[row.status]
          )}
        >
          {row.value}
        </p>
        {row.note && (
          <p className="mt-0.5 text-xs text-(--color-canvas-muted)">{row.note}</p>
        )}
      </div>
    </div>
  )
}

export default VerifyPage
