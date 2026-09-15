import { createFileRoute } from "@tanstack/react-router"
import {
  Apple,
  ArrowRight,
  Check,
  ChevronDown,
  Footprints,
  Globe,
  LayoutGrid,
  LocateFixed,
  MapPin,
  Minus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Unplug,
} from "lucide-react"
import type { Dictionary, Locale } from "@/lib/i18n"
import {
  buildAlternateLinks,
  buildOgLocaleMeta,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

/**
 * GeoSpoof Pro purchase happens in-app on the App Store (Apple owns the real,
 * localized, tax-inclusive price). The site shows US prices as a preview and
 * routes here; `ct=pro` attributes installs from this page in App Store
 * Connect.
 */
const APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=pro&mt=8"

/** Shared CTA shape, matching `ProductsSection`'s primary button. */
const ctaClass = cn(
  "group inline-flex items-center justify-center gap-2",
  "min-h-14 rounded-brand px-8",
  "text-lg font-semibold transition-all",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

const arrowClass =
  "size-4 shrink-0 transition-transform group-hover:translate-x-0.5"

// ---------------------------------------------------------------------------
// Free vs Pro
//
// Ported from the iOS onboarding comparison (`OnboardingDeviceGpsView` in
// `safari/Shared (App)/SpoofDetailsView.swift`) so the web and the app cannot
// disagree about what a purchase buys. Two properties of that table are load
// bearing and are preserved here:
//
//   * **Free rows lead.** A reader sees three marks in the Free column before
//     the first dash, so this reads as an upgrade rather than a hostage note.
//     That's the business plan's rule — the free-vs-paid line is power and
//     convenience, never "we crippled your privacy unless you pay" — and it is
//     also just true: the core spoofing path is free.
//   * **Every `free: false` row maps to a real gate.** `proFeaturesBlocked`
//     forces per-site scope to "all", accuracy to Realistic, precision to
//     exact and locale spoofing off; `autoSyncBlocked` stops automatic
//     re-sync; device GPS, routes, widgets and the map picker are gated app
//     side. This list is not a place for optimism — a page promising something
//     the build doesn't do is a refund and a 1-star review.
//
// The row tints are the app's, kept so a visitor who installs recognises the
// same table on the device-GPS screen.
// ---------------------------------------------------------------------------

type PlanRowKey = keyof Dictionary["pro"]["plans"]["rows"]

const planRows: Array<{
  key: PlanRowKey
  Icon: typeof Globe
  tint: string
  free: boolean
  /** Device-GPS rows get the heavier label — they're the headline. */
  gps?: boolean
}> = [
  { key: "spoofing", Icon: Globe, tint: "text-blue-500", free: true },
  {
    key: "timezoneWebrtc",
    Icon: ShieldCheck,
    tint: "text-indigo-500",
    free: true,
  },
  { key: "vpnSync", Icon: MapPin, tint: "text-cyan-500", free: true },
  {
    key: "deviceGps",
    Icon: LocateFixed,
    tint: "text-(--color-brand)",
    free: false,
    gps: true,
  },
  {
    key: "routes",
    Icon: Footprints,
    tint: "text-pink-500",
    free: false,
    gps: true,
  },
  {
    key: "offlineHold",
    Icon: Unplug,
    tint: "text-orange-500",
    free: false,
    gps: true,
  },
  {
    key: "autoResync",
    Icon: RefreshCw,
    tint: "text-emerald-500",
    free: false,
  },
  {
    key: "perSite",
    Icon: SlidersHorizontal,
    tint: "text-teal-500",
    free: false,
  },
  { key: "widgets", Icon: LayoutGrid, tint: "text-purple-500", free: false },
]

/** The eight detail cards, in the order the argument is made (GPS first). */
type UnlockKey = keyof Dictionary["pro"]["unlocks"]["items"]

const unlockCards: Array<{ key: UnlockKey; Icon: typeof Globe; tint: string }> =
  [
    { key: "gps", Icon: LocateFixed, tint: "text-(--color-brand)" },
    { key: "routes", Icon: Footprints, tint: "text-pink-500" },
    { key: "offlineHold", Icon: Unplug, tint: "text-orange-500" },
    { key: "autoResync", Icon: RefreshCw, tint: "text-emerald-500" },
    { key: "perSite", Icon: SlidersHorizontal, tint: "text-teal-500" },
    { key: "mapPicker", Icon: MapPin, tint: "text-cyan-500" },
    { key: "widgets", Icon: LayoutGrid, tint: "text-purple-500" },
    { key: "future", Icon: Sparkles, tint: "text-indigo-500" },
  ]

/**
 * Build the `head` payload for the GeoSpoof Pro page in a given locale:
 * localized title/description/OG + self-canonical + hreflang cluster.
 */
export function buildProHead(locale: Locale) {
  const m = getDictionary(locale).pro.meta
  const canonical = `${SITE_URL}${localizedPath("/pro", locale)}`
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
      ...buildAlternateLinks("/pro", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/pro")({
  component: ProPage,
  head: ({ params }) => buildProHead(toLocale(params.locale)),
})

function ProPage() {
  const { t, locale } = useTranslations()
  const p = t.pro

  // Prices are display-only previews; the tier is chosen in-app on the App
  // Store. The yearly tier is highlighted as the recommended option.
  const tiers = [
    { ...p.pricing.monthly, highlighted: false },
    { ...p.pricing.yearly, highlighted: true },
    { ...p.pricing.lifetime, highlighted: false },
  ]

  const pageUrl = `${SITE_URL}${localizedPath("/pro", locale)}`

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GeoSpoof Pro",
    description: p.meta.description,
    url: pageUrl,
    image: `${SITE_URL}/icon.png`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "iOS, iPadOS, macOS",
    // US base prices; Apple localizes per storefront at purchase.
    offers: [
      {
        "@type": "Offer",
        name: "Monthly",
        price: "1.99",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Yearly",
        price: "9.99",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Lifetime",
        price: "24.99",
        priceCurrency: "USD",
      },
    ],
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
        name: p.hero.breadcrumbHome,
        item: `${SITE_URL}${localizedPath("/", locale)}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: p.hero.breadcrumb,
        item: pageUrl,
      },
    ],
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faq.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        {/* Hero */}
        <Section className="pt-12! pb-4! md:pt-20! md:pb-6!">
          <Breadcrumb className="mx-auto mb-8 max-w-3xl">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <LocaleLink to="/">{p.hero.breadcrumbHome}</LocaleLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{p.hero.breadcrumb}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full border border-(--color-brand)/30 bg-(--color-brand)/10 px-3 py-1 text-sm font-semibold tracking-wide text-(--color-brand) uppercase">
              {p.hero.badge}
            </span>
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              {p.hero.heading}
            </h1>
            <p className="mx-auto max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {p.hero.subhead}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  ctaClass,
                  "bg-(--color-brand) text-white shadow-md",
                  "hover:bg-(--color-brand-dark) hover:shadow-lg"
                )}
              >
                <Apple className="size-5" aria-hidden="true" />
                {p.hero.ctaPrimary}
                <ArrowRight className={arrowClass} aria-hidden="true" />
              </a>
              <a
                href="#compare"
                className={cn(
                  ctaClass,
                  "border border-(--color-canvas-border) text-(--color-canvas-foreground)",
                  "hover:bg-(--color-canvas-border)"
                )}
              >
                {p.hero.ctaSecondary}
              </a>
            </div>

            <p className="mt-5 text-xs font-medium tracking-wide text-(--color-canvas-muted)">
              {p.hero.trust}
            </p>
          </div>
        </Section>

        {/* Free vs Pro — the centerpiece. */}
        <Section
          id="compare"
          className="scroll-mt-24 py-10! md:py-16!"
          aria-labelledby="compare-heading"
        >
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
              {p.plans.eyebrow}
            </p>
            <h2
              id="compare-heading"
              className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl"
            >
              {p.plans.heading}
            </h2>
            <p className="mx-auto max-w-2xl text-(--color-canvas-muted)">
              {p.plans.subhead}
            </p>
          </div>

          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-(--color-canvas-border)">
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b border-(--color-canvas-border) hover:bg-transparent">
                    <TableHead className="pl-4 text-xs font-semibold whitespace-normal text-(--color-canvas-muted) sm:pl-6 sm:text-sm">
                      {p.plans.featureHeader}
                    </TableHead>
                    <TableHead className="w-16 px-1 text-center text-xs font-semibold whitespace-normal text-(--color-canvas-muted) sm:w-28 sm:px-2 sm:text-sm">
                      {p.plans.freeHeader}
                    </TableHead>
                    {/* The column being sold: weight and brand colour, matching
                        every tick beneath it so header and column read as one. */}
                    <TableHead className="w-16 px-1 text-center text-xs font-bold whitespace-normal text-(--color-brand) sm:w-28 sm:px-2 sm:text-sm">
                      {p.plans.proHeader}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planRows.map((row) => (
                    <TableRow
                      key={row.key}
                      className="border-b border-(--color-canvas-border) hover:bg-canvas-border/30"
                    >
                      <TableCell className="py-3 pl-4 text-sm whitespace-normal text-(--color-canvas-foreground) sm:py-4 sm:pl-6 sm:text-base">
                        <span className="flex items-start gap-2.5">
                          <row.Icon
                            className={cn("mt-0.5 size-4 shrink-0", row.tint)}
                            aria-hidden="true"
                          />
                          <span className={row.gps ? "font-semibold" : ""}>
                            {p.plans.rows[row.key]}
                          </span>
                        </span>
                      </TableCell>
                      {/* Free: a quiet tick, or a dash. Deliberately not green
                          — one continuous run of colour is the visual argument,
                          and it belongs to the paid column. */}
                      <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-4">
                        {row.free ? (
                          <Check
                            className="mx-auto size-4 text-(--color-canvas-foreground)/55"
                            strokeWidth={3}
                            aria-label={p.plans.bothValue}
                          />
                        ) : (
                          <Minus
                            className="mx-auto size-4 text-(--color-canvas-muted) opacity-50"
                            aria-label={p.plans.proOnlyValue}
                          />
                        )}
                      </TableCell>
                      {/* Pro: always included — that's what Pro means here. */}
                      <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-4">
                        <span
                          className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)"
                          aria-hidden="true"
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-(--color-canvas-border) bg-canvas-border/20 px-6 py-4">
              <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
                <Check
                  className="size-3.5 text-(--color-canvas-foreground)/55"
                  strokeWidth={3}
                  aria-hidden="true"
                />
                {p.plans.legend.both}
              </span>
              <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
                <Minus className="size-3.5 opacity-50" aria-hidden="true" />
                {p.plans.legend.proOnly}
              </span>
            </div>
          </div>

          <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-(--color-canvas-muted)">
            {p.plans.scopeNote}
          </p>
        </Section>

        {/* What Pro unlocks — the detail behind each Pro-only row. */}
        <Section className="py-12! md:py-20!" aria-labelledby="unlocks-heading">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
              {p.unlocks.eyebrow}
            </p>
            <h2
              id="unlocks-heading"
              className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl"
            >
              {p.unlocks.heading}
            </h2>
            <p className="mx-auto max-w-2xl text-(--color-canvas-muted)">
              {p.unlocks.subhead}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {unlockCards.map((card) => {
              const item = p.unlocks.items[card.key]
              return (
                <div
                  key={card.key}
                  className="flex flex-col rounded-2xl border border-(--color-canvas-border) p-6"
                >
                  <span className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-canvas-border/40">
                    <card.Icon
                      className={cn("size-5", card.tint)}
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mb-2 font-bold text-(--color-canvas-foreground)">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-(--color-canvas-muted)">
                    {item.body}
                  </p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Pricing */}
        <Section
          id="pricing"
          className="scroll-mt-24 py-12! md:py-20!"
          aria-labelledby="pricing-heading"
        >
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
              {p.pricing.eyebrow}
            </p>
            <h2
              id="pricing-heading"
              className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl"
            >
              {p.pricing.heading}
            </h2>
            <p className="mx-auto max-w-2xl text-(--color-canvas-muted)">
              {p.pricing.subhead}
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl grid-cols-1 items-stretch gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col items-center rounded-2xl border p-8 text-center",
                  tier.highlighted
                    ? "border-(--color-brand) shadow-md ring-1 ring-brand/40"
                    : "border-(--color-canvas-border)"
                )}
              >
                {tier.badge ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-(--color-brand) px-3 py-1 text-xs font-semibold text-white">
                    {tier.badge}
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold text-(--color-canvas-foreground)">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-(--color-canvas-foreground)">
                    {tier.price}
                  </span>
                  <span className="text-(--color-canvas-muted)">
                    {tier.period}
                  </span>
                </div>
                {tier.subNote ? (
                  <p className="mt-1 text-sm text-(--color-canvas-muted)">
                    {tier.subNote}
                  </p>
                ) : null}
                {tier.note ? (
                  <p className="mt-2 text-sm font-medium text-(--color-brand)">
                    {tier.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Single CTA — the tier is picked in-app on the App Store. */}
          <div className="mx-auto mt-10 flex max-w-4xl flex-col items-center">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                ctaClass,
                "bg-(--color-brand) text-white shadow-md",
                "hover:bg-(--color-brand-dark) hover:shadow-lg"
              )}
            >
              <Apple className="size-5" aria-hidden="true" />
              {p.pricing.cta}
              <ArrowRight className={arrowClass} aria-hidden="true" />
            </a>
            <p className="mt-4 max-w-md text-center text-sm text-(--color-canvas-muted)">
              {p.pricing.universal}
            </p>
            <p className="mt-2 max-w-md text-center text-xs text-(--color-canvas-muted)">
              {p.pricing.fineprint}
            </p>
            <p className="mt-2 max-w-md text-center text-xs text-(--color-canvas-muted)">
              {p.pricing.lifetimeNote}
            </p>
          </div>
        </Section>

        {/* Before you buy — the disclosures, stated before the FAQ rather than
            buried under it. Needing a computer is device GPS's most
            refund-producing surprise. */}
        <Section narrow className="py-8! md:py-12!">
          <div className="rounded-2xl border border-(--color-canvas-border) bg-canvas-border/25 p-6 md:p-8">
            <h2 className="mb-4 text-lg font-bold text-(--color-canvas-foreground)">
              {p.requirements.heading}
            </h2>
            <ul className="flex flex-col gap-3">
              {[
                {
                  Icon: LocateFixed,
                  text: p.requirements.computer,
                },
                { Icon: TriangleAlert, text: p.requirements.arGames },
                { Icon: Globe, text: p.requirements.extensions },
              ].map((line) => (
                <li key={line.text} className="flex items-start gap-3">
                  <line.Icon
                    className="mt-0.5 size-4 shrink-0 text-(--color-canvas-muted)"
                    aria-hidden="true"
                  />
                  <span className="text-sm leading-relaxed text-(--color-canvas-muted)">
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* FAQ — native <details>, matching the rest of the site. */}
        <Section
          narrow
          className="py-12! md:py-16!"
          aria-labelledby="faq-heading"
        >
          <h2
            id="faq-heading"
            className="mb-6 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
          >
            {p.faq.heading}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
            {p.faq.items.map((faq, i) => (
              <details
                key={faq.q}
                className={cn(
                  "group bg-(--color-canvas) px-5 py-4",
                  i < p.faq.items.length - 1 &&
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

          <p className="mt-6 text-center text-sm text-(--color-canvas-muted)">
            {p.faq.gpsLead}
            <LocaleLink
              to="/gps"
              className="font-medium text-(--color-brand) hover:underline"
            >
              {p.faq.gpsLink}
            </LocaleLink>
            {p.faq.gpsTail}
          </p>
        </Section>
      </main>
      <Footer />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            softwareApplicationSchema,
            breadcrumbSchema,
            faqSchema,
          ]),
        }}
      />
    </div>
  )
}
