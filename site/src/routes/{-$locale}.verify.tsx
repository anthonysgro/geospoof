import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Globe,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Wifi,
  X,
} from "lucide-react"

import type { NetworkIdentity } from "@/lib/verification/network-identity"
import type { WebrtcResult } from "@/lib/verification/webrtc-probe"
import type { WorkerProbeResult } from "@/lib/verification/worker-probe"
import type { Locale } from "@/lib/i18n"
import {
  buildAlternateLinks,
  buildOgLocaleMeta,
  format,
  getDictionary,
  localizedPath,
  toLocale,
} from "@/lib/i18n"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { cn } from "@/lib/utils"
import { PROTON_DISCOUNT } from "@/lib/affiliate"
import { SITE_URL } from "@/lib/blog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  IdentityProvider,
  useIdentity,
} from "@/lib/verification/identity-context"
import {
  fetchEdgeNetworkIdentity,
  haversineKm,
  resolveNetworkIdentity,
} from "@/lib/verification/network-identity"
import { probeWebrtc } from "@/lib/verification/webrtc-probe"
import { probeWorkers } from "@/lib/verification/worker-probe"
import {
  LeafletMap,
  prefetchLeaflet,
} from "@/components/verification/LeafletMap"
import { Skeleton } from "@/components/ui/skeleton"
import { usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import {
  getTimezoneOffsetConvention,
  timezoneForCoordinates,
} from "@/lib/verification/geo-timezone"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

/**
 * Build the `head` payload for the verify page in a given locale. This route is
 * excluded from prerendering (it runs live browser probes), so it's rendered at
 * runtime — but the meta/canonical/hreflang still matter for the English +
 * French URLs.
 */
export function buildVerifyHead(locale: Locale) {
  const m = getDictionary(locale).verify.meta
  const canonical = `${SITE_URL}${localizedPath("/verify", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      ...buildOgLocaleMeta(locale),
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/verify", SITE_URL),
      // Warm up connections to the CARTO map tile CDN before the map mounts.
      // `preconnect` opens the socket *and* completes the TLS handshake (the
      // expensive part) up front; `dns-prefetch` is the fallback for browsers
      // that ignore preconnect. The tiles are plain (non-CORS) images, so no
      // `crossOrigin` here — that would open a separate, unused connection.
      { rel: "preconnect", href: "https://a.basemaps.cartocdn.com" },
      { rel: "preconnect", href: "https://b.basemaps.cartocdn.com" },
      { rel: "preconnect", href: "https://c.basemaps.cartocdn.com" },
      { rel: "preconnect", href: "https://d.basemaps.cartocdn.com" },
      { rel: "dns-prefetch", href: "https://a.basemaps.cartocdn.com" },
      { rel: "dns-prefetch", href: "https://b.basemaps.cartocdn.com" },
      { rel: "dns-prefetch", href: "https://c.basemaps.cartocdn.com" },
      { rel: "dns-prefetch", href: "https://d.basemaps.cartocdn.com" },
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/verify")({
  component: VerifyPage,
  // Read the visitor's network identity from Vercel's request headers during
  // SSR so the IP/location panel renders with the page — no extra client-side
  // `/__server` round-trip on fresh/server-rendered loads (F5, URL bar,
  // bookmarks, the extension link, the Refresh button).
  //
  // Guarded to the server: on a client-side navigation there are no request
  // headers to read, so we skip the call and return null, and the client-side
  // effect resolves the identity exactly as before (also covers local dev and
  // the geojs/freeipapi fallback when no usable IP header is present).
  loader: async (): Promise<NetworkIdentity | null> => {
    if (typeof window !== "undefined") return null
    try {
      return await fetchEdgeNetworkIdentity()
    } catch {
      return null
    }
  },
  head: ({ params }) => buildVerifyHead(toLocale(params.locale)),
})

type NetworkState =
  | { status: "pending" }
  | { status: "ready"; value: NetworkIdentity }
  | { status: "error"; error: string }

type WebrtcState =
  | { status: "pending" }
  | { status: "ready"; value: WebrtcResult }

type WorkerState =
  | { status: "pending" }
  | { status: "ready"; value: Array<WorkerProbeResult> }

type RowStatus = "pending" | "good" | "bad" | "info"

interface Row {
  id: string
  icon: React.ReactNode
  label: string
  value: string
  status: RowStatus
  note?: string
}

export function VerifyPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <IdentityProvider>
          <VerifyInner />
        </IdentityProvider>
        <DownloadSection
          campaign="verify"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
    </div>
  )
}

async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
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
    return () => {
      cancelled = true
    }
  }, [lat, lon])
  return place
}

/** Resolve the geolocation permission state (forced to "granted" by spoofing). */
function useGeolocationPermission(): string | null {
  const [state, setState] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    // `navigator.permissions` is typed as always-present, but it's genuinely
    // absent in some hardened/older browsers — treat it as optional so the
    // feature check is real rather than statically-dead.
    const permissions: Permissions | undefined =
      typeof navigator !== "undefined" ? navigator.permissions : undefined
    if (permissions?.query) {
      permissions.query({ name: "geolocation" }).then(
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

/** Resolution state for a coordinate→timezone lookup. */
type GeoTzState =
  | { status: "loading" }
  | { status: "ready"; zone: string; offsetMins: number }
  | { status: "unavailable" }

/** Resolve the timezone the given coordinates should map to (and its offset). */
function useGeoTimezone(lat: number | null, lon: number | null): GeoTzState {
  const [tz, setTz] = React.useState<GeoTzState>({ status: "loading" })
  React.useEffect(() => {
    if (lat == null || lon == null) {
      setTz({ status: "loading" })
      return
    }
    let cancelled = false
    setTz({ status: "loading" })
    void timezoneForCoordinates(lat, lon)
      .then((zone) => {
        if (cancelled) return
        if (!zone) {
          setTz({ status: "unavailable" })
          return
        }
        const offsetMins = getTimezoneOffsetConvention(zone)
        if (offsetMins == null) {
          setTz({ status: "unavailable" })
          return
        }
        setTz({ status: "ready", zone, offsetMins })
      })
      .catch(() => {
        if (!cancelled) setTz({ status: "unavailable" })
      })
    return () => {
      cancelled = true
    }
  }, [lat, lon])
  return tz
}

function VerifyInner() {
  const { t } = useTranslations()
  const d = t.verify
  const { snapshot } = useIdentity()
  // Network identity read from Vercel's edge headers during SSR (see the route
  // loader). Present on fresh/server-rendered loads → the IP panel renders
  // immediately with the page and we skip the client `/__server` round-trip.
  // Null on client-side navigations and local dev, where the effect below
  // resolves it client-side (edge fn → geojs → freeipapi).
  const initialNetwork = Route.useLoaderData()
  const [network, setNetwork] = React.useState<NetworkState>(
    initialNetwork
      ? { status: "ready", value: initialNetwork }
      : { status: "pending" }
  )
  const [webrtc, setWebrtc] = React.useState<WebrtcState>({ status: "pending" })
  const [workers, setWorkers] = React.useState<WorkerState>({
    status: "pending",
  })
  // Gate all live Date/Intl-derived rendering until after mount. On the server
  // and the first client render this is false, so both produce identical
  // output (no hydration mismatch); real values fill in once the effect runs.
  const [mounted, setMounted] = React.useState(false)
  // Reloading the whole page is the most reliable way to re-read the spoofed
  // values: it re-runs SSR + every probe from scratch. The brief spinning
  // state gives tactile feedback on slower in-app browsers (e.g. Android's
  // WebView, where there's no address bar to reload from in the first place).
  const [refreshing, setRefreshing] = React.useState(false)
  const handleRefresh = React.useCallback(() => {
    if (typeof window === "undefined") return
    setRefreshing(true)
    window.location.reload()
  }, [])

  React.useEffect(() => {
    setMounted(true)
    // Start downloading Leaflet immediately, in parallel with the geolocation
    // permission/resolution wait, so the library is ready by the time
    // coordinates arrive and the map can mount without a download stall.
    void prefetchLeaflet()

    let cancelled = false
    // Only resolve the network identity on the client when SSR didn't already
    // supply it from the edge headers (see the route loader). This preserves
    // the edge → geojs → freeipapi fallback for client-side navigations and
    // local dev, while fresh server-rendered loads skip the round-trip.
    if (!initialNetwork) {
      resolveNetworkIdentity().then(
        (value) => !cancelled && setNetwork({ status: "ready", value }),
        (err: unknown) =>
          !cancelled &&
          setNetwork({
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          })
      )
    }
    void probeWebrtc().then((value) => {
      if (!cancelled) setWebrtc({ status: "ready", value })
    })
    void probeWorkers().then((value) => {
      if (!cancelled) setWorkers({ status: "ready", value })
    })
    return () => {
      cancelled = true
    }
  }, [initialNetwork])

  const net = network.status === "ready" ? network.value : null
  const loc = snapshot.location
  const tz = snapshot.timezone

  const geoLat = loc.status === "ready" && loc.value ? loc.value.latitude : null
  const geoLon =
    loc.status === "ready" && loc.value ? loc.value.longitude : null
  const geoAccuracy =
    loc.status === "ready" && loc.value ? loc.value.accuracy : null
  const geoPlace = useReverseGeocode(geoLat, geoLon)
  const permissionState = useGeolocationPermission()
  const geoTz = useGeoTimezone(geoLat, geoLon)

  // Resolve the IP's timezone from its coordinates using the same offline
  // boundary data (browser-geo-tz) the extension uses. This is boundary-
  // accurate for the IP's point location, and works regardless of whether the
  // IP provider supplied a timezone string itself.
  const ipTz = useGeoTimezone(net?.latitude ?? null, net?.longitude ?? null)

  const apiGroups = React.useMemo(
    () =>
      mounted
        ? buildValueGroups(
            geoLat != null && geoLon != null
              ? { lat: geoLat, lon: geoLon, accuracy: geoAccuracy }
              : null,
            permissionState,
            geoTz,
            workers.status === "ready" ? workers.value : null
          )
        : [],
    [mounted, geoLat, geoLon, geoAccuracy, permissionState, geoTz, workers]
  )

  // IP cross-checks — does the browser's story match what the network says?
  // Only meaningful once the IP lookup has succeeded (net present).
  const geoVsIpMismatch =
    loc.status === "ready" &&
    loc.value != null &&
    net?.latitude != null &&
    net.longitude != null &&
    haversineKm(
      loc.value.latitude,
      loc.value.longitude,
      net.latitude,
      net.longitude
    ) > 200

  // Prefer the provider's own timezone string (geojs supplies one); otherwise
  // use the zone resolved from the IP's coordinates. Compare both the full IANA
  // identifier and the UTC offset — a mismatch on either means the browser's
  // timezone doesn't match what the IP location expects.
  const ipTimezone =
    net?.timezone ?? (ipTz.status === "ready" ? ipTz.zone : null)
  const ipOffsetMins = ipTz.status === "ready" ? ipTz.offsetMins : null
  const tzVsIpMismatch =
    !!tz.identifier &&
    !!ipTimezone &&
    // Full identifier check (e.g. America/Toronto vs America/New_York)
    tz.identifier !== ipTimezone &&
    // Offset check as fallback — different IANA names can share the same offset
    // (e.g. America/Toronto and America/New_York are both UTC-5/UTC-4), so only
    // flag when the offsets also disagree.
    (ipOffsetMins == null || tz.offsetMinutes !== ipOffsetMins)

  // WebRTC only counts as a *leak* when it exposes a public IP that differs
  // from the one the site already sees from your connection. An IP equal to
  // the connection IP is just the VPN's own exit address (or your real IP when
  // no VPN is in use) — the site already has it, so it isn't a separate leak.
  // A *different* public IP is your real address escaping the VPN: that's the
  // meaningful WebRTC leak, and it's the true device IP worth surfacing.
  const connectionIp = net?.ip ?? null
  const webrtcIps =
    webrtc.status === "ready"
      ? webrtc.value.publicIps.filter((ip) => ip !== "(leaked)")
      : []
  const webrtcLeakedIps = connectionIp
    ? webrtcIps.filter((ip) => ip !== connectionIp)
    : webrtcIps
  const webrtcMatchesConnection =
    webrtcIps.length > 0 && webrtcLeakedIps.length === 0

  const rows: Array<Row> = [
    // Geolocation
    (() => {
      if (loc.status === "pending") {
        return {
          id: "geo",
          icon: <MapPin className="size-4" />,
          label: d.rows.geolocation,
          value: d.rows.waitingPermission,
          status: "pending",
        }
      }
      if (loc.status === "error" || !loc.value) {
        return {
          id: "geo",
          icon: <MapPin className="size-4" />,
          label: d.rows.geolocation,
          value: d.rows.blockedDenied,
          status: "good",
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
        label: d.rows.geolocation,
        value: coordStr,
        status: geoVsIpMismatch ? "bad" : "info",
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
        label: d.rows.timezone,
        value: tz.identifier || "—",
        status: tzVsIpMismatch ? "bad" : tz.identifier ? "info" : "pending",
        note: noteParts.length > 0 ? noteParts.join(" · ") : undefined,
      }
    })(),

    // Current time
    {
      id: "time",
      icon: <Clock className="size-4" />,
      label: d.rows.currentTime,
      value: mounted ? new Date().toString() : "—",
      status: mounted ? "info" : "pending",
    },

    // IP address
    {
      id: "ip",
      icon: <Globe className="size-4" />,
      label: d.rows.ipAddress,
      value:
        network.status === "pending"
          ? d.rows.lookingUp
          : network.status === "error"
            ? d.rows.lookupFailed
            : (net?.ip ?? "—"),
      status:
        network.status === "pending"
          ? "pending"
          : network.status === "error"
            ? "bad"
            : "info",
      note: net
        ? [net.city, net.countryName].filter(Boolean).join(", ") || undefined
        : undefined,
    },

    // WebRTC
    (() => {
      if (webrtc.status === "pending") {
        return {
          id: "webrtc",
          icon: <Wifi className="size-4" />,
          label: d.rows.webrtc,
          value: d.rows.probing,
          status: "pending",
        }
      }
      // No public IP surfaced at all — clean.
      if (webrtcIps.length === 0) {
        return {
          id: "webrtc",
          icon: <Wifi className="size-4" />,
          label: d.rows.webrtc,
          value: d.rows.noLeak,
          status: "good",
        }
      }
      // We need the connection IP to tell a real leak (a *different* IP
      // escaping the VPN) from the VPN's own exit IP. Hold off on a verdict
      // until the IP lookup resolves.
      if (network.status === "pending") {
        return {
          id: "webrtc",
          icon: <Wifi className="size-4" />,
          label: d.rows.webrtc,
          value: webrtcIps.join(", "),
          status: "pending",
          note: "Checking against your IP address…",
        }
      }
      // Every WebRTC IP matches the connection IP — the site already has it,
      // so WebRTC isn't exposing anything extra. This is the expected, healthy
      // result for a full-tunnel VPN (or no VPN at all).
      if (webrtcMatchesConnection) {
        return {
          id: "webrtc",
          icon: <Wifi className="size-4" />,
          label: d.rows.webrtc,
          value: webrtcIps.join(", "),
          status: "good",
          note: "Same as your IP address — no separate leak",
        }
      }
      // A public IP that differs from the connection IP: your real address
      // bypassing the VPN. This is the meaningful leak.
      return {
        id: "webrtc",
        icon: <Wifi className="size-4" />,
        label: d.rows.webrtc,
        value: webrtcLeakedIps.join(", ") || "IP leaked",
        status: "bad",
        note:
          webrtc.value.leakDetail ||
          "Real IP exposed via WebRTC — bypassing your VPN",
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
  const webrtcLeaking = webrtcLeakedIps.length > 0
  const failingGroups = apiGroups.filter((g) => !g.consistent)
  const verdictReady =
    webrtc.status === "ready" &&
    workers.status === "ready" &&
    loc.status !== "pending" &&
    network.status !== "pending"
  const allGood =
    verdictReady &&
    !webrtcLeaking &&
    failingGroups.length === 0 &&
    !geoVsIpMismatch &&
    !tzVsIpMismatch

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:py-16 md:px-5 md:py-24">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
              {d.eyebrow}
            </p>
            <h1 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) sm:text-3xl md:text-4xl">
              {d.heading}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label={d.refreshAria}
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-(--color-canvas-border) bg-(--color-canvas) px-3 py-1.5 text-sm font-medium text-(--color-canvas-foreground) transition-colors hover:border-(--color-brand) hover:text-(--color-brand) focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none active:translate-y-px disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{d.refresh}</span>
          </button>
        </div>
        <p className="text-sm text-(--color-canvas-muted) sm:text-base">
          <span className="sm:hidden">{d.introMobile}</span>
          <span className="hidden sm:inline">{d.introDesktop}</span>
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

      {allResolved && (
        <p className="-mt-2 mb-6 text-center text-xs text-(--color-canvas-muted) italic sm:text-sm">
          {d.vpnSyncNote}
        </p>
      )}

      {/* Map — reserve the exact final dimensions with a skeleton while
          geolocation is resolving, so the map (and everything below it)
          doesn't shift the layout when coordinates arrive. */}
      {loc.status === "pending" ? (
        <div className="mb-6 overflow-hidden rounded-2xl">
          <Skeleton className="h-[220px] w-full rounded-2xl sm:h-[260px]" />
        </div>
      ) : geoLat != null && geoLon != null ? (
        <div className="mb-6 overflow-hidden rounded-2xl">
          <LeafletMap
            lat={geoLat}
            lon={geoLon}
            zoom={5}
            className="h-[220px] rounded-none! sm:h-[260px]"
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {rows.map((row, i) => (
          <VerifyRow key={row.id} row={row} last={i === rows.length - 1} />
        ))}
      </div>

      {/* The IP is the one signal an extension can't touch. This is the most
          honest spot to point at the VPN layer — the user is literally looking
          at their exposed IP. Links to the /vpn hub (disclosure, "why Proton",
          and alternatives) rather than straight to the affiliate URL. */}
      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-brand/40 bg-brand/5 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-(--color-brand)">
            <Wifi className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-relaxed font-medium text-(--color-canvas-foreground)">
              {d.vpnCard.line1}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {[
                t.vpn.whyProton.reason1Title,
                t.vpn.whyProton.reason2Title,
              ].map((feature) => (
                <li
                  key={feature}
                  className="inline-flex items-center gap-1 text-xs font-medium text-(--color-canvas-foreground)"
                >
                  <Check
                    className="size-3.5 shrink-0 text-(--color-brand)"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 self-stretch sm:max-w-xs sm:self-center">
          <span className="relative inline-flex">
            <LocaleLink
              to="/vpn"
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 text-center",
                "rounded-brand bg-(--color-brand) px-5 py-2.5 text-sm font-semibold text-white",
                "shadow-sm transition-all hover:bg-(--color-brand-dark) hover:shadow-md",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2"
              )}
            >
              {d.vpnCard.cta}
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </LocaleLink>
            <span className="pointer-events-none absolute -top-2.5 -right-2.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow-md ring-2 ring-(--color-canvas)">
              <Star className="size-3 fill-current" aria-hidden="true" />
              {format(t.vpn.hero.discountSticker, { discount: PROTON_DISCOUNT })}
            </span>
          </span>
          <span className="inline-flex items-center justify-center gap-1.5 text-xs text-(--color-canvas-muted)">
            <ShieldCheck
              className="size-3.5 shrink-0 text-(--color-brand)"
              aria-hidden="true"
            />
            {t.vpn.hero.moneyBack}
          </span>
        </div>
      </div>

      {/* API values — wider on desktop */}
      <div className="mt-12 lg:-mx-20 xl:-mx-36">
        <p className="mb-1 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          {d.apiSection.eyebrow}
        </p>
        <p className="mb-6 text-sm text-(--color-canvas-muted)">
          {d.apiSection.description}
        </p>
        <ApiChecks groups={apiGroups} mounted={mounted} />
      </div>

      <FaqSection />

      <p className="mt-10 text-center text-sm text-(--color-canvas-muted)">
        {d.supportLead}
        <LocaleLink
          to="/support"
          className="font-medium text-(--color-brand) hover:underline"
        >
          {d.supportLink}
        </LocaleLink>
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// FAQ — plain-language answers to the literal questions people search for.
// Doubles as SEO surface (real indexable copy) and emits FAQPage JSON-LD so
// the answers are eligible for rich results. Copy lives in the i18n dictionary
// (t.verify.faq) so it localizes with the rest of the page.
// ---------------------------------------------------------------------------

function FaqSection() {
  const { t } = useTranslations()
  const d = t.verify.faq
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: d.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <section className="mt-16" aria-labelledby="faq-heading">
      <h2
        id="faq-heading"
        className="mb-6 text-2xl font-bold text-(--color-canvas-foreground)"
      >
        {d.heading}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {d.items.map((faq, i) => (
          <details
            key={faq.q}
            className={cn(
              "group bg-(--color-canvas) px-5 py-4",
              i < d.items.length - 1 &&
                "border-b border-(--color-canvas-border)"
            )}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-(--color-canvas-foreground)">
              {faq.q}
              <ChevronDown className="size-5 shrink-0 text-(--color-canvas-muted) transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-(--color-canvas-muted)">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        // Static, app-authored FAQ schema for rich results (no user input).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// API value groups — shows what each spoofed API actually returns,
// grouped by family, with a consistency light and a collapsible value table.
// ---------------------------------------------------------------------------

/**
 * Per-row verdict for surfaces we can individually check.
 *  - `ok`         — surface agrees with the spoofed zone/time.
 *  - `leak`       — surface disagrees and we expected it to be covered
 *                   on this browser → a real, detectable failure (X).
 *  - `limitation` — surface disagrees but coverage isn't expected on
 *                   this browser (documented engine gap, not a failure).
 *  - `pending`    — async result not in yet.
 *  - `undefined`  — informational row, not individually graded.
 */
type RowVerdict = "ok" | "leak" | "limitation" | "pending"

interface ValueRow {
  /** API surface, e.g. "Intl.DateTimeFormat().resolvedOptions().timeZone". */
  api: string
  /** The value it returned right now. */
  value: string
  /** UTC surfaces are expected to stay on true UTC, not the spoofed zone. */
  utc?: boolean
  /** Per-row consistency verdict, when the surface is individually graded. */
  verdict?: RowVerdict
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

/**
 * Normalize timezone identifiers so known aliases compare equal.
 *
 * Primary strategy: round-trip through the running engine's
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`. This collapses aliases to
 * whatever canonical form *that engine* uses — crucially, Chrome/V8 rewrites
 * `America/Argentina/Buenos_Aires` → `America/Buenos_Aires` while Firefox keeps
 * the canonical form, so a raw string compare would falsely flag a "mismatch"
 * between, say, the geo-tz canonical zone and what Chrome's Intl reports. Doing
 * it per-engine means both sides map to the same key. Manual fallbacks cover
 * any engine that throws or doesn't normalize.
 */
function normalizeZone(tz: string): string {
  const cleaned = tz.trim()
  try {
    const resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: cleaned,
    }).resolvedOptions().timeZone
    if (resolved) return resolved
  } catch {
    // fall through to manual aliases below
  }
  return cleaned
    .replace(/Katmandu$/, "Kathmandu")
    .replace(/Calcutta$/, "Kolkata")
}

