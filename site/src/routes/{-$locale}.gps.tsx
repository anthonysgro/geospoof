import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Apple,
  FlaskConical,
  ListChecks,
  MapPin,
  RotateCcw,
  ShieldCheck,
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
/** GeoSpoof iOS app — the control surface that sets the location (Pro unlocks device GPS). */
const APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=gps&mt=8"
/** Xcode on the Mac App Store — provides the iOS developer image GeoSpoof GPS mounts. */
const XCODE_URL = "https://apps.apple.com/app/xcode/id497799835"

/** Anchor id for the setup guide section; the hero's "Set up guide" button scrolls here. */
const SETUP_SECTION_ID = "setup"

/**
 * Screenshots that illustrate specific setup steps, keyed by the step's index
 * in `t.gps.setup.steps`. Kept out of the i18n dictionary because the asset
 * paths are locale-independent; the alt text is English since the screenshots
 * themselves show the English UI. `width`/`height` are the intrinsic pixel
 * dimensions so the browser can reserve space and avoid layout shift.
 */
const SETUP_STEP_IMAGES: Partial<
  Record<
    number,
    {
      src: string
      alt: string
      width: number
      height: number
      /** Optional Tailwind max-width override; otherwise picked by aspect ratio. */
      maxWidthClass?: string
    }
  >
> = {
  // Step 1 — Install the app
  0: {
    src: "/images/gps/gps-dmg-install.png",
    alt: "The GeoSpoof GPS disk image open in Finder, with the app icon being dragged onto the Applications folder.",
    width: 1342,
    height: 1104,
    // This shot is wide; cap it smaller so it doesn't dominate the guide.
    maxWidthClass: "max-w-xs",
  },
  // Step 2 — Allow Local Network access
  1: {
    src: "/images/gps/geospoof-gps-local-network-settings.jpg",
    alt: "macOS System Settings, Privacy & Security ▸ Local Network, with the GeoSpoof GPS toggle switched on.",
    width: 996,
    height: 484,
  },
  // Step 5 — Enable Developer Mode
  4: {
    src: "/images/gps/ios-developer-mode-on.jpg",
    alt: "iPhone Settings, Privacy & Security ▸ Developer Mode, with the toggle switched on.",
    width: 1206,
    height: 1307,
  },
}

/**
 * Outbound links attached to specific setup steps, keyed by the step's index in
 * `t.gps.setup.steps` (mirrors `SETUP_STEP_IMAGES`). The URL lives here because
 * it's locale-independent; the visible label comes from the step's `link.label`
 * in the dictionary so it stays translatable.
 */
const SETUP_STEP_LINK_HREFS: Partial<Record<number, string>> = {
  // Step 7 — Prepare the developer image → get Xcode (ships the developer image).
  6: XCODE_URL,
  // Step 8 — Pick a location in GeoSpoof → get the iOS app (the control surface).
  7: APP_STORE_URL,
}

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

  // Smooth-scroll to the setup guide. Falls back to the native #setup jump if
  // JS is unavailable or the target isn't found (e.g. during prerender).
  const handleSetupClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(SETUP_SECTION_ID)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: "smooth" })
  }

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
        <a
          href={`#${SETUP_SECTION_ID}`}
          onClick={handleSetupClick}
          className={cn(
            "inline-flex min-h-14 w-full items-center justify-center gap-2 sm:w-auto",
            "rounded-brand border border-(--color-canvas-border) px-8 text-lg font-semibold text-(--color-canvas-foreground)",
            "transition-all hover:border-(--color-brand) hover:bg-brand/5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
          )}
        >
          <ListChecks className="size-5" aria-hidden="true" />
          {d.setupCta}
        </a>
      </div>

      <p
        className="mt-3 min-h-5 text-sm text-(--color-canvas-muted)"
        aria-live="polite"
      >
        {release ? `${d.versionLabel}: v${release.version}` : d.resolving}
      </p>

      <p className="mt-1 max-w-md text-center text-xs text-(--color-canvas-muted)">
        {d.note}
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
    </Section>
  )
}

/**
 * Screenshot of the GeoSpoof GPS macOS menu-bar app, shown at the top of the
 * setup guide so people recognise the UI the steps refer to. Theme-aware PNGs
 * carry their own window chrome, so we render as-is with a soft drop-shadow.
 */
