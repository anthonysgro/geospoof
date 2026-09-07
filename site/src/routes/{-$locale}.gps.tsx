import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Apple,
  ArrowRight,
  Check,
  Download,
  MapPin,
  Monitor,
  RadioTower,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
  Usb,
  Waypoints,
  Wifi,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import type { DesktopOS } from "@/hooks/use-desktop-os"
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
import { Section } from "@/components/landing/Section"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"
import { PROTON_DISCOUNT } from "@/lib/affiliate"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"
import { useTheme } from "@/hooks/use-theme"
import { useDesktopOS } from "@/hooks/use-desktop-os"
import { LocaleLink } from "@/components/LocaleLink"

/**
 * GeoSpoof GPS is built + notarized by the private `geospoof-gps` repo's CI and
 * published to the CDN (not GitHub Releases — the repo is private). The site
 * links the stable alias, which always points at the newest build and works
 * during SSR/prerender with no JS, and reads a small pointer for the version.
 */
const GPS_CDN_BASE = "https://cdn.geospoof.com/gps"
/** Stable macOS download alias — always the latest build. Safe as an SSR href. */
const GPS_LATEST_DMG = `${GPS_CDN_BASE}/latest.dmg`
/** Stable Windows download alias — always the latest build. Safe as an SSR href. */
const GPS_LATEST_EXE = `${GPS_CDN_BASE}/windows/latest-Setup.exe`
/** Version pointer the UI fetches to display the current version number. */
const GPS_LATEST_JSON = `${GPS_CDN_BASE}/latest.json`
/** GeoSpoof iOS app — the control surface for GeoSpoof GPS (Pro unlocks device GPS). */
const APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=gps&mt=8"

/**
 * Build the `head` payload for the GeoSpoof GPS page in a given locale:
 * localized title/description/OG + self-canonical + hreflang cluster.
 */