/** True when two timezone identifiers refer to the same zone. */
function zonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false
  return a === b || normalizeZone(a) === normalizeZone(b)
}

/**
 * Pull an offset (in `Date.getTimezoneOffset()` minutes — i.e. inverted
 * sign) out of a date string like "… GMT+0530 …" or an ISO string like
 * "2024-01-01T12:00:00+05:30". Returns null when no offset is present.
 */
function offsetFromString(s: string): number | null {
  // Date.toString() style: GMT+0530
  const gmt = /GMT([+-])(\d{2})(\d{2})/.exec(s)
  if (gmt) {
    const sign = gmt[1] === "+" ? -1 : 1
    return sign * (parseInt(gmt[2], 10) * 60 + parseInt(gmt[3], 10))
  }
  // ISO style: +05:30 / -08:00 / Z (anchored to the end of the string)
  const iso = /([+-])(\d{2}):(\d{2})(?:\[[^\]]*\])?$/.exec(s)
  if (iso) {
    const sign = iso[1] === "+" ? -1 : 1
    return sign * (parseInt(iso[2], 10) * 60 + parseInt(iso[3], 10))
  }
  if (/(?:Z|\+00:00)(?:\[[^\]]*\])?$/.test(s)) return 0
  return null
}

/** Parse the date portion of an ISO string ("YYYY-MM-DD…"). */
function parseIsoDate(s: string): { y: number; mo: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return {
    y: parseInt(m[1], 10),
    mo: parseInt(m[2], 10) - 1,
    d: parseInt(m[3], 10),
  }
}