function GpsMenuShot() {
  const { resolvedTheme } = useTheme()
  const { t } = useTranslations()
  const src =
    resolvedTheme === "dark"
      ? "/images/gps/gps-desktop-menu-icon-1-dark.png"
      : "/images/gps/gps-desktop-menu-icon-1-light.png"

  return (
    <img
      src={src}
      alt={t.gps.menuShotAlt}
      width={744}
      height={700}
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

/** A single "What you'll need" bullet — brand dot + rich (possibly linked) content. */
function ReqItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-(--color-canvas-muted)">
      <span
        className="mt-2 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
        aria-hidden="true"
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

/** External link styled for inline use inside a requirement bullet. */
function ReqLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-(--color-brand) hover:underline"
    >
      {children}
    </a>
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

            {/* Experimental notice — this is an early, optional add-on. */}
            <div
              role="note"
              className="mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left"
            >
              <FlaskConical
                className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-(--color-canvas-foreground)">
                  {g.experimental.title}
                </p>
                <p className="mt-1 text-sm text-(--color-canvas-muted)">
                  {g.experimental.body}
                </p>
              </div>
            </div>

            <DownloadCard />
          </div>
        </Section>

        {/* Product shots — the GeoSpoof app that drives the iPhone's GPS. */}
        <GpsPhones />

        {/* How it works — the customer-facing explainer, before the setup steps. */}
        <HowItWorks />

        {/* Setup guide — mirrors the in-app "Set Up…" wizard, step for step. */}
        <Section
          id={SETUP_SECTION_ID}
          narrow
          className="scroll-mt-24 py-12! md:py-16!"
        >
          <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
            {g.setup.title}
          </h2>
          <p className="mb-8 text-(--color-canvas-muted)">{g.setup.intro}</p>

          {/* What you'll need — right under the setup header so people can gather prerequisites first. */}
          <div className="mb-10 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-(--color-brand)">
              <ListChecks className="size-6" aria-hidden="true" />
              <h3 className="text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
                {g.requirements.title}
              </h3>
            </div>
            <ul className="space-y-3">
              <ReqItem>{g.requirements.macos}</ReqItem>
              <ReqItem>
                {g.requirements.appPre}
                <ReqLink href={APP_STORE_URL}>{g.requirements.appLink}</ReqLink>
                {g.requirements.appPost}
              </ReqItem>
              <ReqItem>{g.requirements.iphone}</ReqItem>
              <ReqItem>
                {g.requirements.xcodePre}
                <ReqLink href={XCODE_URL}>{g.requirements.xcodeLink}</ReqLink>
                {g.requirements.xcodePost}
              </ReqItem>
            </ul>
          </div>

          <ol className="space-y-6 md:space-y-8">
            {g.setup.steps.map((step, i) => {
              const bullets = "bullets" in step ? step.bullets : undefined
              const image = SETUP_STEP_IMAGES[i]
              const link = "link" in step ? step.link : undefined
              const linkHref = SETUP_STEP_LINK_HREFS[i]
              return (
                <li key={step.name} className="flex gap-4">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-(--color-brand)"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-(--color-canvas-foreground)">
                      {step.name}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-(--color-canvas-muted)">
                      {step.text}
                    </p>
                    {bullets && bullets.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex gap-2.5 text-sm leading-relaxed text-(--color-canvas-muted)"
                          >
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
                              aria-hidden="true"
                            />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {link && linkHref && (
                      <a
                        href={linkHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
                      >
                        {link.label}
                      </a>
                    )}
                    {image && (
                      <img
                        src={image.src}
                        alt={image.alt}
                        width={image.width}
                        height={image.height}
                        loading="lazy"
                        decoding="async"
                        className={cn(
                          "mt-4 h-auto w-full rounded-xl border border-(--color-canvas-border) shadow-sm",
                          image.maxWidthClass ??
                            (image.height > image.width
                              ? "max-w-[16rem]"
                              : "max-w-md")
                        )}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {/* Still stuck? Route people to support, and invite feedback. */}
          <div className="mt-10 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
            <h3 className="text-lg font-bold text-(--color-canvas-foreground)">
              {g.help.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-(--color-canvas-muted)">
              {g.help.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <LocaleLink
                to="/support"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
              >
                {g.help.supportLink}
              </LocaleLink>
              <LocaleLink
                to="/feedback"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
              >
                {g.help.feedbackLink}
              </LocaleLink>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
      <StructuredData />
    </div>
  )
}
