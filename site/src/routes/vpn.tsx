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

const PAGE_URL = `${SITE_URL}/vpn`
const PAGE_TITLE =
  "Do You Need a VPN With GeoSpoof? Two Layers of Privacy | GeoSpoof"
const PAGE_DESCRIPTION =
  "GeoSpoof hides the location, timezone, and WebRTC your browser reports. A no-log VPN hides your IP — the one signal an extension can't change."

// Single CTA destination for this page. Defined once; the actual outbound URL
// lives behind the /go/proton redirect (see vercel.json), built via
// @/lib/affiliate so it can change server-side without touching this component.
const PROTON_LINK = protonVpnLink("vpn-page")

export const Route = createFileRoute("/vpn")({
  component: VpnPage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      {
        property: "og:title",
        content: "Do you need a VPN with GeoSpoof?",
      },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      {
        name: "twitter:title",
        content: "Do you need a VPN with GeoSpoof?",
      },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})

// ---------------------------------------------------------------------------
// Structured data — FAQPage feeds Google rich results and AI answer engines.
// ---------------------------------------------------------------------------

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Do I need a VPN if I use GeoSpoof?",
    a: "For full location privacy, yes — but not because GeoSpoof falls short. GeoSpoof changes the location, timezone, and WebRTC details your browser reports to websites. The strongest remaining signal is your IP address, and only a VPN can change that. The two cover different layers; together they tell one consistent story.",
  },
  {
    q: "Can I use a different VPN with GeoSpoof?",
    a: "Yes. GeoSpoof works with any VPN. Nothing is locked to Proton, and VPN Sync works the same with all of them. Mullvad and IVPN are other well-regarded no-log providers in the privacy community. We point to Proton because it's fully open-source, independently audited, and recommended by Privacy Guides, but the choice is entirely yours.",
  },
  {
    q: "Why does GeoSpoof recommend Proton VPN?",
    a: "Proton is no-logs, based in Switzerland, fully open-source, and has passed repeated independent audits. Those are the same verifiable, privacy-first values GeoSpoof is built on. It's also one of the few VPNs recommended by Privacy Guides, an independent resource that takes no affiliate money. VPN Sync works with Proton exactly as it does with any other VPN.",
  },
  {
    q: "Do I need a VPN to use GeoSpoof?",
    a: "No. GeoSpoof's core spoofing works without a VPN. A VPN only hides your real IP address — it's a complementary tool, not a requirement to use GeoSpoof.",
  },
  {
    q: "Does GeoSpoof make money if I sign up?",
    a: "If you subscribe to Proton through our link, Proton shares a portion of the sale with us, at no extra cost to you. It helps keep GeoSpoof open-source and ad-free. We recommend Proton on its merits (open-source, independently audited, and recommended by Privacy Guides), and the commission doesn't change which plan is actually best for you.",
  },
]

function StructuredData() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
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