export function buildGpsHead(locale: Locale) {
  const m = getDictionary(locale).gps.meta
  const canonical = `${SITE_URL}${localizedPath("/gps", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      { property: "og:type", content: "website" },
      ...buildOgLocaleMeta(locale),
      { property: "og:url", content: canonical },
      { property: "og:title", content: m.ogTitle },
      { property: "og:description", content: m.description },
      { name: "twitter:url", content: canonical },
      { name: "twitter:title", content: m.ogTitle },
      { name: "twitter:description", content: m.description },
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/gps", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/gps")({
  component: GpsPage,
  head: ({ params }) => buildGpsHead(toLocale(params.locale)),
})

/**
 * Shape of the CDN `gps/latest.json` pointer written by the release workflow.
 *
 * As published today the pointer is macOS-only — `{ version, dmg, date }`, with
 * no Windows entry (verified against the live CDN). So `dmg` stays required and
 * `exe` is optional: when it's absent the Windows button keeps the stable
 * `windows/latest-Setup.exe` alias, which is always the newest build. Do not
 * make `exe` required — a missing field would bail out of the whole resolver
 * and take the version label down with it.
 *
 * Caveat worth knowing: because the pointer is written by the macOS pipeline,
 * `version` describes the Mac build. It's displayed as the product version
 * under either button, which is only strictly accurate while the two platforms
 * release in lockstep. If they diverge, add a per-platform version to the
 * manifest rather than labelling the Windows download with this one.
 */
interface LatestGpsManifest {
  version: string
  dmg: string
  exe?: string
  date?: string
}

interface ResolvedRelease {
  version: string
  dmgUrl: string
  exeUrl: string
}

/**
 * Resolve the latest GeoSpoof GPS version at runtime from the CDN pointer
 * (`gps/latest.json`). Returns `null` until resolved (and if the request
 * fails), in which case the UI keeps the stable `latest.*` download links,
 * which work during SSR/prerender and offline.
 */
function useLatestGpsRelease(): ResolvedRelease | null {
  const [release, setRelease] = React.useState<ResolvedRelease | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(GPS_LATEST_JSON, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((res) =>
        res.ok ? (res.json() as Promise<LatestGpsManifest>) : null
      )
      .then((data) => {
        if (!data || !data.version || !data.dmg) return
        setRelease({
          version: data.version,
          dmgUrl: data.dmg,
          exeUrl: data.exe ?? GPS_LATEST_EXE,
        })
      })
      .catch(() => {
        /* leave the stable latest.dmg / latest-Setup.exe links in place */
      })
    return () => controller.abort()
  }, [])

  return release
}

/** One downloadable desktop build. */
interface GpsBuild {
  os: Exclude<DesktopOS, "unknown">
  /** Button label, e.g. "Download for Windows". */
  cta: string
  /** Platform name for the downloads-section card heading. */
  name: string
  /** One-line system requirement shown on the card. */
  requirement: string
  href: string
  Icon: LucideIcon
}

/**
 * The desktop builds, in their authored order (macOS first, the older build).
 * Both are always rendered: the prerendered HTML then links every installer, so
 * the page is complete for crawlers and for anyone with JavaScript off, and
 * detection only ever changes emphasis and order — never availability.
 */
function useGpsBuilds(
  release: ResolvedRelease | null
): ReadonlyArray<GpsBuild> {
  const { t } = useTranslations()
  const d = t.gps.download
  const s = t.gps.downloads

  return [
    {
      os: "macos",
      cta: d.ctaMac,
      name: s.macName,
      requirement: s.macRequirement,
      href: release ? release.dmgUrl : GPS_LATEST_DMG,
      Icon: Apple,
    },
    {
      os: "windows",
      cta: d.ctaWindows,
      name: s.windowsName,
      requirement: s.windowsRequirement,
      href: release ? release.exeUrl : GPS_LATEST_EXE,
      Icon: Monitor,
    },
  ]
}

/**
 * The build to offer as the single hero CTA.
 *
 * Falls back to macOS when detection hasn't resolved or the visitor is on
 * neither desktop OS (phone, tablet, Linux). macOS is the deliberate default:
 * it's what the prerendered HTML ships with, so it's also what a visitor with
 * JavaScript disabled keeps, and it was the platform GPS launched on. A Windows
 * visitor gets the right button as soon as the detection effect runs; until
 * then the "all platforms" link below the button is their way through.
 */
function primaryBuild(
  builds: ReadonlyArray<GpsBuild>,
  os: DesktopOS
): GpsBuild {
  const target = os === "unknown" ? "macos" : os
  return builds.find((b) => b.os === target) ?? builds[0]
}

/**
 * The hero download control: one auto-detected primary button, the resolved
 * version, and a permanent link to the full downloads list.
 *
 * One button, not one per platform. Two equally-weighted CTAs is the pattern
 * every design system warns about (one primary per section) and it makes the
 * visitor answer a question the page can usually answer for them. The same
 * shape is what cross-platform desktop apps converge on — a detected primary
 * plus an exhaustive per-platform list further down the page.
 *
 * The cost of one button is that /gps is prerendered (see `vite.config.ts`), so
 * the static HTML has to commit to a platform and a Windows visitor sees "Mac"
 * until the detection effect runs. That's why `d.allPlatforms` below is
 * unconditional: the escape hatch ships in the HTML, so the guess being wrong
 * (or JavaScript being off) is never a dead end.
 */
function DownloadCard({ release }: { release: ResolvedRelease | null }) {
  const { t } = useTranslations()
  const d = t.gps.download
  const os = useDesktopOS()
  const { cta, href, Icon } = primaryBuild(useGpsBuilds(release), os)

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center">
      {/* A link, not a button: it navigates to a file. The label carries the
          word "Download", so no extra role or aria-label is needed. */}
      <a
        href={href}
        aria-describedby="gps-download-version"
        className={cn(
          "inline-flex min-h-14 w-full items-center justify-center gap-2 sm:w-auto",
          "rounded-brand bg-(--color-brand) px-8 text-lg font-semibold text-white",
          "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        {cta}
      </a>

      {/* `min-h-5` reserves the line so resolving the version doesn't shift the
          links below it. Announced politely because it arrives after paint. */}
      <p
        id="gps-download-version"
        className="mt-3 min-h-5 text-sm text-(--color-canvas-muted)"
        aria-live="polite"
      >
        {release ? `${d.versionLabel}: v${release.version}` : d.resolving}
      </p>

      {/* Always present, never conditional on detection: the escape hatch for
          anyone the guess is wrong for, and for people downloading for a
          machine they aren't sitting at. */}
      <a
        href="#downloads"
        className="mt-1 text-sm font-medium text-(--color-brand) hover:underline"
      >
        {d.allPlatforms}
      </a>

      <p className="mt-3 max-w-md text-center text-xs text-(--color-canvas-muted)">
        {d.iosNote}{" "}
        <a
          href={APP_STORE_URL}
          className="font-medium text-(--color-brand) hover:underline"
        >
          {d.iosCta}
        </a>
      </p>
    </div>
  )
}

/**
 * The full downloads list: every build, its system requirement, and the version
 * it resolves to. The hero promotes one build; this section is where someone
 * downloading for a machine they aren't sitting at (or checking requirements
 * before they commit) finds the other one stated plainly.
 *
 * Anchored as #downloads so the hero, /support and release notes can deep-link.
 */
function Downloads({ release }: { release: ResolvedRelease | null }) {
  const { t } = useTranslations()
  const s = t.gps.downloads
  const d = t.gps.download
  const os = useDesktopOS()
  const builds = useGpsBuilds(release)

  return (
    <Section
      narrow
      id="downloads"
      className="scroll-mt-24 py-12! md:py-16!"
      aria-labelledby="gps-downloads-heading"
    >
      <h2
        id="gps-downloads-heading"
        className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        {s.title}
      </h2>
      <p className="mb-8 max-w-2xl text-(--color-canvas-muted)">{s.intro}</p>

      <ul className="grid gap-5 sm:grid-cols-2">
        {builds.map(({ os: buildOS, cta, name, requirement, href, Icon }) => (
          <li
            key={buildOS}
            className={cn(
              "flex flex-col rounded-2xl border bg-(--color-canvas) p-6",
              os === buildOS
                ? "border-brand/40 ring-1 ring-brand/20"
                : "border-(--color-canvas-border)"
            )}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-(--color-brand)">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-(--color-canvas-foreground)">
                {name}
              </h3>
              {/* Only ever additive: appears after detection, never replaces copy. */}
              {os === buildOS ? (
                <span className="ml-auto rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-(--color-brand)">
                  {s.recommended}
                </span>
              ) : null}
            </div>

            <p className="mb-5 text-sm leading-relaxed text-(--color-canvas-muted)">
              {requirement}
            </p>

            {/* w-full so both cards' buttons are identical regardless of how
                long the translated label is. */}
            <a
              href={href}
              className={cn(
                "mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2",
                "rounded-brand bg-(--color-brand) px-5 text-sm font-semibold text-white",
                "shadow-sm transition-all hover:bg-(--color-brand-dark) hover:shadow-md",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2"
              )}
            >
              <Download className="size-4" aria-hidden="true" />
              {cta}
            </a>
          </li>
        ))}
      </ul>

      {/* Not a live region: the hero already announces the resolved version, and
          a second polite region would announce the same string twice. */}
      <p className="mt-6 min-h-5 text-sm text-(--color-canvas-muted)">
        {release ? `${d.versionLabel}: v${release.version}` : d.resolving}
      </p>

      <p className="mt-4 text-sm leading-relaxed text-(--color-canvas-muted)">
        {s.proNote}{" "}
        <a
          href={APP_STORE_URL}
          className="font-medium text-(--color-brand) hover:underline"
        >
          {d.iosCta}
        </a>
      </p>
    </Section>
  )
}

function StructuredData() {
  const { locale, t } = useTranslations()
  const g = t.gps
  const pageUrl = `${SITE_URL}${localizedPath("/gps", locale)}`

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GeoSpoof GPS",
    description: g.meta.description,
    url: pageUrl,
    image: `${SITE_URL}/icon.png`,
    screenshot: [
      `${SITE_URL}/images/gps/geospoof-gps-app-preview-1-light.png`,
      `${SITE_URL}/images/gps/gps-windows-tray-hint.png`,
    ],
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "macOS 13+, Windows 10+",
    // The app itself is a free download; device GPS needs Pro, which is bought
    // in the iOS app. Declaring price 0 is what makes the free download
    // explicit — omitting `offers` entirely reads as "price unknown". No
    // `aggregateRating`: we have no review data for this product and inventing
    // one would be both dishonest and a structured-data violation.
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    // Both installers. `downloadUrl` accepts repeated values, and listing the
    // stable aliases (not the version-pinned URLs) keeps the schema valid
    // between releases.
    downloadUrl: [GPS_LATEST_DMG, GPS_LATEST_EXE],
    author: { "@type": "Person", name: "Anthony Sgro" },
    publisher: {
      "@type": "Organization",
      name: "GeoSpoof",
      legalName: "GeoSpoof LLC",
    },
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: g.hero.breadcrumbHome,
        item: `${SITE_URL}${localizedPath("/", locale)}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: g.hero.breadcrumb,
        item: pageUrl,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // Static, app-authored schema (no user input).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify([softwareApplicationSchema, breadcrumbSchema]),
      }}
    />
  )
}

