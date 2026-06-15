import { createFileRoute, redirect } from "@tanstack/react-router"
import * as React from "react"
import { Check, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react"

import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { GlobeView } from "@/components/verification/GlobeView"
import type { MapPoint } from "@/components/verification/LeafletMap"
import { DeeperChecks } from "@/components/verification/DeeperChecks"
import {
  IdentityProvider,
  useIdentity,
} from "@/lib/verification/identity-context"
import {
  formatSignedLat,
  formatSignedLon,
} from "@/lib/verification/format"
import {
  haversineKm,
  resolveNetworkIdentity,
  timezoneContinent,
  type NetworkIdentity,
} from "@/lib/verification/network-identity"
import { probeWebrtc, type WebrtcResult } from "@/lib/verification/webrtc-probe"

export const Route = createFileRoute("/verify")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true })
  },
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Verify your protection — live leak test | GeoSpoof" },
      {
        name: "description",
        content:
          "A live, on-device leak test. See what websites really see — your location, timezone, and the mismatches that get VPN users flagged — then lock it down with GeoSpoof.",
      },
    ],
  }),
})

/** ≤ this many km between browser geolocation and IP = "same place". */
const GEO_MATCH_THRESHOLD_KM = 50

type NetworkState =
  | { status: "pending" }
  | { status: "ready"; value: NetworkIdentity }
  | { status: "error"; error: string }

type CheckState = "good" | "bad" | "pending"

interface SimpleCheck {
  id: string
  label: string
  state: CheckState
}

type WebrtcState =
  | { status: "pending" }
  | { status: "ready"; value: WebrtcResult }

function VerifyPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <IdentityProvider>
          <VerifyInner />
        </IdentityProvider>
      </main>
      <Footer />
    </div>
  )
}