function VpnPage() {
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
  return (
    <p
      className={cn(
        "mx-auto max-w-xl text-xs leading-relaxed text-(--color-canvas-muted)",
        className
      )}
    >
      Heads up — this is an affiliate link. Subscribe through it and Proton
      shares a small cut with us, at no extra cost to you. It&rsquo;s how we
      help keep GeoSpoof open-source and independent.
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
          alt="Proton VPN hides your IP address"
          className="h-auto w-full"
          loading="eager"
        />
      </div>
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          Location privacy has two layers
        </Badge>
        <h1 className="mb-4 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          Do you need a VPN with{" "}
          <span className="text-(--color-brand)">GeoSpoof</span>?
        </h1>
        {/* One scannable answer line under the question. NN/g: most visitors
            scan and read ~20% of words, so the hero must land the whole point
            for those who never scroll. */}
        <p className="mx-auto mb-7 max-w-2xl text-lg font-semibold text-(--color-canvas-foreground) md:text-xl">
          GeoSpoof hides your browser&rsquo;s location. A VPN hides your IP. For
          full privacy, you want both.
        </p>
        {/* Affiliate disclosure card, placed ABOVE the CTA so it is seen before
            the click (FTC "clear and conspicuous" — a disclosure only below the
            button is inadequate because the link can be clicked first). The
            "Up to 70% off" badge needs no qualifier here: it mirrors Proton's
            own advertised 2-year discount off their standard rate. */}
        <div className="mx-auto mb-6 flex max-w-xl items-start gap-2.5 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) px-4 py-3 text-left">
          <Info
            className="mt-0.5 size-4 shrink-0 text-(--color-canvas-muted)"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-(--color-canvas-muted)">
            <span className="font-semibold text-(--color-canvas-foreground)">
              Privacy Disclosure:
            </span>{" "}
            We partner with Proton VPN. If you subscribe through our link, we
            earn a commission at no extra cost to you.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <span className="relative inline-flex w-full sm:w-auto">
            {/* Primary CTA links straight to Proton (affiliate) to cut the
                clicks-to-conversion. Honest by design: the label matches the
                destination, and the affiliate disclosure card sits directly
                above it (FTC "clear and conspicuous" before the click). */}
            <a
              {...CTA_LINK_PROPS}
              className={cn(
                "inline-flex min-h-12 w-full items-center justify-center gap-2.5 sm:min-h-14 sm:w-auto",
                "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
                "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
              )}
            >
              {/* Proton logomark on a white chip — shown unmodified per Proton's
                  brand guidelines. Decorative; the label carries the meaning. */}
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
              See Proton VPN plans
            </a>
            {/* "Deal" sticker — eye-catching hook for Proton's own advertised
                headline discount (2-year plan, ~70% off their standard rate).
                "Up to" because the CTA lands on the plan chooser where shorter
                plans discount less (1-yr ~65%, 1-mo ~50%). */}
            <span className="pointer-events-none absolute -top-3 -right-3 z-10 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow-md ring-2 ring-(--color-canvas)">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Up to {PROTON_DISCOUNT} off
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
            Learn more
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
        {/* Risk-reversal + platform availability directly under the CTA —
            answers "is it on my device?" and "is it risk-free?" at the point of
            decision. The Privacy Guides trust signal isn't lost: it still
            appears in the "Why Proton" section and the FAQ below. */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-(--color-canvas-muted)">
            <ShieldCheck
              className="size-4 shrink-0 text-(--color-brand)"
              aria-hidden="true"
            />
            30-day money-back guarantee
          </span>
          <ul
            className="flex flex-wrap items-center justify-center text-xs text-(--color-canvas-muted)"
            aria-label="Proton VPN is available on Windows, macOS, Linux, iOS, and Android"
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
  const layers: Array<{
    icon: React.ReactNode
    title: string
    body: string
    who: string
  }> = [
    {
      icon: <Globe2 className="size-5" />,
      title: "The browser layer",
      body: "Websites read your location from the Geolocation API, your region from the timezone APIs, and your local IPs from WebRTC. GeoSpoof overrides all of these so they report the location you choose.",
      who: "Handled by GeoSpoof",
    },
    {
      icon: <Network className="size-5" />,
      title: "The network layer",
      body: "Every site also sees the public IP address your connection comes from, which maps to a real city. No browser extension can change this — it lives below the browser, on the network.",
      who: "Handled by a VPN",
    },
  ]

  return (
    <Section narrow id="two-layers" className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        Two layers, two tools
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">
        Location privacy has two independent layers. GeoSpoof seals the browser
        layer; a VPN seals the network layer. Spoof one but leave the other and
        the mismatch gives you away. A browser reporting Tokyo while your IP
        still resolves to New York is easy to flag.
      </p>
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
        Want a deeper, vendor-neutral take? Jonah Aragon of Privacy Guides has a
        clear primer on{" "}
        <a
          href="https://www.jonaharagon.com/posts/understanding-vpns/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-(--color-brand) hover:underline"
        >
          what a VPN actually does and doesn&rsquo;t do
        </a>
        .
      </p>
    </Section>
  )
}

function WhyProtonSection() {
  const reasons: Array<{ icon: React.ReactNode; title: string; body: string }> =
    [
      {
        icon: <ShieldCheck className="size-5" />,
        title: "No-logs, independently audited",
        body: "Proton's no-logs policy has been independently audited repeatedly, not just claimed, and tested in real-world legal requests.",
      },
      {
        icon: <Lock className="size-5" />,
        title: "Swiss, open-source",
        body: "Based in Switzerland under strong privacy law, with fully open-source apps anyone can inspect — the same verifiable approach as GeoSpoof.",
      },
      {
        icon: <ServerCog className="size-5" />,
        title: "Works with VPN Sync",
        body: "GeoSpoof's VPN Sync keeps your spoofed location matched to your VPN's exit region automatically — with Proton, or any other VPN you choose.",
      },
    ]

  return (
    <Section narrow id="why-proton" className="py-12! md:py-16!">
      <div className="mb-8">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          The VPN we trust
        </p>
        <ProtonLogo className="mb-5 h-8 md:h-9" />
        <h2 className="mb-4 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
          Why Proton VPN
        </h2>
        <p className="text-(--color-canvas-muted)">
          GeoSpoof is open-source and keeps zero logs. In privacy, the only
          trust worth having is the kind you can verify. Proton holds itself to
          the same bar: open-source apps, an independently audited no-logs
          policy, and Swiss jurisdiction.
        </p>
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
            Don&rsquo;t take our word for it.
          </strong>{" "}
          Proton is one of the few VPNs recommended by{" "}
          <a
            href="https://www.privacyguides.org/en/vpn/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-(--color-brand) hover:underline"
          >
            Privacy Guides
          </a>
          , an independent, community-run privacy resource. GeoSpoof works with any VPN, so you&rsquo;re never locked
          in; we point to Proton for the open-source, audited reasons above,
          but the right call is whichever one you trust.
        </p>
      </div>
    </Section>
  )
}

function PlanGuidanceSection() {
  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="mb-8 overflow-hidden">
        <img
          src="/proton/vpn-home.png"
          alt="Proton VPN app home screen"
          className="mx-auto h-auto w-full max-w-2xl"
          loading="lazy"
        />
      </div>
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          Pick the plan that fits
        </h2>
        <p className="text-(--color-canvas-muted)">
          GeoSpoof is open-source. For the IP layer, we&rsquo;d point
          you to Proton&rsquo;s VPN Plus. The 2-year plan is{" "}
          {PROTON_DISCOUNT} off Proton&rsquo;s standard rate — the lowest price
          per month and the best overall value. Prefer to try it first? The
          monthly plan works too.
        </p>
        <InlineDisclosure className="mt-5 mx-0 max-w-2xl text-left" />
        <div className="mt-4 flex flex-col items-center gap-3">
          <CtaButton>See Proton VPN plans</CtaButton>
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 text-center text-sm text-(--color-canvas-muted)">
            {PROTON_DISCOUNT} off the 2-year plan
            <span className="opacity-40" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck
                className="size-4 shrink-0 text-(--color-brand)"
                aria-hidden="true"
              />
              30-day money-back guarantee
            </span>
          </span>
        </div>
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

function DisclosureSection() {
  return (
    <Section narrow className="pt-0! pb-12! md:pb-16!">
      <p className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) px-5 py-4 text-sm text-(--color-canvas-muted)">
        <strong className="text-(--color-canvas-foreground)">
          Affiliate disclosure:
        </strong>{" "}
        GeoSpoof is an independent, open-source utility and is not affiliated
        with or endorsed by Proton. When you buy a plan through our
        recommendation, Proton shares a portion of the sale with us, at no
        extra cost to you. It helps keep GeoSpoof free, open-source, and
        ad-free. We recommend Proton on its merits (open-source, independently
        audited, and recommended by Privacy Guides), not because of the
        commission, and GeoSpoof works with any VPN you prefer.
      </p>
    </Section>
  )
}
