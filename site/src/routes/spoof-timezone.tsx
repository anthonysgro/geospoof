import { Link, createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { ChevronDown, Clock, Globe, ShieldCheck } from "lucide-react"
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

const PAGE_URL = `${SITE_URL}/spoof-timezone`
const PAGE_TITLE = "Spoof Your Browser Timezone — Free Extension | GeoSpoof"
const PAGE_DESCRIPTION =
  "Change or spoof your browser's timezone to match any location. GeoSpoof overrides Date, Intl, and Temporal so your clock can't reveal your real region."

export const Route = createFileRoute("/spoof-timezone")({
  component: SpoofTimezonePage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      // Page-specific Open Graph / Twitter (overrides the root defaults so a
      // share of this URL shows timezone-relevant copy and the right URL).
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your browser's timezone" },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your browser's timezone" },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})

// ---------------------------------------------------------------------------
// Structured data — SoftwareApplication (what GeoSpoof is), HowTo (the steps),
// and FAQPage (the Q&A). Feeds Google rich results and AI answer engines.
// ---------------------------------------------------------------------------

const HOW_TO_STEPS: Array<{ name: string; text: string }> = [
  {
    name: "Install GeoSpoof",
    text: "Add the free GeoSpoof extension for your browser — Firefox, Chrome, Brave, Edge, or Safari.",
  },
  {
    name: "Set your location",
    text: "Search for a city, enter coordinates, or use VPN Sync to match your VPN's exit region.",
  },
  {
    name: "Timezone aligns automatically",
    text: "GeoSpoof overrides Date, Intl.DateTimeFormat, and Temporal so every clock-based API reports the timezone of your chosen location.",
  },
  {
    name: "Verify it worked",
    text: "Open the GeoSpoof verification page to confirm your reported timezone matches your spoofed location.",
  },
]

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How do I change my browser's timezone?",
    a: "Browsers take their timezone from your operating system, and most don't let you override it per-site. GeoSpoof changes the timezone your browser reports to websites without touching your system clock: install the extension, set a location, and it overrides the JavaScript timezone APIs to match.",
  },
  {
    q: "Can I spoof my timezone without changing my system clock?",
    a: "Yes. GeoSpoof works at the browser API level, so it changes what websites read (Intl.DateTimeFormat, Date, Temporal) while your computer's actual clock and system settings stay exactly as they are.",
  },
  {
    q: "Does a VPN change my browser's timezone?",
    a: "No. A VPN only changes your IP address. Your browser still reports its own timezone from your operating system, so a VPN in another country with your home timezone is an easy mismatch to detect. GeoSpoof aligns the timezone to your spoofed location to close that gap.",
  },
  {
    q: "Why does my timezone need to match my location?",
    a: "If you spoof your GPS location or use a VPN but leave your timezone on your real region, the two disagree — and that mismatch is a common, easily detected tell. Aligning your timezone to your chosen location keeps every signal telling the same story.",
  },
  {
    q: "Does GeoSpoof spoof the timezone automatically?",
    a: "Yes. When you set a location or sync to your VPN, GeoSpoof resolves the correct timezone for those coordinates and applies it automatically — including as your VPN switches exit servers.",
  },
]

function StructuredData() {
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GeoSpoof",
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
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
    name: "How to spoof your browser's timezone",
    description:
      "Change the timezone your browser reports to websites, without changing your system clock, using the free GeoSpoof extension.",
    step: HOW_TO_STEPS.map((s) => ({
      "@type": "HowToStep",
      name: s.name,
      text: s.text,
    })),
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Spoof Timezone",
        item: PAGE_URL,
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

function SpoofTimezonePage() {
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
  return (
    <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
      <Breadcrumb className="mx-auto mb-8 max-w-3xl">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Spoof Timezone</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          Timezone Spoofing
        </Badge>
        <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          Spoof your browser's{" "}
          <span className="text-(--color-brand)">timezone</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
          Websites read your timezone the instant a page loads — no permission
          prompt — through <code>Intl.DateTimeFormat</code> and{" "}
          <code>Date</code>. GeoSpoof overrides them so your clock matches the
          location you choose, not where you really are.
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
            {store ? store.cta : "Get GeoSpoof free"}
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
            Test your timezone
          </Link>
        </div>
      </div>
    </Section>
  )
}

function WhatLeaksSection() {
  const surfaces: Array<{
    icon: React.ReactNode
    api: string
    reveals: string
  }> = [
    {
      icon: <Clock className="size-5" />,
      api: "Intl.DateTimeFormat().resolvedOptions().timeZone",
      reveals: "Returns an IANA name like America/New_York.",
    },
    {
      icon: <Clock className="size-5" />,
      api: "new Date().getTimezoneOffset()",
      reveals: "Returns your UTC offset in minutes.",
    },
    {
      icon: <Globe className="size-5" />,
      api: "Temporal & document timestamps",
      reveals: "Newer time APIs and page timestamps expose the same zone.",
    },
  ]

  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        What your browser gives away
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">
        Unlike the Geolocation API, the timezone surfaces never ask permission —
        they answer the moment a page loads. A single mismatched clock can undo
        a spoofed GPS location.
      </p>
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
  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-8 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        How to spoof your timezone
      </h2>
      <ol className="space-y-5">
        {HOW_TO_STEPS.map((step, i) => (
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
  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <ShieldCheck className="mb-3 size-6 text-(--color-brand)" />
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          A spoofed location needs a matching clock
        </h2>
        <p className="text-(--color-canvas-muted)">
          A VPN moves your IP and GeoSpoof moves your GPS coordinates — but if
          your timezone still reads your real region, the mismatch gives you
          away. GeoSpoof keeps your timezone aligned to your chosen location
          automatically, and re-aligns it as your VPN switches exit servers, so
          your geolocation, timezone, and IP all tell the same story.
        </p>
        <p className="mt-4 text-sm text-(--color-canvas-muted)">
          Want the technical deep dive?{" "}
          <Link
            to="/blog/$slug"
            params={{ slug: "why-your-timezone-reveals-your-location" }}
            className="font-medium text-(--color-brand) hover:underline"
          >
            Read why your timezone reveals your location
          </Link>
          .
        </p>
      </div>
    </Section>
  )
}

function FaqSection() {
  return (
    <Section narrow className="py-12! md:py-16!" aria-labelledby="faq-heading">
      <h2
        id="faq-heading"
        className="mb-6 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        Frequently asked questions
      </h2>
      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {FAQS.map((faq, i) => (
          <details
            key={faq.q}
            className={cn(
              "group bg-(--color-canvas) px-5 py-4",
              i < FAQS.length - 1 && "border-b border-(--color-canvas-border)"
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