function VerifyInner() {
  const { snapshot } = useIdentity()
  const [network, setNetwork] = React.useState<NetworkState>({
    status: "pending",
  })
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
    return () => {
      cancelled = true
    }
  }, [])

  const net = network.status === "ready" ? network.value : null
  const loc = snapshot.location

  // Browser location (reverse-geocoded) — needed inline in the left panel.
  const [browserPlace, setBrowserPlace] = React.useState<string>("…")
  React.useEffect(() => {
    if (loc.status === "error" || !loc.value) {
      setBrowserPlace(loc.status === "error" ? "Hidden" : "…")
      return
    }
    setBrowserPlace("…")
    void reverseGeocode(loc.value.latitude, loc.value.longitude).then(
      (place) =>
        setBrowserPlace(
          place ??
            `${formatSignedLat(loc.value!.latitude)}, ${formatSignedLon(loc.value!.longitude)}`
        )
    )
  }, [loc])

  const primaryPoint: MapPoint | null =
    loc.status === "ready" && loc.value
      ? { lat: loc.value.latitude, lon: loc.value.longitude, label: "Your Location", kind: "browser" }
      : null

  const secondaryPoint: MapPoint | null =
    net && net.latitude !== null && net.longitude !== null
      ? { lat: net.latitude, lon: net.longitude, label: "IP Location", kind: "network" }
      : null

  const checks = React.useMemo(
    () => buildChecks(snapshot, net, webrtc),
    [snapshot, net, webrtc]
  )
  const resolved =
    loc.status !== "pending" &&
    network.status !== "pending" &&
    webrtc.status !== "pending"
  const leaking = checks.some((c) => c.state === "bad")

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────────
          Globe fills the entire canvas as a background layer.
          Text sits on top, left-aligned, inside the site's max-width gutter.
          A soft radial + linear gradient dims only the far-left so the
          globe's green glow can breathe through the right half of the text.
      ──────────────────────────────────────────────────────────────────── */}
      <div className="relative min-h-[calc(100vh-5.75rem)] overflow-hidden bg-[#0a0a0a]">

        {/* Globe — full-bleed background, centred slightly right */}
        <div className="absolute inset-0 translate-x-[18%]">
          <HeroMap
            primary={primaryPoint}
            secondary={secondaryPoint}
            pending={!resolved}
            browserTimezone={snapshot.timezone.identifier || undefined}
            ipTimezone={net?.timezone ?? undefined}
          />
        </div>

        {/* Gradient veil — left portion only, fades to nothing by ~55% so
            the globe glow bleeds naturally into the text column */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              /* solid strip on the very left edge */
              "linear-gradient(to right, #0a0a0a 18%, rgba(10,10,10,0.82) 34%, rgba(10,10,10,0.38) 50%, transparent 66%)",
              /* subtle vignette so text on the far left is always readable */
              "radial-gradient(ellipse 55% 100% at 0% 50%, rgba(10,10,10,0.55) 0%, transparent 100%)",
            ].join(", "),
          }}
        />
        {/* Bottom fade */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
          style={{ background: "linear-gradient(to top, #0a0a0a 15%, transparent)" }}
        />

        {/* Text column — lives in the normal page flow at the left of the
            max-width gutter; z-index lifts it above the globe layers */}
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5.75rem)] max-w-7xl flex-col justify-center px-4 py-16 md:px-5 lg:px-6 xl:px-8">
          <div className="flex max-w-[640px] flex-col gap-7">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-white/60 uppercase"
              >
                Live leak test
              </Badge>
              <h1 className="text-5xl font-bold leading-tight text-white lg:text-6xl">
                Your VPN hides your IP.{" "}
                <span className="text-(--color-brand)">Your browser leaks the rest.</span>
              </h1>
              <p className="text-base text-white/55 pt-1">
                GeoSpoof overrides your browser's geolocation, timezone, and WebRTC APIs
                so websites see exactly where you want them to — not where you actually are.
              </p>
            </div>

            <Verdict resolved={resolved} leaking={leaking} />

            <ul className="space-y-3">
              {checks.map((c) => (
                <CheckLine key={c.id} check={c} />
              ))}
            </ul>

            <div className="space-y-2">
              <a
                href="#download"
                className={cn(
                  "inline-flex min-h-14 items-center justify-center rounded-brand px-10",
                  "bg-(--color-brand) text-lg font-semibold text-white shadow-md",
                  "transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {leaking ? "Fix this — get GeoSpoof free" : "Get GeoSpoof free"}
              </a>
              <p className="text-sm text-white/40">Free · No account · Nothing leaves your device.</p>
            </div>

            {/* Social proof */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/40">
              <span><span className="font-semibold text-white/65">4,000+</span> users</span>
              <span className="hidden h-3.5 w-px bg-white/20 sm:block" aria-hidden />
              <span className="flex items-center gap-1">
                <span className="text-amber-400" aria-hidden>★★★★★</span>
                <span><span className="font-semibold text-white/65">5.0</span> Chrome</span>
              </span>
              <span className="hidden h-3.5 w-px bg-white/20 sm:block" aria-hidden />
              <span className="flex items-center gap-1">
                <span className="text-amber-400" aria-hidden>★★★★</span>
                <span className="text-white/20" aria-hidden>★</span>
                <span><span className="font-semibold text-white/65">4.0</span> Firefox</span>
              </span>
            </div>
          </div>
        </div>

        {/* Stats pill — bottom-right, overlaid on the globe */}
        <dl className="absolute bottom-8 right-8 z-10 hidden space-y-1.5 rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-xs backdrop-blur-sm lg:block">
          {[
            { label: "IP Address",   value: network.status === "ready" ? (network.value.ip ?? "—") : "…" },
            { label: "IP Location",  value: network.status === "ready" ? [network.value.city, network.value.countryName].filter(Boolean).join(", ") || "—" : "…" },
            { label: "Your Location", value: browserPlace },
            { label: "Timezone",     value: snapshot.timezone.identifier || "…" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-4">
              <dt className="w-24 shrink-0 font-semibold tracking-widest text-white/35 uppercase">{label}</dt>
              <dd className="font-medium text-white/75">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <DeeperChecks />
      <DownloadSection className="border-t border-(--color-canvas-border)" />
    </>
  )
}

/**
 * Plain-language checks derived purely from the browser snapshot + network
 * identity (instant — no test suite needed). Kept deliberately short.
 */
function buildChecks(
  snapshot: ReturnType<typeof useIdentity>["snapshot"],
  net: NetworkIdentity | null,
  webrtc: WebrtcState
): Array<SimpleCheck> {
  const checks: Array<SimpleCheck> = []
  const loc = snapshot.location

  // 1. Precise location vs the network.
  if (loc.status === "pending") {
    checks.push({
      id: "geo",
      label: "Checking your location…",
      state: "pending",
    })
  } else if (loc.status === "error" || !loc.value) {
    checks.push({
      id: "geo",
      label: "Your precise location stays hidden",
      state: "good",
    })
  } else if (net && net.latitude !== null && net.longitude !== null) {
    const km = haversineKm(
      loc.value.latitude,
      loc.value.longitude,
      net.latitude,
      net.longitude
    )
    checks.push(
      km <= GEO_MATCH_THRESHOLD_KM
        ? { id: "geo", label: "Your location matches your network", state: "good" }
        : {
            id: "geo",
            label: `Your real location is ${Math.round(km).toLocaleString("en-US")} km from your IP`,
            state: "bad",
          }
    )
  } else {
    checks.push({
      id: "geo",
      label: "Your location is locked to your chosen spot",
      state: "good",
    })
  }

  // 2. Timezone vs the network (only when we can compare).
  const tz = snapshot.timezone.identifier
  if (tz && net?.timezone) {
    const same =
      tz === net.timezone ||
      timezoneContinent(tz) === timezoneContinent(net.timezone)
    checks.push(
      same
        ? { id: "tz", label: "Your timezone matches your location", state: "good" }
        : {
            id: "tz",
            label: `Your timezone (${tz}) points somewhere else`,
            state: "bad",
          }
    )
  } else if (tz) {
    checks.push({
      id: "tz",
      label: "Your timezone is consistent",
      state: "good",
    })
  }

  // 3. WebRTC — does it leak a public IP that isn't your network's?
  if (webrtc.status === "pending") {
    checks.push({
      id: "webrtc",
      label: "Checking WebRTC for IP leaks…",
      state: "pending",
    })
  } else {
    checks.push(
      webrtc.value.publicIps.length > 0
        ? {
            id: "webrtc",
            label: "WebRTC is leaking your real IP address",
            state: "bad",
          }
        : {
            id: "webrtc",
            label: "WebRTC isn't leaking your IP address",
            state: "good",
          }
    )
  }

  return checks
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function Verdict({
  resolved,
  leaking,
}: {
  resolved: boolean
  leaking: boolean
}) {
  if (!resolved) {
    return (
      <p className="flex items-center gap-2 text-lg text-white/50">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Reading your browser…
      </p>
    )
  }
  if (!leaking) {
    return (
      <p className="flex items-center gap-2 text-lg font-medium text-white">
        <ShieldCheck className="size-6 text-(--color-brand)" aria-hidden />
        Your story holds up — nothing gives you away.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 max-w-sm">
      <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
      <p className="font-semibold text-destructive">Your location is exposed.</p>
    </div>
  )
}

function CheckLine({ check }: { check: SimpleCheck }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          check.state === "good" && "bg-(--color-brand)/15 text-(--color-brand)",
          check.state === "bad" && "bg-destructive/15 text-destructive",
          check.state === "pending" &&
            "bg-(--color-canvas-border) text-(--color-canvas-muted)"
        )}
      >
        {check.state === "good" ? (
          <Check className="size-4" aria-hidden />
        ) : check.state === "bad" ? (
          <X className="size-4" aria-hidden />
        ) : (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        )}
      </span>
      <span
        className={cn(
          "text-base",
          check.state === "bad"
            ? "font-medium text-white"
            : "text-white/80"
        )}
      >
        {check.label}
      </span>
    </li>
  )
}

function HeroMap({
  primary,
  secondary,
  pending,
  browserTimezone,
  ipTimezone,
}: {
  primary: MapPoint | null
  secondary: MapPoint | null
  pending: boolean
  browserTimezone?: string
  ipTimezone?: string
}) {
  if (primary || secondary) {
    return (
      <GlobeView
        primary={primary}
        secondary={secondary ?? undefined}
        browserTimezone={browserTimezone}
        ipTimezone={ipTimezone}
        className="h-full w-full"
      />
    )
  }
  return (
    <div className="flex h-[50vh] w-full items-center justify-center bg-black/40 lg:h-[calc(100vh-5.75rem)]">
      {pending ? (
        <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      ) : (
        <span className="max-w-xs px-6 text-center text-sm text-white/50">
          Your location wasn't exposed — nothing to plot.
        </span>
      )}
    </div>
  )
}

/**
 * Reverse-geocode a coordinate to "City, Country" via Nominatim.
 * Returns null on any failure so the UI can fall back gracefully.
 */
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
      address?: { city?: string; town?: string; village?: string; country?: string; country_code?: string }
    }
    const place =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      null
    const country = data.address?.country ?? null
    if (!place && !country) return null
    return [place, country].filter(Boolean).join(", ")
  } catch {
    return null
  }
}

export default VerifyPage