/**
 * Side-by-side product shots of the GeoSpoof app driving the iPhone's GPS.
 * Theme-aware (light/dark PNGs are full device renders with their own rounding
 * and transparency, so we use a drop-shadow, not a box shadow or clip).
 */
function GpsPhones() {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslations()
  const isDark = resolvedTheme === "dark"
  const img1 = isDark
    ? "/images/gps/gps-1-dark.png"
    : "/images/gps/gps-1-light.png"
  const img2 = isDark
    ? "/images/gps/gps-2-dark.png"
    : "/images/gps/gps-2-light.png"

  return (
    <Section className="pt-0! pb-14! md:pb-20!">
      <div className="flex items-end justify-center gap-6 sm:gap-10">
        <img
          src={img1}
          alt={format(t.gps.screenshotAlt, { n: 1 })}
          width={1135}
          height={2315}
          loading="lazy"
          decoding="async"
          className="h-auto w-48 drop-shadow-2xl sm:w-64 md:w-80"
        />
        <img
          src={img2}
          alt={format(t.gps.screenshotAlt, { n: 2 })}
          width={1135}
          height={2315}
          loading="lazy"
          decoding="async"
          className="h-auto w-48 drop-shadow-2xl sm:w-64 md:w-80"
        />
      </div>
    </Section>
  )
}

