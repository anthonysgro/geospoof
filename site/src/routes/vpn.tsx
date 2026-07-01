import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  Apple,
  ChevronDown,
  Globe2,
  Info,
  Lock,
  Monitor,
  Network,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Star,
  TabletSmartphone,
  Terminal,
} from "lucide-react"
import type { Locale } from "@/lib/i18n"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { ProtonLogo } from "@/components/ProtonLogo"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { PROTON_DISCOUNT, protonVpnLink } from "@/lib/affiliate"
import { useTranslations } from "@/hooks/use-i18n"
import {
  buildOgLocaleMeta,
  format,
  getDictionary,
  localizedPath,
} from "@/lib/i18n"

// Single CTA destination for this page. Defined once; the actual outbound URL
// lives behind the /go/proton redirect (see vercel.json), built via
// @/lib/affiliate so it can change server-side without touching this component.
const PROTON_LINK = protonVpnLink("vpn-page")

/**
 * Build the `head` payload for the VPN page in a given locale: localized
 * title/description/OG + self-canonical + hreflang cluster. `head()` can't use
 * hooks, so the route passes its locale explicitly.
 */
export function buildVpnHead(locale: Locale) {
  const m = getDictionary(locale).vpn.meta
  const canonical = `${SITE_URL}${localizedPath("/vpn", locale)}`
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
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/vpn` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/fr/vpn` },
      { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/vpn` },
    ],
  }
}

export const Route = createFileRoute("/vpn")({
  component: VpnPage,
  head: () => buildVpnHead("en"),
})

// ---------------------------------------------------------------------------
// Structured data — FAQPage feeds Google rich results and AI answer engines.
// ---------------------------------------------------------------------------

function StructuredData() {
  const { t } = useTranslations()
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.vpn.faq.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <script
      type="application/ld+json"
      // Static, app-authored schema (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
    />
  )
}

// Shared props for the affiliate CTA — opens in a new tab and is correctly
// marked as a paid/affiliate link for search engines and honesty.
const CTA_LINK_PROPS = {
  href: PROTON_LINK,
  target: "_blank",
  rel: "sponsored nofollow noopener noreferrer",
} as const

// ---------------------------------------------------------------------------
// Page — ordered education-first: explain the two layers, then make the
// (clearly disclosed) recommendation. The product pitch never leads.
// ---------------------------------------------------------------------------

export function VpnPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection />
        <TwoLayersSection />
        <WhyProtonSection />
        <PlanGuidanceSection />
        <FaqSection />
        <DisclosureSection />
        <DownloadSection
          campaign="vpn"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
      <StructuredData />
    </div>
  )
}

function CtaButton({ children }: { children: React.ReactNode }) {
  return (
    <a
      {...CTA_LINK_PROPS}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2.5 sm:min-h-14 sm:w-auto",
        "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
        "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
      )}
    >
      {/* Proton VPN logomark on a white chip so the gradient mark stays legible
          on the brand-colored button and is shown unmodified per Proton's brand
          guidelines (its own clear space). Decorative — the label says Proton. */}
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white">
        <img
          src="/proton/proton-vpn-logomark.svg"
          alt=""
          aria-hidden="true"
          width={918}
          height={833}
          className="size-4 w-auto"
        />
      </span>
      {children}
    </a>
  )
}

// Compact, plain-language affiliate disclosure. Rendered *above* the first
// outbound CTA so the relationship is clear before anyone clicks (FTC "clear
// and conspicuous"), not buried at the foot of the page.
function InlineDisclosure({ className }: { className?: string }) {
  const { t } = useTranslations()
  return (
    <p
      className={cn(
        "mx-auto max-w-xl text-xs leading-relaxed text-(--color-canvas-muted)",
        className
      )}
    >
      {t.vpn.inlineDisclosure}
    </p>
  )
}

// Proton VPN ships native apps for all of these. Shown as a quiet, borderless
// icon+label compatibility line under the hero CTA — keep in sync with Proton's
// actual platform support.
const PROTON_PLATFORMS = [
  { label: "Windows", icon: Monitor },
  { label: "macOS", icon: Apple },
  { label: "Linux", icon: Terminal },
  { label: "iOS", icon: Smartphone },
  { label: "Android", icon: TabletSmartphone },
] as const

function HeroSection() {
  const { t } = useTranslations()
  const d = t.vpn.hero

  // Smooth-scroll the hero CTA to the recommendation instead of a hard jump,
  // honoring reduced-motion. Keeps the href so it still works without JS.
  const scrollToProton = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById("why-proton")
    if (!el) return
    e.preventDefault()
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  return (
    <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
      <div className="mx-auto mb-8 max-w-4xl overflow-hidden rounded-2xl">
        <img
          src="/proton/vpn-map.png"
          alt={d.mapAlt}
          className="h-auto w-full"
          loading="eager"
        />
      </div>
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          {d.badge}
        </Badge>
        <h1 className="mb-4 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          {d.headingPre}
          <span className="text-(--color-brand)">GeoSpoof</span>
          {d.headingPost}
        </h1>
        {/* One scannable answer line under the question. NN/g: most visitors
            scan and read ~20% of words, so the hero must land the whole point
            for those who never scroll. */}
        <p className="mx-auto mb-7 max-w-2xl text-lg font-semibold text-(--color-canvas-foreground) md:text-xl">
          {d.answer}
        </p>
        {/* Affiliate disclosure card, placed ABOVE the CTA so it is seen before
            the click (FTC "clear and conspicuous"). */}
        <div className="mx-auto mb-6 flex max-w-xl items-start gap-2.5 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) px-4 py-3 text-left">
          <Info
            className="mt-0.5 size-4 shrink-0 text-(--color-canvas-muted)"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-(--color-canvas-muted)">
            <span className="font-semibold text-(--color-canvas-foreground)">
              {d.disclosureLabel}
            </span>{" "}
            {d.disclosureBody}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <span className="relative inline-flex w-full sm:w-auto">
            <a
              {...CTA_LINK_PROPS}
              className={cn(
                "inline-flex min-h-12 w-full items-center justify-center gap-2.5 sm:min-h-14 sm:w-auto",
                "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
                "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
              )}
            >
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white">
                <img
                  src="/proton/proton-vpn-logomark.svg"
                  alt=""
                  aria-hidden="true"
                  width={918}
                  height={833}
                  className="size-4 w-auto"
                />
              </span>
              {d.ctaPlans}
            </a>
            <span className="pointer-events-none absolute -top-3 -right-3 z-10 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow-md ring-2 ring-(--color-canvas)">
              <Star className="size-3 fill-current" aria-hidden="true" />
              {format(d.discountSticker, { discount: PROTON_DISCOUNT })}
            </span>
          </span>
          {/* Secondary CTA — stays on-page, smooth-scrolls to the "Why Proton"
              explainer for people who want the reasoning before clicking out. */}
          <a
            href="#why-proton"
            onClick={scrollToProton}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 sm:min-h-14 sm:w-auto",
              "rounded-brand border border-(--color-canvas-border) px-8 text-base font-semibold text-(--color-canvas-foreground) sm:text-lg",
              "transition-all hover:bg-(--color-canvas-border)",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {d.learnMore}
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-(--color-canvas-muted)">
            <ShieldCheck
              className="size-4 shrink-0 text-(--color-brand)"
              aria-hidden="true"
            />
            {d.moneyBack}
          </span>
          <ul
            className="flex flex-wrap items-center justify-center text-xs text-(--color-canvas-muted)"
            aria-label={d.platformsAria}
          >
            {PROTON_PLATFORMS.map(({ label, icon: Icon }, i) => (
              <li key={label} className="inline-flex items-center">
                {i > 0 && (
                  <span className="px-3 opacity-40" aria-hidden="true">
                    |
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Icon
                    className="size-3.5 shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function TwoLayersSection() {
  const { t } = useTranslations()
  const d = t.vpn.twoLayers
  const layers = [
    {
      icon: <Globe2 className="size-5" />,
      title: d.browserTitle,
      body: d.browserBody,
      who: d.browserWho,
    },
    {
      icon: <Network className="size-5" />,
      title: d.networkTitle,
      body: d.networkBody,
      who: d.networkWho,
    },
  ]

  return (
    <Section narrow id="two-layers" className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {d.heading}
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">{d.intro}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {layers.map((l) => (
          <div
            key={l.title}
            className="flex h-full flex-col rounded-2xl border border-(--color-canvas-border) p-5"
          >
            <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-brand/10 text-(--color-brand)">
              {l.icon}
            </span>
            <h3 className="font-semibold text-(--color-canvas-foreground)">
              {l.title}
            </h3>
            <p className="mt-1 text-sm text-(--color-canvas-muted)">{l.body}</p>
            <p className="mt-auto pt-3 text-xs font-semibold tracking-wide text-(--color-brand) uppercase">
              {l.who}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-(--color-canvas-muted)">
        {d.primerLead}
        <a
          href="https://www.jonaharagon.com/posts/understanding-vpns/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-(--color-brand) hover:underline"
        >
          {d.primerLink}
        </a>
        .
      </p>
    </Section>
  )
}

function WhyProtonSection() {
  const { t } = useTranslations()
  const d = t.vpn.whyProton
  const reasons = [
    {
      icon: <ShieldCheck className="size-5" />,
      title: d.reason1Title,
      body: d.reason1Body,
    },
    {
      icon: <Lock className="size-5" />,
      title: d.reason2Title,
      body: d.reason2Body,
    },
    {
      icon: <ServerCog className="size-5" />,
      title: d.reason3Title,
      body: d.reason3Body,
    },
  ]

  return (
    <Section narrow id="why-proton" className="py-12! md:py-16!">
      <div className="mb-8">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          {d.eyebrow}
        </p>
        <ProtonLogo className="mb-5 h-8 md:h-9" />
        <h2 className="mb-4 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
          {d.heading}
        </h2>
        <p className="text-(--color-canvas-muted)">{d.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {reasons.map((r) => (
          <div
            key={r.title}
            className="rounded-2xl border border-(--color-canvas-border) p-5"
          >
            <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-brand/10 text-(--color-brand)">
              {r.icon}
            </span>
            <h3 className="font-semibold text-(--color-canvas-foreground)">
              {r.title}
            </h3>
            <p className="mt-1 text-sm text-(--color-canvas-muted)">{r.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-5 md:p-6">
        <p className="text-sm leading-relaxed text-(--color-canvas-muted)">
          <strong className="text-(--color-canvas-foreground)">
            {d.calloutLead}
          </strong>
          {d.calloutBodyPre}
          <a
            href="https://www.privacyguides.org/en/vpn/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-(--color-brand) hover:underline"
          >
            {d.calloutLink}
          </a>
          {d.calloutBodyPost}
        </p>
      </div>
    </Section>
  )
}

function PlanGuidanceSection() {
  const { t } = useTranslations()
  const d = t.vpn.plan
  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="mb-8 overflow-hidden">
        <img
          src="/proton/vpn-home.png"
          alt={d.imgAlt}
          className="mx-auto h-auto w-full max-w-2xl"
          loading="lazy"
        />
      </div>
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          {d.heading}
        </h2>
        <p className="text-(--color-canvas-muted)">
          {format(d.body, { discount: PROTON_DISCOUNT })}
        </p>
        <InlineDisclosure className="mx-0 mt-5 max-w-2xl text-left" />
        <div className="mt-4 flex flex-col items-center gap-3">
          <CtaButton>{d.cta}</CtaButton>
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 text-center text-sm text-(--color-canvas-muted)">
            {format(d.discountLine, { discount: PROTON_DISCOUNT })}
            <span className="opacity-40" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck
                className="size-4 shrink-0 text-(--color-brand)"
                aria-hidden="true"
              />
              {t.vpn.hero.moneyBack}
            </span>
          </span>
        </div>
      </div>
    </Section>
  )
}

function FaqSection() {
  const { t } = useTranslations()
  const d = t.vpn.faq
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

function DisclosureSection() {
  const { t } = useTranslations()
  const d = t.vpn.disclosure
  return (
    <Section narrow className="pt-0! pb-12! md:pb-16!">
      <p className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) px-5 py-4 text-sm text-(--color-canvas-muted)">
        <strong className="text-(--color-canvas-foreground)">{d.label}</strong>{" "}
        {d.body}
      </p>
    </Section>
  )
}
