import { createFileRoute } from "@tanstack/react-router"
import { Apple, ArrowRight, Check } from "lucide-react"
import type { Locale } from "@/lib/i18n"
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

  const features = [
    p.features.items.everythingFree,
    p.features.items.gps,
    p.features.items.vpnSync,
    p.features.items.widgets,
    p.features.items.mapkit,
    p.features.items.filters,
    p.features.items.advanced,
    p.features.items.futureUpdates,
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
          </div>
        </Section>

        {/* Pricing tiers */}
        <Section className="py-8! md:py-12!">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
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
                <h2 className="text-lg font-semibold text-(--color-canvas-foreground)">
                  {tier.name}
                </h2>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-(--color-canvas-foreground)">
                    {tier.price}
                  </span>
                  <span className="text-(--color-canvas-muted)">
                    {tier.period}
                  </span>
                </div>
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
                "group inline-flex min-h-14 items-center justify-center gap-2",
                "rounded-brand bg-(--color-brand) px-8 text-lg font-semibold text-white",
                "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
              )}
            >
              <Apple className="size-5" aria-hidden="true" />
              {p.pricing.cta}
              <ArrowRight
                className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
            <p className="mt-3 max-w-md text-center text-xs text-(--color-canvas-muted)">
              {p.pricing.fineprint}
            </p>
          </div>
        </Section>

        {/* What's included */}
        <Section className="py-8! md:py-16!">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-8 text-center text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
              {p.features.heading}
            </h2>
            <ul className="flex flex-col gap-4">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)">
                    <Check
                      className="size-3.5"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-(--color-canvas-foreground)">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </main>
      <Footer />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareApplicationSchema, breadcrumbSchema]),
        }}
      />
    </div>
  )
}
