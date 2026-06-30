import { Link } from "@tanstack/react-router"
import { ChevronDown, Globe, ShieldAlert, ShieldCheck } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import type {Platform} from "@/hooks/use-platform";
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"
import {  usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"
import { format, getDictionary, localizedPath } from "@/lib/i18n"

export type BrowserSlug = "chrome" | "edge" | "firefox" | "safari"

/**
 * Non-translatable browser metadata. The display name is a proper noun and the
 * operating-system list reads the same in every locale, so these stay here;
 * all prose (intro, steps, FAQ, store name with article) lives in the
 * dictionary under `spoofLocation.browsers[slug]` / `spoofLocation.page`.
 */
interface BrowserMeta {
  name: string
  storePlatform: Exclude<Platform, "unknown">
  operatingSystem: string
  /** Whether GeoSpoof's WebRTC protection is available on this browser. */
  webrtc: boolean
}

const BROWSER_META: Record<BrowserSlug, BrowserMeta> = {
  chrome: {
    name: "Chrome",
    storePlatform: "chromium",
    operatingSystem: "Windows, macOS, Linux",
    webrtc: true,
  },
  edge: {
    name: "Edge",
    storePlatform: "chromium",
    operatingSystem: "Windows, macOS",
    webrtc: true,
  },
  firefox: {
    name: "Firefox",
    storePlatform: "firefox",
    operatingSystem: "Windows, macOS, Linux, Android",
    webrtc: true,
  },
  safari: {
    name: "Safari",
    storePlatform: "apple",
    operatingSystem: "iOS, iPadOS, macOS",
    webrtc: false,
  },
}

/** Browser cards on the hub, in display order. */
const HUB_ORDER: Array<BrowserSlug> = ["chrome", "edge", "firefox", "safari"]

/**
 * Build the `head` payload for any page in the spoof-location cluster, in the
 * given locale: localized title/description/OG + self-canonical + hreflang
 * cluster (en / fr / x-default -> English bare path). `head()` can't use hooks,
 * so the route passes its locale explicitly.
 */
export function buildSpoofLocationHead(
  target: BrowserSlug | "hub",
  locale: Locale
) {
  const d = getDictionary(locale).spoofLocation
  const basePath =
    target === "hub" ? "/spoof-location" : `/spoof-location/${target}`
  const meta = target === "hub" ? d.hub : d.browsers[target]
  const canonical = `${SITE_URL}${localizedPath(basePath, locale)}`

  return {
    meta: [
      { title: meta.metaTitle },
      { name: "description", content: meta.metaDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:title", content: meta.ogTitle },
      { property: "og:description", content: meta.metaDescription },
      { name: "twitter:url", content: canonical },
      { name: "twitter:title", content: meta.ogTitle },
      { name: "twitter:description", content: meta.metaDescription },
    ],
    links: [
      { rel: "canonical", href: canonical },
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}${basePath}` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/fr${basePath}` },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: `${SITE_URL}${basePath}`,
      },
    ],
  }
}