/**
 * "How it works" — a customer-facing explainer that sits between the product
 * shots and the setup guide. Four short cards on the flow (pick → drive →
 * wireless → revert) plus a privacy/trust callout. Copy lives in the i18n
 * dictionary (`t.gps.howItWorks`); the icons are locale-independent so they're
 * paired to the steps by index here.
 */
const HOW_IT_WORKS_ICONS = [MapPin, Waypoints, Wifi, RotateCcw] as const

function HowItWorks() {
  const { t } = useTranslations()
  const h = t.gps.howItWorks

  return (
    <Section
      narrow
      className="py-12! md:py-16!"
      aria-labelledby="gps-how-it-works-heading"
    >
      <h2
        id="gps-how-it-works-heading"
        className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        {h.title}
      </h2>
      <p className="mb-8 max-w-2xl text-(--color-canvas-muted)">{h.intro}</p>

      {/* Desktop app shot — the UI everything below refers to. */}
      <GpsMenuShot />

      <ol className="grid gap-5 sm:grid-cols-2">
        {h.steps.map((step, i) => {
          const Icon = HOW_IT_WORKS_ICONS[i] ?? MapPin
          return (
            <li
              key={step.title}
              className="rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas) p-6"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand/10 text-(--color-brand)">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-(--color-canvas-foreground)">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-(--color-canvas-muted)">
                {step.body}
              </p>
            </li>
          )
        })}
      </ol>

      {/* Privacy / trust callout — styled like the setup guide's boxes. */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <ShieldCheck
          className="mt-0.5 size-6 shrink-0 text-(--color-brand)"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-lg font-bold text-(--color-canvas-foreground)">
            {h.privacyTitle}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-(--color-canvas-muted)">
            {h.privacyBody}
          </p>
        </div>
      </div>

      {/* The one signal GPS sync (and the extension) can't change: your IP. */}
      <IpVpnCallout />
    </Section>
  )
}

/**
 * The full statement of the connection requirement, which is the most misread
 * thing about the product. "Cable once, then wireless" was being read as
 * "unplug and go, computer not required". The desktop app is what sets the GPS,
 * so the connection is needed to change a location and not just to set one up;
 * dropping the cable only swaps USB for the local network.
 *
 * The one supported way to keep a location without the computer (turning
 * Developer Mode off) is stated here with its cost attached, so it can't be
 * mistaken for general untethered operation.
 *
 * Anchored as #connection so the hero card and support pages can deep-link.
 */
const CONNECTION_ICONS = [Usb, Wifi, RadioTower] as const

function ConnectionRequirements() {
  const { t } = useTranslations()
  const c = t.gps.connection

  return (
    <Section
      narrow
      id="connection"
      className="scroll-mt-24 py-12! md:py-16!"
      aria-labelledby="gps-connection-heading"
    >
      <h2
        id="gps-connection-heading"
        className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        {c.title}
      </h2>
      <p className="mb-8 max-w-2xl text-(--color-canvas-muted)">{c.intro}</p>

      <ul className="grid gap-5 sm:grid-cols-3">
        {c.links.map((link, i) => {
          const Icon = CONNECTION_ICONS[i] ?? Usb
          return (
            <li
              key={link.title}
              className="rounded-2xl border border-(--color-canvas-border) bg-(--color-canvas) p-6"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand/10 text-(--color-brand)">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-(--color-canvas-foreground)">
                {link.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-(--color-canvas-muted)">
                {link.body}
              </p>
            </li>
          )
        })}
      </ul>

      {/* Keeping a location without the computer, and what it costs you. */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <Unplug
          className="mt-0.5 size-6 shrink-0 text-(--color-brand)"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-lg font-bold text-(--color-canvas-foreground)">
            {c.offlineTitle}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-(--color-canvas-muted)">
            {c.offlineBody}
          </p>
          <p className="mt-2 text-sm leading-relaxed font-medium text-(--color-canvas-foreground)">
            {c.offlineCaveat}
          </p>
        </div>
      </div>

      {/* Hard limits, stated plainly (claims guardrail: no remote/standalone). */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-(--color-canvas-border) p-6 md:p-8">
        <TriangleAlert
          className="mt-0.5 size-6 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-lg font-bold text-(--color-canvas-foreground)">
            {c.limitTitle}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-(--color-canvas-muted)">
            {c.limitBody}
          </p>
        </div>
      </div>
    </Section>
  )
}

/**
 * The IP-address / VPN honesty callout, reused verbatim from the verify page
 * (`t.verify.vpnCard` + `t.vpn.whyProton`, shared copy so there's nothing new
 * to translate). GeoSpoof GPS aligns the device's location, but the IP is still
 * the one signal neither the extension nor device GPS can change — the honest
 * spot for it is right after "How it works". Links to the /vpn hub (disclosure,
 * "why Proton", alternatives) rather than straight to the affiliate URL.
 */
function IpVpnCallout() {
  const { t } = useTranslations()
  const c = t.verify.vpnCard

  return (
    <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-4 rounded-2xl border border-brand/40 bg-brand/5 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-(--color-brand)">
          <Wifi className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm leading-relaxed font-medium text-(--color-canvas-foreground)">
            {c.line1}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {[t.vpn.whyProton.reason1Title, t.vpn.whyProton.reason2Title].map(
              (feature) => (
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
              )
            )}
          </ul>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 self-stretch sm:max-w-xs sm:self-center">
        <LocaleLink
          to="/vpn"
          className={cn(
            "group inline-flex w-full items-center justify-center gap-1.5 text-center",
            "rounded-brand bg-(--color-brand) px-5 py-2.5 text-sm font-semibold text-white",
            "shadow-sm transition-all hover:bg-(--color-brand-dark) hover:shadow-md",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2"
          )}
        >
          {c.cta}
          <ArrowRight
            className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </LocaleLink>
        <p className="text-center text-xs text-(--color-canvas-muted)">
          {format(c.priceNote, { discount: PROTON_DISCOUNT })}
          <span className="mx-2 opacity-40" aria-hidden="true">
            •
          </span>
          {c.guaranteeNote}
        </p>
      </div>
    </div>
  )
}

/**
 * Preview of the GeoSpoof GPS desktop app, shown in the "How it works" section
 * so people recognise the UI the steps refer to. The PNGs carry their own
 * window chrome, so we render as-is with a soft drop-shadow.
 *
 * Platform-aware, and the Windows variant is doing real work rather than just
 * matching the visitor's chrome: it frames the tray-overflow flyout, which is
 * the answer to "I installed it and nothing opened". The app has no window on
 * either OS, and on Windows it can start out hidden behind the taskbar's
 * show-hidden-icons chevron. The caption states where to look either way, so
 * the information isn't only carried by the image.
 *
 * macOS is the fallback for "unknown" (and the prerendered default), matching
 * the hero button. Only the macOS shot is theme-aware; the Windows capture is a
 * single asset, which is fine — it reads on both themes against its own chrome.
 */
function GpsMenuShot() {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslations()
  const os = useDesktopOS()

  if (os === "windows") {
    return (
      <figure className="mb-10">
        <img
          src="/images/gps/gps-windows-tray-hint.png"
          alt={t.gps.trayShotAlt}
          width={472}
          height={616}
          loading="lazy"
          decoding="async"
          className="mx-auto h-auto w-full max-w-sm rounded-xl drop-shadow-2xl"
        />
        <figcaption className="mx-auto mt-4 max-w-md text-center text-sm text-(--color-canvas-muted)">
          {t.gps.trayHintWindows}
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className="mb-10">
      <img
        src={
          resolvedTheme === "dark"
            ? "/images/gps/geospoof-gps-app-preview-1-dark.png"
            : "/images/gps/geospoof-gps-app-preview-1-light.png"
        }
        alt={t.gps.menuShotAlt}
        width={744}
        height={868}
        loading="lazy"
        decoding="async"
        className="mx-auto h-auto w-full max-w-md drop-shadow-2xl"
      />
      <figcaption className="mx-auto mt-4 max-w-md text-center text-sm text-(--color-canvas-muted)">
        {t.gps.trayHintMac}
      </figcaption>
    </figure>
  )
}

/**
 * GeoSpoof GPS app icon shown above the hero heading. Deliberately *not*
 * theme-aware: the dark tile is the icon people actually see on their Mac and
 * iPhone in every appearance, so swapping in the light variant on a light page
 * would show an icon that doesn't match the product. Same asset the homepage
 * products card uses. The PNG carries its own rounding, so it renders as-is
 * with a soft shadow.
 */
function HeroIcon() {
  const { t } = useTranslations()

  return (
    <img
      src="/images/gps/Icon-iOS-Dark-1024@1x.png"
      alt={t.gps.hero.iconAlt}
      width={1024}
      height={1024}
      decoding="async"
      className="mx-auto mb-8 size-40 drop-shadow-2xl sm:size-48 md:size-64"
    />
  )
}

/**
 * One expectation-setting item inside the pre-download card: bolded label,
 * body, and an optional trailing link to the section that explains it in full.
 */
function PreflightItem({
  label,
  body,
  children,
}: {
  label: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex gap-2.5 text-xs leading-relaxed text-(--color-canvas-muted)">
      <span
        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400"
        aria-hidden="true"
      />
      <span>
        <strong className="font-semibold text-(--color-canvas-foreground)">
          {label}:
        </strong>{" "}
        {body}
        {children ? <> {children}</> : null}
      </span>
    </li>
  )
}

/**
 * The two things people have bought GeoSpoof GPS on a wrong assumption about:
 * the computer requirement (it isn't a standalone iPhone app, and the
 * connection is needed to change a location, not just to set one up) and
 * AR-game compatibility.
 *
 * Both belong above the fold. They started out as two loose amber notes stacked
 * under the download button, which read as noise, since a second warning next
 * to the first gets both of them skipped. One framed card with a heading looks
 * deliberate, keeps a single warning glyph, and gives each fact a label people
 * can scan.
 */
function PreflightNotes() {
  const { t } = useTranslations()
  const g = t.gps

  return (
    <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-left">
      <div className="mb-3 flex items-center gap-2">
        <TriangleAlert
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-(--color-canvas-foreground)">
          {g.preflightTitle}
        </h2>
      </div>
      <ul className="space-y-2.5">
        <PreflightItem label={g.tether.label} body={g.tether.body}>
          <a
            href="#connection"
            className="font-medium text-(--color-brand) hover:underline"
          >
            {g.tether.link}
          </a>
        </PreflightItem>
        <PreflightItem label={g.compat.label} body={g.compat.body} />
      </ul>
    </div>
  )
}

export function GpsPage() {
  const { t } = useTranslations()
  const g = t.gps
  // Resolved once here and passed down: both the hero and the downloads list
  // need it, and two `useLatestGpsRelease()` calls would fire two concurrent
  // requests for the same pointer (in-flight requests don't share an HTTP cache
  // hit).
  const release = useLatestGpsRelease()

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        {/* Hero + download */}
        <Section
          className="pt-12! pb-8! md:pt-20! md:pb-12!"
          aria-labelledby="gps-hero-heading"
        >
          <Breadcrumb className="mx-auto mb-8 max-w-3xl">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <LocaleLink to="/">{g.hero.breadcrumbHome}</LocaleLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{g.hero.breadcrumb}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mx-auto max-w-3xl text-center">
            <HeroIcon />
            <h1
              id="gps-hero-heading"
              className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl"
            >
              {g.hero.headingPre}
              <span className="text-(--color-brand)">
                {g.hero.headingEmphasis}
              </span>
              {g.hero.headingPost}
            </h1>
            <p className="mx-auto mb-6 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {g.hero.intro}
            </p>

            <DownloadCard release={release} />

            {/* Set expectations before the download, not after. */}
            <PreflightNotes />
          </div>
        </Section>

        {/* Product shots — the GeoSpoof app that drives the iPhone's GPS. */}
        <GpsPhones />

        {/* How it works — the customer-facing explainer. The full step-by-step
            setup guide lives on /support (the app ships in-app onboarding). */}
        <HowItWorks />

        {/* The tethering requirement, in full — the formal version of the
            "Cable once, then over the network" card above it. */}
        <ConnectionRequirements />

        {/* Every build with its requirements, for anyone downloading for a
            machine they aren't sitting at. The hero only promotes one. */}
        <Downloads release={release} />

        {/* Quiet setup-help link to the full guide on /support, for anyone who
            hits a snag during first-time setup. */}
        <Section narrow className="pt-0! pb-16! md:pb-20!">
          <p className="text-center text-sm text-(--color-canvas-muted)">
            {g.help.title}{" "}
            <LocaleLink
              to="/support"
              hash="setup"
              className="font-medium text-(--color-brand) hover:underline"
            >
              {g.help.supportLink}
            </LocaleLink>
          </p>
        </Section>
      </main>
      <Footer />
      <StructuredData />
    </div>
  )
}
