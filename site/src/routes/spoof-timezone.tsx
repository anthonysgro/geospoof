import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronDown, Clock, Globe, ShieldCheck } from "lucide-react"
import type { Locale } from "@/lib/i18n"
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
import { usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"
import { getDictionary, localizedPath } from "@/lib/i18n"

/**
 * Build the `head` payload for the timezone page in a given locale: localized
 * title/description/OG + self-canonical + hreflang cluster. `head()` can't use
 * hooks, so the route passes its locale explicitly.
 */
export function buildSpoofTimezoneHead(locale: Locale) {
  const m = getDictionary(locale).spoofTimezone.meta
  const canonical = `${SITE_URL}${localizedPath("/spoof-timezone", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:title", content: m.ogTitle },
      { property: "og:description", content: m.description },
      { name: "twitter:url", content: canonical },
      { name: "twitter:title", content: m.ogTitle },
      { name: "twitter:description", content: m.description },
    ],
    links: [
      { rel: "canonical", href: canonical },
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/spoof-timezone` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/fr/spoof-timezone` },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: `${SITE_URL}/spoof-timezone`,
      },
    ],
  }
}

export const Route = createFileRoute("/spoof-timezone")({
  component: SpoofTimezonePage,
  head: () => buildSpoofTimezoneHead("en"),
})

// ---------------------------------------------------------------------------
// Structured data — SoftwareApplication, HowTo, and FAQPage. Built from the
// active dictionary so it's localized per route.
// ---------------------------------------------------------------------------

function StructuredData() {
  const { locale, t } = useTranslations()
  const tz = t.spoofTimezone
  const pageUrl = `${SITE_URL}${localizedPath("/spoof-timezone", locale)}`

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GeoSpoof",
    description: tz.meta.description,
    url: pageUrl,
    image: `${SITE_URL}/icon.png`,
    applicationCategory: "BrowserApplication",
    operatingSystem: "Windows, macOS, Linux, iOS, iPadOS, Android",
    browserRequirements: "Requires Firefox, Chrome, Brave, Edge, or Safari",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Anthony Sgro" },
  }

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: tz.howTo.schemaName,
    description: tz.howTo.schemaDesc,
    step: tz.howTo.steps.map((s) => ({
      "@type": "HowToStep",
      name: s.name,
      text: s.text,
    })),
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tz.faq.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: tz.hero.breadcrumbHome,
        item: `${SITE_URL}${localizedPath("/", locale)}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: tz.hero.breadcrumb,
        item: pageUrl,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // Static, app-authored schema (no user input).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify([
          softwareApplicationSchema,
          howToSchema,
          faqSchema,
          breadcrumbSchema,
        ]),
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SpoofTimezonePage() {
  const platform = usePlatform()
  const store = getStoreLink(platform, "spoof-timezone")

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection store={store} />
        <WhatLeaksSection />
        <HowToSection />
        <WhyItMattersSection />
        <FaqSection />
        <DownloadSection
          campaign="spoof-timezone"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
      <StructuredData />
    </div>
  )
}

function HeroSection({ store }: { store: ReturnType<typeof getStoreLink> }) {
  const { locale, t } = useTranslations()
  const d = t.spoofTimezone.hero

  return (
    <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
      <Breadcrumb className="mx-auto mb-8 max-w-3xl">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={localizedPath("/", locale) as "/"}>
                {d.breadcrumbHome}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{d.breadcrumb}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          {d.badge}
        </Badge>
        <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          {d.headingPre}
          <span className="text-(--color-brand)">{d.headingEmphasis}</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
          {d.introPre}
          <code>Intl.DateTimeFormat</code>
          {d.introMid}
          <code>Date</code>
          {d.introPost}
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href={store ? store.href : "#download"}
            {...(store ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center sm:min-h-14 sm:w-auto",
              "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
              "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {store ? t.storeCta[store.key] : d.ctaFallback}
          </a>
          <LocaleLink
            to="/verify"
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 sm:min-h-14 sm:w-auto",
              "rounded-brand border border-(--color-canvas-border) px-8 text-base font-semibold text-(--color-canvas-foreground) sm:text-lg",
              "transition-all hover:bg-(--color-canvas-border)",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {d.testTimezone}
          </LocaleLink>
        </div>
      </div>
    </Section>
  )
}

function WhatLeaksSection() {
  const { t } = useTranslations()
  const d = t.spoofTimezone.whatLeaks
  const surfaces = [
    {
      icon: <Clock className="size-5" />,
      api: "Intl.DateTimeFormat().resolvedOptions().timeZone",
      reveals: d.reveals1,
    },
    {
      icon: <Clock className="size-5" />,
      api: "new Date().getTimezoneOffset()",
      reveals: d.reveals2,
    },
    {
      icon: <Globe className="size-5" />,
      api: d.surface3Api,
      reveals: d.reveals3,
    },
  ]

  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {d.heading}
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">{d.intro}</p>
      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {surfaces.map((s, i) => (
          <div
            key={s.api}
            className={cn(
              "flex items-start gap-4 px-5 py-4",
              i < surfaces.length - 1 &&
                "border-b border-(--color-canvas-border)"
            )}
          >
            <span className="mt-0.5 text-(--color-brand)">{s.icon}</span>
            <div>
              <code className="text-sm font-semibold break-all text-(--color-canvas-foreground)">
                {s.api}
              </code>
              <p className="mt-1 text-sm text-(--color-canvas-muted)">
                {s.reveals}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function HowToSection() {
  const { t } = useTranslations()
  const d = t.spoofTimezone.howTo

  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-8 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {d.heading}
      </h2>
      <ol className="space-y-5">
        {d.steps.map((step, i) => (
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
  )
}

function WhyItMattersSection() {
  const { t } = useTranslations()
  const d = t.spoofTimezone.whyItMatters

  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <ShieldCheck className="mb-3 size-6 text-(--color-brand)" />
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          {d.heading}
        </h2>
        <p className="text-(--color-canvas-muted)">{d.body}</p>
        <p className="mt-4 text-sm text-(--color-canvas-muted)">
          {d.blogLinkLead}
          <Link
            to="/blog/$slug"
            params={{ slug: "why-your-timezone-reveals-your-location" }}
            className="font-medium text-(--color-brand) hover:underline"
          >
            {d.blogLinkText}
          </Link>
          .
        </p>
      </div>
    </Section>
  )
}

function FaqSection() {
  const { t } = useTranslations()
  const d = t.spoofTimezone.faq

  return (
    <Section narrow className="py-12! md:py-16!" aria-labelledby="faq-heading">
      <h2
        id="faq-heading"
        className="mb-6 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
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
    </Section>
  )
}