export function BrowserSpoofPage({ slug }: { slug: BrowserSlug }) {
  const info = BROWSER_META[slug]
  const { locale, t } = useTranslations()
  const p = t.spoofLocation.page
  const b = t.spoofLocation.browsers[slug]
  const name = info.name

  const platform = usePlatform()
  const store = getStoreLink(platform, `spoof-location-${slug}`)

  const howToSteps = [
    {
      name: format(p.stepInstallName, { name }),
      text: format(p.stepInstallText, { store: b.storeName }),
    },
    { name: format(p.stepEnableName, { name }), text: b.enableStep },
    { name: p.stepSetName, text: p.stepSetText },
    {
      name: format(p.stepReportsName, { name }),
      text: `${p.stepReportsText}${info.webrtc ? p.stepReportsWebrtcSuffix : ""}.`,
    },
  ]

  const faqs = [
    { q: format(p.faqHowQ, { name }), a: format(p.faqHowA, { name }) },
    { q: format(p.faqVpnQ, { name }), a: format(p.faqVpnA, { name }) },
    { q: format(p.faqFreeQ, { name }), a: format(p.faqFreeA, { name }) },
    { q: b.extraFaqQ, a: b.extraFaqA },
  ]

  const pageUrl = `${SITE_URL}${localizedPath(`/spoof-location/${slug}`, locale)}`

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        {/* Hero */}
        <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
          <Breadcrumb className="mx-auto mb-8 max-w-3xl">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={localizedPath("/", locale) as "/"}>
                    {p.breadcrumbHome}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={localizedPath("/spoof-location", locale) as "/"}>
                    {p.breadcrumbHub}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
            >
              {format(p.browserBadge, { name })}
            </Badge>
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              {p.headingPre}
              <span className="text-(--color-brand)">{name}</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {b.intro}
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <a
                href={store ? store.href : "#download"}
                {...(store
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={cn(
                  "inline-flex min-h-12 w-full items-center justify-center sm:min-h-14 sm:w-auto",
                  "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
                  "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {store ? store.cta : format(p.ctaFallback, { name })}
              </a>
              <Link
                to="/verify"
                className={cn(
                  "inline-flex min-h-12 w-full items-center justify-center gap-2 sm:min-h-14 sm:w-auto",
                  "rounded-brand border border-(--color-canvas-border) px-8 text-base font-semibold text-(--color-canvas-foreground) sm:text-lg",
                  "transition-all hover:bg-(--color-canvas-border)",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {p.testLocation}
              </Link>
            </div>
          </div>
        </Section>

        {/* How to */}
        <Section narrow className="py-12! md:py-16!">
          <h2 className="mb-8 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
            {format(p.howToHeading, { name })}
          </h2>
          <ol className="space-y-5">
            {howToSteps.map((step, i) => (
              <li key={step.name} className="flex gap-4">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-(--color-brand)"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-(--color-canvas-foreground)">
                    {step.name}
                  </h3>
                  <p className="mt-1 text-sm text-(--color-canvas-muted)">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* WebRTC availability callout — genuinely browser-specific */}
        <Section narrow className="py-4! md:py-6!">
          <div
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-5",
              info.webrtc
                ? "border-(--color-canvas-border) bg-brand/5"
                : "border-amber-500/30 bg-amber-500/5"
            )}
          >
            {info.webrtc ? (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-(--color-brand)" />
            ) : (
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            )}
            <p className="text-sm text-(--color-canvas-muted)">
              {info.webrtc ? (
                <>
                  <span className="font-semibold text-(--color-canvas-foreground)">
                    {format(p.webrtcAvailableTitle, { name })}
                  </span>{" "}
                  {p.webrtcAvailableBody}
                </>
              ) : (
                <>
                  <span className="font-semibold text-(--color-canvas-foreground)">
                    {format(p.webrtcUnavailableTitle, { name })}
                  </span>{" "}
                  {p.webrtcUnavailableBody}
                </>
              )}
            </p>
          </div>
        </Section>

        {/* FAQ */}
        <Section
          narrow
          className="py-12! md:py-16!"
          aria-labelledby="faq-heading"
        >
          <h2
            id="faq-heading"
            className="mb-6 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
          >
            {p.faqHeading}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
            {faqs.map((faq, i) => (
              <details
                key={faq.q}
                className={cn(
                  "group bg-(--color-canvas) px-5 py-4",
                  i < faqs.length - 1 &&
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

          {/* Cross-link to siblings + hub */}
          <p className="mt-6 text-sm text-(--color-canvas-muted)">
            <Globe className="mr-1.5 inline size-4 align-text-bottom" />
            {p.crossLinkLead}
            <Link
              to={localizedPath("/spoof-location", locale) as "/"}
              className="font-medium text-(--color-brand) hover:underline"
            >
              {p.crossLinkText}
            </Link>
            .
          </p>
        </Section>

        <DownloadSection
          campaign={`spoof-location-${slug}`}
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "GeoSpoof",
              description: format(p.schemaSoftwareDesc, { name }),
              url: pageUrl,
              image: `${SITE_URL}/icon.png`,
              applicationCategory: "BrowserApplication",
              operatingSystem: info.operatingSystem,
              browserRequirements: `Requires ${name}`,
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "Anthony Sgro" },
            },
            {
              "@context": "https://schema.org",
              "@type": "HowTo",
              name: format(p.howToHeading, { name }),
              step: howToSteps.map((s) => ({
                "@type": "HowToStep",
                name: s.name,
                text: s.text,
              })),
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: p.breadcrumbHome,
                  item: `${SITE_URL}${localizedPath("/", locale)}`,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: p.breadcrumbHub,
                  item: `${SITE_URL}${localizedPath("/spoof-location", locale)}`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name,
                  item: pageUrl,
                },
              ],
            },
          ]),
        }}
      />
    </div>
  )
}

/**
 * Hub page (`/spoof-location`) listing the per-browser guides. Locale-aware via
 * `useTranslations`; shared by the English and French routes.
 */
export function SpoofLocationHub() {
  const { locale, t } = useTranslations()
  const h = t.spoofLocation.hub

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
            >
              {h.badge}
            </Badge>
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              {h.headingPre}
              <span className="text-(--color-brand)">{h.headingEmphasis}</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {h.intro}
            </p>
          </div>

          {/* Browser cards */}
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {HUB_ORDER.map((slug) => {
              const info = BROWSER_META[slug]
              const b = t.spoofLocation.browsers[slug]
              return (
                <Link
                  key={slug}
                  to={localizedPath(`/spoof-location/${slug}`, locale) as "/"}
                  className={cn(
                    "flex flex-col gap-1 rounded-2xl border border-(--color-canvas-border) p-6",
                    "transition-all hover:border-(--color-brand) hover:shadow-lg",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  )}
                >
                  <span className="text-lg font-bold text-(--color-canvas-foreground)">
                    {format(h.cardTitle, { name: info.name })}
                  </span>
                  <span className="text-sm text-(--color-canvas-muted)">
                    {b.storeShort} · {info.operatingSystem}
                  </span>
                  <span className="mt-2 text-sm font-semibold text-(--color-brand)">
                    {h.openGuide} →
                  </span>
                </Link>
              )
            })}
          </div>
        </Section>

        <DownloadSection
          campaign="spoof-location"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
    </div>
  )
}
