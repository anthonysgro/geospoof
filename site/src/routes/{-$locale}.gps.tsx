import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Apple,
  ArrowRight,
  Check,
  MapPin,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
  Wifi,
} from "lucide-react"
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
import { LocaleLink } from "@/components/LocaleLink"

/**
 * GeoSpoof GPS is built + notarized by the private `geospoof-gps` repo's CI and
 * published to the CDN (not GitHub Releases — the repo is private). The site
 * links the stable alias, which always points at the newest build and works
 * during SSR/prerender with no JS, and reads a small pointer for the version.
 */
const GPS_CDN_BASE = "https://cdn.geospoof.com/gps"
/** Stable download alias — always the latest build. Safe as an SSR href. */
const GPS_LATEST_DMG = `${GPS_CDN_BASE}/latest.dmg`
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

/** Shape of the CDN `gps/latest.json` pointer written by the release workflow. */
interface LatestGpsManifest {
  version: string
  dmg: string
  date?: string
}

interface ResolvedRelease {
  version: string
  dmgUrl: string
}

/**
 * Resolve the latest GeoSpoof GPS version at runtime from the CDN pointer
 * (`gps/latest.json`). Returns `null` until resolved (and if the request
 * fails), in which case the UI keeps the stable `latest.dmg` download link,
 * which works during SSR/prerender and offline.
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
        setRelease({ version: data.version, dmgUrl: data.dmg })
      })
      .catch(() => {
        /* leave the stable latest.dmg link in place */
      })
    return () => controller.abort()
  }, [])

  return release
}

function DownloadCard() {
  const { t } = useTranslations()
  const d = t.gps.download
  const release = useLatestGpsRelease()

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center">
      <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
        <a
          href={release ? release.dmgUrl : GPS_LATEST_DMG}
          className={cn(
            "inline-flex min-h-14 w-full items-center justify-center gap-2 sm:w-auto",
            "rounded-brand bg-(--color-brand) px-8 text-lg font-semibold text-white",
            "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
          )}
        >
          <Apple className="size-5" aria-hidden="true" />
          {d.cta}
        </a>
      </div>

      <p
        className="mt-3 min-h-5 text-sm text-(--color-canvas-muted)"
        aria-live="polite"
      >
        {release ? `${d.versionLabel}: v${release.version}` : d.resolving}
      </p>

      <p className="mt-1 max-w-md text-center text-xs text-(--color-canvas-muted)">
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
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "macOS 13+",
    downloadUrl: GPS_LATEST_DMG,
    author: { "@type": "Person", name: "Anthony Sgro" },
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
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {h.title}
      </h2>
      <p className="mb-8 max-w-2xl text-(--color-canvas-muted)">{h.intro}</p>

      {/* Menu-bar app shot — the UI everything below refers to. */}
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
 * Preview of the GeoSpoof GPS macOS app, shown in the "How it works" section so
 * people recognise the UI the steps refer to. Theme-aware PNGs carry their own
 * window chrome, so we render as-is with a soft drop-shadow.
 */
function GpsMenuShot() {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslations()
  const src =
    resolvedTheme === "dark"
      ? "/images/gps/geospoof-gps-app-preview-1-dark.png"
      : "/images/gps/geospoof-gps-app-preview-1-light.png"

  return (
    <img
      src={src}
      alt={t.gps.menuShotAlt}
      width={744}
      height={868}
      loading="lazy"
      decoding="async"
      className="mx-auto mb-10 h-auto w-full max-w-md drop-shadow-2xl"
    />
  )
}

/**
 * Theme-aware GeoSpoof GPS app icon shown above the hero heading. The two PNGs
 * are the shipped iOS app icons (Default = light, Dark = dark) with their own
 * rounding baked in, so we let them render as-is and only add a soft shadow.
 */
function HeroIcon() {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslations()
  const src =
    resolvedTheme === "dark"
      ? "/images/gps/Icon-iOS-Dark-1024@1x.png"
      : "/images/gps/Icon-iOS-Default-1024@1x.png"

  return (
    <img
      src={src}
      alt={t.gps.hero.iconAlt}
      width={1024}
      height={1024}
      decoding="async"
      className="mx-auto mb-8 size-40 drop-shadow-2xl sm:size-48 md:size-64"
    />
  )
}

export function GpsPage() {
  const { t } = useTranslations()
  const g = t.gps

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        {/* Hero + download */}
        <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
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
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              {g.hero.headingPre}
              <span className="text-(--color-brand)">
                {g.hero.headingEmphasis}
              </span>
              {g.hero.headingPost}
            </h1>
            <p className="mx-auto mb-6 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {g.hero.intro}
            </p>

            <DownloadCard />

            {/* Compatibility caveat — sets expectations for AR-game seekers up
                front (before they download): device GPS is for privacy,
                browsing and development, not games like Pokémon GO. */}
            <p className="mx-auto mt-6 flex max-w-xl items-start justify-center gap-2 text-left text-xs text-(--color-canvas-muted)">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold text-(--color-canvas-foreground)">
                  {g.compat.label}:
                </strong>{" "}
                {g.compat.body}
              </span>
            </p>
          </div>
        </Section>

        {/* Product shots — the GeoSpoof app that drives the iPhone's GPS. */}
        <GpsPhones />

        {/* How it works — the customer-facing explainer. The full step-by-step
            setup guide lives on /support (the app ships in-app onboarding). */}
        <HowItWorks />

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