/** Parse the time portion of an ISO string ("…HH:MM…" or "HH:MM…"). */
function parseIsoTime(s: string): { h: number; mi: number } | null {
  const m = /(?:^|T)(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  return { h: parseInt(m[1], 10), mi: parseInt(m[2], 10) }
}

/** Parse a lastModified string ("MM/DD/YYYY HH:MM:SS") into parts. */
function parseLastModified(
  s: string
): { y: number; mo: number; d: number; h: number; mi: number } | null {
  // lastModified strings vary across engines/locales: "MM/DD/YYYY HH:MM:SS",
  // sometimes with a comma after the date and with 1- or 2-digit components.
  // Be lenient about separators/padding so a genuine leak is never silently
  // dropped just because the format wasn't the one the strict regex expected.
  const m =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(
      s.trim()
    )
  if (!m) return null
  return {
    mo: parseInt(m[1], 10) - 1,
    d: parseInt(m[2], 10),
    y: parseInt(m[3], 10),
    h: parseInt(m[4], 10),
    mi: parseInt(m[5], 10),
  }
}

function buildValueGroups(
  geo: {
    lat: number
    lon: number
    accuracy: number | null
  } | null,
  permissionState: string | null,
  geoTz: GeoTzState,
  workers: Array<WorkerProbeResult> | null
): Array<ValueGroup> {
  const now = new Date()
  const groups: Array<ValueGroup> = []

  // The browser's own claimed zone (what a fingerprinter reads from Intl).
  const intlZone = safe(
    () => new Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  // The zone we grade every surface against — the "source of truth". When the
  // coordinates resolved to a zone, THAT is the truth: each surface must report
  // the time / offset / zone the coordinates imply, not merely agree with the
  // browser's other surfaces. A "bad spoofer" that moves geolocation but leaves
  // the real zone in place reports a consistent-but-wrong zone everywhere; grading
  // against the coordinates is what catches it.
  //
  // When we have no coordinates (permission denied, or the boundary data didn't
  // load) we fall back to the browser's own claimed zone, so the checks degrade
  // to pure surface-vs-surface internal consistency rather than going dark.
  const truthZone = geoTz.status === "ready" ? geoTz.zone : intlZone

  // Expected wall-clock "now", i.e. the current instant rendered in the truth
  // zone. Surfaces that should report "now" in that zone (Temporal plain*,
  // freshly-minted document lastModified, the local Date getters) are graded
  // against this. A timezone leak shifts the reported wall-clock by the
  // real-vs-truth offset (tens of minutes to hours), well outside the tolerance
  // used below; the slack only absorbs the sub-second gap between capturing
  // `now` and reading each surface.
  //
  // CRITICAL: this reference is derived from `Intl` with an explicit
  // `timeZone: truthZone`, NOT from `Date`'s own getters. Intl converts the real
  // epoch (Date's underlying timestamp, which a timezone spoof never shifts) into
  // the requested zone itself, so it stays a trustworthy reference even when an
  // extension leaks the real zone through the Date getters. Grading against
  // `now.getHours()` etc. would be a false-pass bug: an extension that leaked the
  // real zone in BOTH the Date getters AND `lastModified` would agree with itself
  // and grade "ok". Falls back to Date getters only if Intl is unavailable.
  const nowParts = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: truthZone || undefined,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(now)
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
      let h = parseInt(get("hour"), 10)
      if (h === 24) h = 0 // hour12:false renders midnight as "24"
      const y = parseInt(get("year"), 10)
      const mo = parseInt(get("month"), 10) - 1
      const d = parseInt(get("day"), 10)
      const mi = parseInt(get("minute"), 10)
      if ([y, mo, d, h, mi].every((n) => Number.isFinite(n))) {
        return { y, mo, d, h, mi }
      }
    } catch {
      /* fall through to Date getters */
    }
    return {
      y: now.getFullYear(),
      mo: now.getMonth(),
      d: now.getDate(),
      h: now.getHours(),
      mi: now.getMinutes(),
    }
  })()
  const NOW_TOLERANCE_MS = 2 * 60 * 1000
  /**
   * Grade a wall-clock that should equal "now" in the spoofed zone.
   * Missing components (e.g. a date-only or time-only surface) fall back
   * to `now`, so they don't contribute to the comparison.
   */
  const gradeAgainstNow = (parts: {
    y?: number
    mo?: number
    d?: number
    h?: number
    mi?: number
  }): RowVerdict => {
    const actual = Date.UTC(
      parts.y ?? nowParts.y,
      parts.mo ?? nowParts.mo,
      parts.d ?? nowParts.d,
      parts.h ?? nowParts.h,
      parts.mi ?? nowParts.mi
    )
    const expected = Date.UTC(
      nowParts.y,
      nowParts.mo,
      nowParts.d,
      nowParts.h,
      nowParts.mi
    )
    return Math.abs(actual - expected) <= NOW_TOLERANCE_MS ? "ok" : "leak"
  }

  /** Boolean → check / X verdict. */
  const vOf = (ok: boolean): RowVerdict => (ok ? "ok" : "leak")

  // Wall-clock components as they should read in the truth zone. Used to grade
  // Date's own local getters and the locale string surfaces — a surface that
  // reports a different wall-clock leaked a zone other than the coordinates'.
  const localFmtParts = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: truthZone || undefined,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "long",
        hour12: false,
      }).formatToParts(now)
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
      let hour = parseInt(get("hour"), 10)
      if (hour === 24) hour = 0
      return {
        year: parseInt(get("year"), 10),
        month: parseInt(get("month"), 10) - 1,
        day: parseInt(get("day"), 10),
        hour,
        minute: parseInt(get("minute"), 10),
        second: parseInt(get("second"), 10),
        weekday: get("weekday"),
      }
    } catch {
      return null
    }
  })()

  // True UTC components, to confirm the getUTC* / ISO surfaces stay on real
  // UTC rather than drifting toward the spoofed local zone.
  const utcParts = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(
      safe(() => now.toISOString())
    )
    if (!m) return null
    return {
      year: parseInt(m[1], 10),
      day: parseInt(m[3], 10),
      hour: parseInt(m[4], 10),
    }
  })()

  // ── Geolocation ─────────────────────────────────────────────────────────
  if (geo) {
    const geoRows: Array<ValueRow> = [
      { api: "coords.latitude", value: String(geo.lat), verdict: "ok" },
      { api: "coords.longitude", value: String(geo.lon), verdict: "ok" },
      {
        api: "coords.accuracy",
        value: geo.accuracy != null ? `${Math.round(geo.accuracy)} m` : "—",
        verdict: geo.accuracy != null ? "ok" : undefined,
      },
    ]

    // Add permissions check to geolocation group
    if (permissionState) {
      geoRows.push({
        api: "permissions.query({name:'geolocation'}).state",
        value: permissionState,
        verdict:
          permissionState === "granted"
            ? "ok"
            : permissionState === "prompt"
              ? "limitation"
              : undefined,
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
  const offsetMins = now.getTimezoneOffset()

  // The offset the truth zone has at `now`, expressed in getTimezoneOffset()
  // convention (positive = west of UTC). The browser's own Date.getTimezoneOffset()
  // and every other offset-bearing surface must match it. When we have
  // coordinates this is the offset the coordinates imply; without them it's the
  // browser's own claimed zone, so the comparison degrades to self-consistency.
  // Null when it can't be read.
  const expectedOffset = (() => {
    try {
      const fmt = new Intl.DateTimeFormat("en", {
        timeZone: truthZone || undefined,
        timeZoneName: "shortOffset",
      })
      const part = fmt.formatToParts(now).find((p) => p.type === "timeZoneName")
      const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(part?.value ?? "")
      if (!m) return null
      const sign = m[1] === "+" ? -1 : 1
      return sign * (parseInt(m[2], 10) * 60 + parseInt(m.at(3) ?? "0", 10))
    } catch {
      return null
    }
  })()

  // Does the browser's timezone line up with the spoofed coordinates? This is
  // the catch for spoofers that change geolocation but leave the timezone
  // pointing at the user's real region. Compared by IANA identifier so that
  // zones with the same offset but different names (e.g. America/New_York vs
  // America/Toronto) are still flagged.
  const geoMismatch =
    geoTz.status === "ready" && !zonesMatch(geoTz.zone, intlZone)
  const geoUnavailable = geoTz.status === "unavailable"
  const geoNote =
    geoTz.status === "ready" && geoMismatch
      ? `Doesn't match your coordinates — they're in ${geoTz.zone} (${fmtOffset(geoTz.offsetMins)})`
      : geoUnavailable
        ? "Couldn't check against your coordinates — timezone boundary data didn't load."
        : undefined

  // Historical timezone offsets
  const historicalYears = [1880, 1950, 1975, 2000, 2025]
  const browserOffsets: Record<number, number> = {}
  for (const year of historicalYears) {
    browserOffsets[year] = new Date(year, 0, 1).getTimezoneOffset()
  }

  // Compute *expected* offsets for the truth zone across the same historical
  // dates. If the browser's Date offsets don't match what the truth zone should
  // have had historically, the timezone is wrong — either spoofing is
  // incomplete (the historical offsets leak the real zone's DST history) or the
  // claimed zone doesn't match the coordinates. Without geolocation this grades
  // against the browser's own claimed zone, so it still catches incomplete
  // historical spoofing.
  const expectedOffsets: Record<number, number | null> = {}
  if (truthZone) {
    for (const year of historicalYears) {
      expectedOffsets[year] = getTimezoneOffsetConvention(
        truthZone,
        new Date(year, 0, 1)
      )
    }
  }

  // Check if browser offsets match the claimed zone's historical offsets.
  // Compare with a sub-minute tolerance: pre-standard-time (LMT) offsets carry
  // seconds, and engines disagree on how they surface them — Firefox/Gecko
  // returns the full fraction (e.g. -558.9833 for Tokyo 1880), while Chrome/V8
  // truncates to a whole minute (-558). Both are "correct" for the same zone,
  // so anything within a minute is a match; a real leak (wrong zone) is off by
  // 15+ minutes.
  const HISTORICAL_OFFSET_TOLERANCE = 1.5
  const offsetsMatch = (a: number, b: number) =>
    Math.abs(a - b) < HISTORICAL_OFFSET_TOLERANCE
  const historicalMismatch = historicalYears.some(
    (year) =>
      expectedOffsets[year] != null &&
      !offsetsMatch(browserOffsets[year], expectedOffsets[year])
  )

  const EXPECTED_UTC_2024 = 1704067200000
  const tzRows: Array<ValueRow> = [
    {
      api: "Intl…resolvedOptions().timeZone",
      value: intlZone,
      verdict: vOf(!geoMismatch),
    },
    {
      api: "Date.getTimezoneOffset()",
      value: `${fmtOffset(offsetMins)} (${offsetMins})`,
      verdict:
        expectedOffset == null ? undefined : vOf(expectedOffset === offsetMins),
    },
    {
      api: "Date.now()",
      value: safe(() => String(Date.now())),
      utc: true,
      verdict: vOf(Math.abs(Date.now() - now.getTime()) < 2000),
    },
    {
      api: "Date.parse('2024-01-01')",
      value: safe(() => String(Date.parse("2024-01-01"))),
      utc: true,
      verdict: vOf(Date.parse("2024-01-01") === EXPECTED_UTC_2024),
    },
    {
      api: "Date.UTC(2024,0,1)",
      value: safe(() => String(Date.UTC(2024, 0, 1))),
      utc: true,
      verdict: vOf(Date.UTC(2024, 0, 1) === EXPECTED_UTC_2024),
    },
  ]

  // Add historical offset rows
  for (const year of historicalYears) {
    const browser = browserOffsets[year]
    const expected = expectedOffsets[year]
    const match = expected != null && offsetsMatch(browser, expected)
    tzRows.push({
      api: `new Date(${year},0,1).getTimezoneOffset()`,
      value:
        expected != null && !match
          ? `${browser} mins (expected ${Math.round(expected)} for ${truthZone})`
          : `${browser} mins`,
      verdict: expected != null ? vOf(match) : undefined,
    })
  }

  const tzConsistent = (() => {
    // The truth-zone offset must agree with Date, and the UTC statics must be canonical.
    if (expectedOffset != null && expectedOffset !== offsetMins) return false
    if (Date.UTC(2024, 0, 1) !== EXPECTED_UTC_2024) return false
    return true
  })()

  const historicalNote = historicalMismatch
    ? `Historical offsets don't match ${truthZone} — timezone spoofing may be incomplete`
    : geoMismatch || geoUnavailable
      ? geoNote
      : undefined

  groups.push({
    id: "tz",
    title: "Timezone & offsets",
    headline: `${intlZone || "—"} · ${fmtOffset(offsetMins)}`,
    consistent:
      tzConsistent &&
      !geoMismatch &&
      !historicalMismatch &&
      tzRows.every((r) => r.verdict !== "leak"),
    note: historicalNote,
    rows: tzRows,
  })

  // ── Date components (getters) ───────────────────────────────────────────
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]
  const componentRows: Array<ValueRow> = [
    {
      api: "getFullYear()",
      value: safe(() => String(now.getFullYear())),
      verdict: localFmtParts
        ? vOf(now.getFullYear() === localFmtParts.year)
        : undefined,
    },
    {
      api: "getMonth()",
      value: safe(() => `${now.getMonth()} (${MONTHS[now.getMonth()]})`),
      verdict: localFmtParts
        ? vOf(now.getMonth() === localFmtParts.month)
        : undefined,
    },
    {
      api: "getDate()",
      value: safe(() => String(now.getDate())),
      verdict: localFmtParts
        ? vOf(now.getDate() === localFmtParts.day)
        : undefined,
    },
    {
      api: "getDay()",
      value: safe(() => `${now.getDay()} (${DAYS[now.getDay()]})`),
      verdict: localFmtParts
        ? vOf(DAYS[now.getDay()] === localFmtParts.weekday)
        : undefined,
    },
    {
      api: "getHours()",
      value: safe(() => String(now.getHours())),
      verdict: localFmtParts
        ? vOf(now.getHours() === localFmtParts.hour)
        : undefined,
    },
    {
      api: "getMinutes()",
      value: safe(() => String(now.getMinutes())),
      verdict: localFmtParts
        ? vOf(now.getMinutes() === localFmtParts.minute)
        : undefined,
    },
    {
      api: "getSeconds()",
      value: safe(() => String(now.getSeconds())),
      verdict: localFmtParts
        ? vOf(now.getSeconds() === localFmtParts.second)
        : undefined,
    },
    {
      api: "getTimezoneOffset()",
      value: safe(() => `${now.getTimezoneOffset()} mins`),
      verdict:
        expectedOffset == null ? undefined : vOf(expectedOffset === offsetMins),
    },
    {
      api: "getTime()",
      value: safe(() => String(now.getTime())),
      utc: true,
      verdict: vOf(now.getTime() === now.valueOf()),
    },
    {
      api: "valueOf()",
      value: safe(() => String(now.valueOf())),
      utc: true,
      verdict: vOf(now.getTime() === now.valueOf()),
    },
    {
      api: "getUTCFullYear()",
      value: safe(() => String(now.getUTCFullYear())),
      utc: true,
      verdict: utcParts
        ? vOf(now.getUTCFullYear() === utcParts.year)
        : undefined,
    },
    {
      api: "getUTCHours()",
      value: safe(() => String(now.getUTCHours())),
      utc: true,
      verdict: utcParts ? vOf(now.getUTCHours() === utcParts.hour) : undefined,
    },
    {
      api: "getUTCDate()",
      value: safe(() => String(now.getUTCDate())),
      utc: true,
      verdict: utcParts ? vOf(now.getUTCDate() === utcParts.day) : undefined,
    },
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
      const intlYear = parseInt(
        now.toLocaleDateString("en-US", { year: "numeric" }),
        10
      )
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
    consistent:
      componentsConsistent &&
      !geoMismatch &&
      componentRows.every((r) => r.verdict !== "leak"),
    note: geoMismatch ? geoNote : undefined,
    rows: componentRows,
  })

  // ── Date & time strings ─────────────────────────────────────────────────
  const toStringOffset = offsetFromString(safe(() => now.toString()))
  // toLocaleTimeString() renders in the browser's own zone; its hour must match
  // the hour the truth zone has right now. A leaked zone shows a different hour.
  const localeHourMatches = (() => {
    try {
      const h = parseInt(
        now.toLocaleTimeString("en-US", { hour: "numeric", hour12: false }),
        10
      )
      const norm = h === 24 ? 0 : h
      return localFmtParts ? norm === localFmtParts.hour : true
    } catch {
      return true
    }
  })()
  // toDateString() emits a fixed English "Www Mmm DD YYYY" in the browser's
  // zone, so we rebuild the expected string from the truth-zone components and
  // compare. (Near midnight the calendar date legitimately differs between
  // zones, so a wrong zone is caught here too.)
  const expectedDateString =
    localFmtParts != null
      ? `${localFmtParts.weekday.slice(0, 3)} ${MONTHS[localFmtParts.month].slice(0, 3)} ${pad2(localFmtParts.day)} ${localFmtParts.year}`
      : null
  // toLocaleString() / toLocaleDateString() render in the browser's own zone;
  // they must match the equivalent Intl output rendered IN THE TRUTH ZONE for
  // the same instant. If the browser's zone differs from the coordinates', the
  // two diverge and the surface is flagged. When there are no coordinates the
  // reference falls back to the browser's claimed zone, so this degrades to a
  // self-consistency check between the two formatting paths.
  const localeStringConsistent = (() => {
    try {
      return (
        now.toLocaleString() ===
        new Intl.DateTimeFormat(undefined, {
          timeZone: truthZone || undefined,
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        }).format(now)
      )
    } catch {
      return true
    }
  })()
  const localeDateStringConsistent = (() => {
    try {
      return (
        now.toLocaleDateString() ===
        new Intl.DateTimeFormat(undefined, {
          timeZone: truthZone || undefined,
        }).format(now)
      )
    } catch {
      return true
    }
  })()
  const dateRows: Array<ValueRow> = [
    {
      api: "Date.toString()",
      value: safe(() => now.toString()),
      verdict:
        toStringOffset == null
          ? undefined
          : vOf(toStringOffset === expectedOffset),
    },
    {
      api: "Date.toDateString()",
      value: safe(() => now.toDateString()),
      verdict:
        expectedDateString == null
          ? undefined
          : vOf(safe(() => now.toDateString()) === expectedDateString),
    },
    {
      api: "Date.toTimeString()",
      value: safe(() => now.toTimeString()),
      verdict:
        offsetFromString(safe(() => now.toTimeString())) == null
          ? undefined
          : vOf(
              offsetFromString(safe(() => now.toTimeString())) ===
                expectedOffset
            ),
    },
    {
      api: "Date.toLocaleString()",
      value: safe(() => now.toLocaleString()),
      verdict: vOf(localeStringConsistent),
    },
    {
      api: "Date.toLocaleDateString()",
      value: safe(() => now.toLocaleDateString()),
      verdict: vOf(localeDateStringConsistent),
    },
    {
      api: "Date.toLocaleTimeString()",
      value: safe(() => now.toLocaleTimeString()),
      verdict: vOf(localeHourMatches),
    },
    {
      api: "Date.toISOString()",
      value: safe(() => now.toISOString()),
      utc: true,
      verdict: utcParts ? "ok" : undefined,
    },
  ]

  const dateConsistent =
    localeHourMatches &&
    (toStringOffset == null || toStringOffset === expectedOffset)

  groups.push({
    id: "datetime",
    title: "Date & time strings",
    headline: safe(() =>
      now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    ),
    consistent:
      dateConsistent &&
      !geoMismatch &&
      dateRows.every((r) => r.verdict !== "leak"),
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
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "full",
          timeStyle: "long",
        })
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
      verdict: vOf(!geoMismatch),
    },
  ]

  // formatRange is feature-gated.
  const dtfProto = Intl.DateTimeFormat.prototype as unknown as {
    formatRange?: (a: Date, b: Date) => string
  }
  if (typeof dtfProto.formatRange === "function") {
    // formatRange renders a local time range; grade the browser's output against
    // the same range rendered in the truth zone. A leaked zone shifts the range.
    const later = new Date(now.getTime() + 3 * 60 * 60 * 1000)
    const fmtRange = (tz: string | undefined) =>
      new Intl.DateTimeFormat(undefined, {
        timeStyle: "short",
        timeZone: tz,
      }).formatRange(now, later)
    const measuredRange = safe(() => fmtRange(undefined))
    const expectedRange = safe(() => fmtRange(truthZone || undefined))
    intlRows.push({
      api: "…formatRange()",
      value: measuredRange,
      verdict:
        measuredRange === "unavailable" || expectedRange === "unavailable"
          ? undefined
          : vOf(measuredRange === expectedRange),
    })
  }

  const intlConsistent = (() => {
    try {
      const opts: Intl.DateTimeFormatOptions = {
        dateStyle: "medium",
        timeStyle: "short",
      }
      // Browser-zone formatting (toLocaleString) must match the same instant
      // formatted in the truth zone. If the browser's zone differs from the
      // coordinates', the rendered date/time diverges and the surface leaks.
      return (
        now.toLocaleString("en-US", opts) ===
        new Intl.DateTimeFormat("en-US", {
          ...opts,
          timeZone: truthZone || undefined,
        }).format(now)
      )
    } catch {
      return false
    }
  })()

  // The format() / formatToParts() rows are the surfaces intlConsistent
  // actually validates, so reflect its result on them.
  for (const row of intlRows) {
    if (
      row.api === "Intl.DateTimeFormat().format()" ||
      row.api === "…formatToParts() (joined)"
    ) {
      row.verdict = vOf(intlConsistent)
    }
  }

  groups.push({
    id: "intl",
    title: "Intl formatting",
    headline: safe(() => new Intl.DateTimeFormat().resolvedOptions().locale),
    consistent:
      intlConsistent &&
      !geoMismatch &&
      intlRows.every((r) => r.verdict !== "leak"),
    note: geoMismatch ? geoNote : undefined,
    rows: intlRows,
  })

  // ── Temporal (feature-detected) ─────────────────────────────────────────
  const temporal = (
    globalThis as unknown as {
      Temporal?: {
        Now?: {
          timeZoneId?: () => string
          plainDateISO?: () => { toString: () => string }
          plainTimeISO?: () => { toString: () => string }
          plainDateTimeISO?: () => { toString: () => string }
          zonedDateTimeISO?: () => { toString: () => string }
        }
      }
    }
  ).Temporal
  const temporalRows: Array<ValueRow> = []
  if (temporal?.Now) {
    const tNow = temporal.Now
    if (tNow.timeZoneId) {
      const zone = safe(() => tNow.timeZoneId!())
      temporalRows.push({
        api: "Temporal.Now.timeZoneId()",
        value: zone,
        verdict:
          zone === "unavailable"
            ? undefined
            : zonesMatch(zone, truthZone)
              ? "ok"
              : "leak",
      })
    }
    if (tNow.plainDateISO) {
      const v = safe(() => tNow.plainDateISO!().toString())
      const p = parseIsoDate(v)
      temporalRows.push({
        api: "Temporal.Now.plainDateISO()",
        value: v,
        verdict:
          v === "unavailable" || !p
            ? undefined
            : gradeAgainstNow({ y: p.y, mo: p.mo, d: p.d }),
      })
    }
    if (tNow.plainTimeISO) {
      const v = safe(() => tNow.plainTimeISO!().toString())
      const p = parseIsoTime(v)
      temporalRows.push({
        api: "Temporal.Now.plainTimeISO()",
        value: v,
        verdict:
          v === "unavailable" || !p
            ? undefined
            : gradeAgainstNow({ h: p.h, mi: p.mi }),
      })
    }
    if (tNow.plainDateTimeISO) {
      const v = safe(() => tNow.plainDateTimeISO!().toString())
      const pd = parseIsoDate(v)
      const pt = parseIsoTime(v)
      temporalRows.push({
        api: "Temporal.Now.plainDateTimeISO()",
        value: v,
        verdict:
          v === "unavailable" || !pd || !pt
            ? undefined
            : gradeAgainstNow({
                y: pd.y,
                mo: pd.mo,
                d: pd.d,
                h: pt.h,
                mi: pt.mi,
              }),
      })
    }
    if (tNow.zonedDateTimeISO) {
      const zoned = safe(() => tNow.zonedDateTimeISO!().toString())
      // zonedDateTimeISO embeds both an offset and a [Zone] suffix, e.g.
      // "2024-01-01T12:00:00+05:30[Asia/Kolkata]". Grade its offset against the
      // offset the truth zone has right now.
      const zonedOffset = offsetFromString(zoned)
      temporalRows.push({
        api: "Temporal.Now.zonedDateTimeISO()",
        value: zoned,
        verdict:
          zoned === "unavailable" || zonedOffset == null
            ? undefined
            : zonedOffset === expectedOffset
              ? "ok"
              : "leak",
      })
    }
  }

  // ── Document ────────────────────────────────────────────────────────────
  const documentRows: Array<ValueRow> = []
  if (typeof document !== "undefined") {
    // Freshly-minted documents (DOMParser / parseHTMLUnsafe) have a
    // lastModified that is ALWAYS the current instant — there's no HTTP
    // Last-Modified header in play — so they're a reliable "now" reference we
    // can grade strictly. These are the surfaces arkenfox leans on: a JS
    // timezone spoof that forgets to patch the Document lastModified getter
    // leaks the real zone here even while Date / Intl look spoofed.
    let freshParts: ReturnType<typeof parseLastModified> = null

    // DOMParser — parseFromString mints an in-memory document whose
    // lastModified is the current instant, so it's a strict "now" reference.
    if (typeof DOMParser !== "undefined") {
      const v = safe(
        () => new DOMParser().parseFromString("", "text/html").lastModified
      )
      freshParts = parseLastModified(v)
      documentRows.push({
        api: "DOMParser().parseFromString('','text/html').lastModified",
        value: v,
        verdict:
          v === "unavailable" || !freshParts
            ? undefined
            : gradeAgainstNow(freshParts),
      })
    }

    // parseHTMLUnsafe (feature-gated, newer API) — also mints a fresh
    // in-memory document, so its lastModified is "now" too.
    const docProto = Document.prototype as unknown as {
      parseHTMLUnsafe?: (html: string) => Document
    }
    if (typeof docProto.parseHTMLUnsafe === "function") {
      const v = safe(() => Document.parseHTMLUnsafe("").lastModified)
      const p = parseLastModified(v)
      if (!freshParts) freshParts = p
      documentRows.push({
        api: "Document.parseHTMLUnsafe('').lastModified",
        value: v,
        verdict: v === "unavailable" || !p ? undefined : gradeAgainstNow(p),
      })
    }

    // The top-level document's lastModified reflects the page's HTTP
    // Last-Modified header (a deploy/server time) when one is sent, or the
    // current instant when none is. We can only grade it strictly when it
    // actually represents "now" — which we confirm by checking it lines up
    // with the freshly-minted reference above. When they agree there's no
    // header masking it, so a wrong zone here is a genuine leak; when they
    // disagree a header is in play, so we confirm-only and never emit a false
    // X (the fresh-doc rows still catch the leak either way).
    const lm = safe(() => document.lastModified)
    const lmParts = parseLastModified(lm)
    const lmIsNow =
      !!lmParts &&
      !!freshParts &&
      Math.abs(
        Date.UTC(lmParts.y, lmParts.mo, lmParts.d, lmParts.h, lmParts.mi) -
          Date.UTC(
            freshParts.y,
            freshParts.mo,
            freshParts.d,
            freshParts.h,
            freshParts.mi
          )
      ) <= NOW_TOLERANCE_MS
    documentRows.unshift({
      api: "document.lastModified",
      value: lm,
      verdict:
        lm === "unavailable" || !lmParts
          ? undefined
          : lmIsNow
            ? gradeAgainstNow(lmParts)
            : gradeAgainstNow(lmParts) === "ok"
              ? "ok"
              : undefined,
    })
  }

  // ── Same-origin iframe ──────────────────────────────────────────────────
  const iframeRows: Array<ValueRow> = []
  if (
    typeof document !== "undefined" &&
    typeof HTMLIFrameElement !== "undefined"
  ) {
    try {
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      document.body.appendChild(iframe)
      // The iframe's own realm has its own Date / Intl globals — that's the
      // point of the test (does the spoofing reach into child realms?).
      const iframeWin = iframe.contentWindow as
        | (Window & typeof globalThis)
        | null
      if (iframeWin) {
        const iframeDate = new iframeWin.Date()
        const iframeDateStr = safe(() => iframeDate.toString())
        const iframeOffset = offsetFromString(iframeDateStr)
        iframeRows.push({
          api: "iframe Date.toString()",
          value: iframeDateStr,
          verdict:
            iframeDateStr === "unavailable" || iframeOffset == null
              ? undefined
              : iframeOffset === expectedOffset
                ? "ok"
                : "leak",
        })
        const iframeZone = safe(
          () => new iframeWin.Intl.DateTimeFormat().resolvedOptions().timeZone
        )
        iframeRows.push({
          api: "iframe Intl.DateTimeFormat().resolvedOptions().timeZone",
          value: iframeZone,
          verdict:
            iframeZone === "unavailable"
              ? undefined
              : zonesMatch(iframeZone, truthZone)
                ? "ok"
                : "leak",
        })
        // The iframe's contentDocument is freshly minted (about:blank), so its
        // lastModified is the current instant — a strict "now" reference. A
        // spoof that patches the iframe's Date but not its document leaks here.
        const iframeLm = safe(() => iframeWin.document.lastModified)
        const iframeLmParts = parseLastModified(iframeLm)
        iframeRows.push({
          api: "iframe document.lastModified",
          value: iframeLm,
          verdict:
            iframeLm === "unavailable" || !iframeLmParts
              ? undefined
              : gradeAgainstNow(iframeLmParts),
        })
      }
      document.body.removeChild(iframe)
    } catch {
      iframeRows.push({ api: "iframe test", value: "unavailable" })
    }
  }

  // ── XSLT / EXSLT date-time ────────────────────────────────────────────────
  // EXSLT's date:date-time() returns an ISO timestamp WITH the real timezone
  // offset (e.g. "2024-01-01T12:00:00+05:30"), computed natively via libxslt.
  // That makes it the strongest "truth anchor" available — a naive JS-level
  // timezone spoof won't reach it — which is why arkenfox prefers it. It's
  // Gecko-only in practice (other engines don't implement the EXSLT date
  // extension), and Firefox is winding XSLT down behind `dom.xslt.enabled`
  // (FF151+). GeoSpoof patches this surface (via the XSLTProcessor wrapper),
  // so it's now graded: the offset must match the spoofed Date offset.
  const exsltRows: Array<ValueRow> = []
  if (
    typeof DOMParser !== "undefined" &&
    typeof XSLTProcessor !== "undefined"
  ) {
    const exsltValue = safe(() => {
      const xslText =
        '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"' +
        ' xmlns:date="http://exslt.org/dates-and-times" extension-element-prefixes="date">' +
        '<xsl:output method="html"/>' +
        '<xsl:template match="/"><xsl:value-of select="date:date-time()"/></xsl:template>' +
        "</xsl:stylesheet>"
      const xslDoc = new DOMParser().parseFromString(xslText, "text/xml")
      const proc = new XSLTProcessor()
      proc.importStylesheet(xslDoc)
      // `transformToFragment` is typed non-null but returns null when the
      // transform fails (e.g. XSLT disabled) — cast so the guard below is real.
      const fragment = proc.transformToFragment(
        xslDoc,
        document
      ) as DocumentFragment | null
      return fragment?.firstChild?.nodeValue || "unavailable"
    })
    // Only grade when the engine actually produced an EXSLT timestamp carrying
    // an offset. Elsewhere (Chromium/Safari, or XSLT disabled) we skip the row
    // rather than show a permanent "unavailable" that reads like a failure.
    const exsltOffset =
      exsltValue === "unavailable" ? null : offsetFromString(exsltValue)
    if (exsltOffset != null) {
      const exsltLeaks = exsltOffset !== expectedOffset
      exsltRows.push({
        api: "EXSLT date:date-time() (XSLTProcessor)",
        value: exsltLeaks
          ? `${exsltValue} (offset ${exsltOffset} vs ${expectedOffset})`
          : exsltValue,
        verdict: exsltLeaks ? "leak" : "ok",
      })
    }
  }

  // ── Web Workers ─────────────────────────────────────────────────────────
  // Each worker construction pattern runs in its own realm with its own
  // Date / Intl. A fingerprinter can read the real timezone from inside one
  // if the spoofing doesn't reach it. We only probe the surfaces the content
  // script reliably patches on every engine (blob / data / nested workers);
  // a mismatch there is a genuine leak. URL-based / module / service workers
  // are intentionally not probed (see worker-probe.ts) — their coverage is
  // best-effort or a documented limitation, so showing them would just read
  // as a permanent failure.
  const workerRows: Array<ValueRow> = []
  if (typeof Worker !== "undefined") {
    if (workers == null) {
      workerRows.push({
        api: "Worker timeZone",
        value: "Probing…",
        verdict: "pending",
      })
    } else {
      for (const w of workers) {
        if (!w.supported) {
          workerRows.push({
            api: w.label,
            value: w.detail ? `unavailable (${w.detail})` : "unavailable",
          })
          continue
        }
        const reported = w.reading?.timeZone ?? ""
        const matches = zonesMatch(reported, truthZone)
        workerRows.push({
          api: w.label,
          value: matches
            ? reported
            : `${reported} (leaked — expected ${truthZone})`,
          verdict: matches ? "ok" : "leak",
        })
      }
    }
  }

  // ── Advanced surfaces ───────────────────────────────────────────────────
  // Combine the obscure/advanced tests into a single group to reduce clutter
  const advancedRows: Array<ValueRow> = [
    ...documentRows,
    ...iframeRows,
    ...exsltRows,
    ...temporalRows,
    ...workerRows,
  ]

  if (advancedRows.length > 0) {
    // The group is flagged when any individually-graded surface leaked a
    // different zone/offset than the spoofed main thread, or when the spoofed
    // zone itself doesn't match the coordinates. A "limitation" verdict
    // (surface we don't claim to cover on this browser) is not a failure.
    const hasLeak = advancedRows.some((r) => r.verdict === "leak")
    const leakNote = (() => {
      const leak = advancedRows.find((r) => r.verdict === "leak")
      if (!leak) return undefined
      return `${leak.api} leaked a different timezone — spoofing didn't reach this surface`
    })()

    groups.push({
      id: "advanced",
      title: "Advanced surfaces",
      headline: `${advancedRows.length} exotic APIs tested`,
      consistent: !hasLeak && !geoMismatch,
      note: geoMismatch ? geoNote : leakNote,
      rows: advancedRows,
    })
  }

  return groups
}

function ApiChecks({
  groups,
  mounted,
}: {
  groups: Array<ValueGroup>
  mounted: boolean
}) {
  // Before mount (server + first client render) the value groups can't be
  // built deterministically — they read live Date/Intl/document state — so we
  // show fixed-height skeleton cards that reserve the layout and avoid both a
  // hydration mismatch and a layout shift when the real cards appear.
  if (!mounted) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas) px-4 py-3 sm:gap-4 sm:px-5 sm:py-4"
          >
            <Skeleton className="size-8 shrink-0 rounded-full sm:size-9" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="size-5 shrink-0 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <ValueGroupCard key={group.id} group={group} />
      ))}
    </div>
  )
}

/**
 * Small per-row status glyph for individually-graded API surfaces.
 * Informational rows (no verdict) render an empty spacer so the value
 * column stays aligned.
 */
function RowVerdictIcon({ verdict }: { verdict?: RowVerdict }) {
  if (verdict === "ok")
    return (
      <Check
        className="mt-0.5 size-3.5 shrink-0 text-green-600 dark:text-green-400"
        aria-label="consistent"
      />
    )
  if (verdict === "leak")
    return (
      <X
        className="mt-0.5 size-3.5 shrink-0 text-destructive"
        aria-label="leaked"
      />
    )
  if (verdict === "limitation")
    return (
      <ShieldAlert
        className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
        aria-label="documented limitation"
      />
    )
  if (verdict === "pending")
    return (
      <Loader2
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-(--color-canvas-muted)"
        aria-label="probing"
      />
    )
  return <span className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
  const platform = usePlatform()
  const storeLink = getStoreLink(platform, "verify")
  const { t } = useTranslations()
  const d = t.verify.verdict
  const dlg = t.verify.dialog

  // Loading state — neutral, calm.
  if (!ready) {
    return (
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas) px-6 py-5">
        <Loader2
          className="size-7 shrink-0 animate-spin text-(--color-canvas-muted)"
          aria-hidden
        />
        <div>
          <p className="font-semibold text-(--color-canvas-foreground)">
            {d.running}
          </p>
          <p className="text-sm text-(--color-canvas-muted)">{d.runningSub}</p>
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
            {d.allGood}
          </p>
          <p className="mt-0.5 text-sm text-(--color-canvas-muted)">
            {d.allGoodSub}
          </p>
        </div>
      </div>
    )
  }

  // Something's off.
  const problems: Array<string> = []
  if (webrtcLeaking) problems.push(d.problemWebrtc)
  if (geoVsIpMismatch) problems.push(d.problemGeo)
  if (tzVsIpMismatch) problems.push(d.problemTz)
  if (failingGroupTitles.length > 0)
    problems.push(
      `${failingGroupTitles.join(", ")} ${failingGroupTitles.length === 1 ? "doesn't" : "don't"} line up`
    )

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive ring-4 ring-destructive/10 sm:size-14">
        <ShieldAlert className="size-5 sm:size-8" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-base font-bold text-(--color-canvas-foreground) sm:text-xl">
          {d.exposed}
        </p>
        <ul className="mt-1.5 space-y-0.5 sm:mt-2 sm:space-y-1">
          {problems.map((problem) => (
            <li
              key={problem}
              className="flex items-start gap-2 text-sm text-(--color-canvas-muted)"
            >
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                aria-hidden
              />
              <span>{problem}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 hidden text-sm text-(--color-canvas-muted) sm:block">
          {d.crossRef}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mt-4">
          <a
            href="#download"
            onClick={(e) => {
              e.preventDefault()
              document
                .getElementById("download")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-brand px-5 py-2 sm:px-6 sm:py-2.5",
              "bg-(--color-brand) text-sm font-semibold text-white shadow-sm",
              "transition-all hover:bg-(--color-brand-dark) hover:shadow-md",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {d.installFree}
          </a>

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  "rounded text-sm font-medium text-(--color-canvas-muted) underline underline-offset-4",
                  "transition-colors hover:text-(--color-canvas-foreground)",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {d.alreadyHave}
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{dlg.title}</DialogTitle>
                <DialogDescription>{dlg.description}</DialogDescription>
              </DialogHeader>
              <ul className="space-y-3 text-sm text-(--color-canvas-foreground)">
                {(geoVsIpMismatch || tzVsIpMismatch) && (
                  <li className="flex gap-2.5">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
                      aria-hidden
                    />
                    <span>
                      <span className="font-semibold">
                        {geoVsIpMismatch
                          ? dlg.ipMismatchLocation
                          : dlg.ipMismatchTimezone}
                      </span>{" "}
                      {dlg.ipMismatchBody}
                    </span>
                  </li>
                )}
                {(geoVsIpMismatch || tzVsIpMismatch) && (
                  <li className="flex gap-2.5">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
                      aria-hidden
                    />
                    <span>
                      <span className="font-semibold">{dlg.autoSyncBold}</span>{" "}
                      {dlg.autoSyncBody}
                    </span>
                  </li>
                )}
                <li className="flex gap-2.5">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
                    aria-hidden
                  />
                  <span>
                    <span className="font-semibold">{dlg.updateBold}</span>{" "}
                    {dlg.updateBody}
                    {storeLink ? (
                      <a
                        href={storeLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-(--color-brand) underline underline-offset-4 hover:text-(--color-brand-dark)"
                      >
                        {t.storeCta[storeLink.key]}
                      </a>
                    ) : (
                      <a
                        href="#download"
                        onClick={(e) => {
                          e.preventDefault()
                          document.getElementById("download")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                        }}
                        className="font-medium text-(--color-brand) underline underline-offset-4 hover:text-(--color-brand-dark)"
                      >
                        {dlg.downloadOptions}
                      </a>
                    )}
                    .
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
                    aria-hidden
                  />
                  <span>
                    <span className="font-semibold">{dlg.checkSiteBold}</span>{" "}
                    {dlg.checkSiteBody}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
                    aria-hidden
                  />
                  <span>
                    <span className="font-semibold">{dlg.reloadBold}</span>{" "}
                    {dlg.reloadBody}
                  </span>
                </li>
              </ul>
              <DialogFooter className="sm:items-center sm:justify-between">
                <LocaleLink
                  to="/support"
                  className="text-sm font-medium text-(--color-brand) underline underline-offset-4 hover:text-(--color-brand-dark)"
                >
                  {dlg.stillStuck}
                </LocaleLink>
                <DialogClose asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center justify-center rounded-brand border border-(--color-canvas-border) px-4 py-2",
                      "text-sm font-semibold text-(--color-canvas-foreground) transition-colors",
                      "hover:bg-canvas-border/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                    )}
                  >
                    {dlg.gotIt}
                  </button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas-border/30 sm:gap-4 sm:px-5 sm:py-4">
        {/* Status light */}
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9",
            group.consistent
              ? "bg-green-500/12 text-green-600 dark:text-green-400"
              : "bg-destructive/12 text-destructive"
          )}
          aria-hidden
        >
          {group.consistent ? (
            <Check className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--color-canvas-foreground) sm:text-base">
            {group.title}
          </p>
          {group.note ? (
            <p className="text-xs text-destructive sm:text-sm">{group.note}</p>
          ) : (
            <p className="truncate font-mono text-xs text-(--color-canvas-muted) sm:text-sm">
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
                  <td className="w-[45%] px-4 py-2 align-top font-mono text-xs break-all text-(--color-canvas-muted) sm:px-5 sm:py-2.5">
                    {row.api}
                    {row.utc && (
                      <span className="ml-2 rounded bg-canvas-border/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-(--color-canvas-muted) uppercase">
                        UTC
                      </span>
                    )}
                  </td>
                  <td className="w-[55%] px-4 py-2 align-top font-mono text-xs wrap-break-word text-(--color-canvas-foreground) sm:px-5 sm:py-2.5">
                    <span className="flex items-start gap-2">
                      <RowVerdictIcon verdict={row.verdict} />
                      <span className="min-w-0 flex-1">{row.value}</span>
                    </span>
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
        "flex items-start gap-3 bg-(--color-canvas) px-4 py-3 sm:gap-4 sm:px-5 sm:py-4",
        !last && "border-b border-(--color-canvas-border)"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8",
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
        <p className="text-[11px] font-semibold tracking-wide text-(--color-canvas-muted) uppercase sm:text-xs">
          {row.label}
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono text-[13px] font-medium break-all sm:text-sm",
            statusColor[row.status]
          )}
        >
          {row.value}
        </p>
        {row.note && (
          <p className="mt-0.5 text-[11px] text-(--color-canvas-muted) sm:text-xs">
            {row.note}
          </p>
        )}
      </div>
    </div>
  )
}

export default VerifyPage
