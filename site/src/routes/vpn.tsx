import { Link, createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  ChevronDown,
  Globe2,
  Lock,
  Network,
  ServerCog,
  ShieldCheck,
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
import { protonVpnLink } from "@/lib/affiliate"

const PAGE_URL = `${SITE_URL}/vpn`
const PAGE_TITLE =
  "Do You Need a VPN With GeoSpoof? The Two Layers of Location Privacy | GeoSpoof"
const PAGE_DESCRIPTION =
  "GeoSpoof hides the location, timezone, and WebRTC your browser reports. A no-log VPN hides your IP — the one signal an extension can't change. Here's how the two layers fit together, and the VPN we trust for the second (and why)."

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
    a: "Yes. GeoSpoof works with any VPN — nothing is locked to Proton. Mullvad and IVPN are other well-regarded no-log providers in the privacy community. We recommend Proton because we use it, it's independently audited, and it pairs cleanly with VPN Sync, but the choice is entirely yours.",
  },
  {
    q: "Why does GeoSpoof recommend Proton VPN?",
    a: "Proton is no-logs, based in Switzerland, fully open-source, and has passed repeated independent audits — the same verifiable, privacy-first values GeoSpoof is built on. Its VPN Sync pairing also lets GeoSpoof match your spoofed location to your VPN's exit region automatically.",
  },
  {
    q: "Is GeoSpoof free if I don't buy a VPN?",
    a: "Yes. GeoSpoof's core spoofing is free and open-source, with no VPN required. A VPN only hides your real IP address — it's a complementary tool, not a requirement to use GeoSpoof. Proton's free tier also covers the IP-hiding job for casual use.",
  },
  {
    q: "Does GeoSpoof make money if I sign up?",
    a: "If you subscribe to Proton through our link, Proton shares a portion of the sale with us, at no extra cost to you. It helps keep GeoSpoof free, open-source, and ad-free. We recommend Proton because we genuinely use and trust it — the commission doesn't change which plan is actually best for you.",
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
        "inline-flex min-h-12 w-full items-center justify-center sm:min-h-14 sm:w-auto",
        "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
        "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
      )}
    >
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
      Heads up: the Proton links here are affiliate links. If you subscribe
      through them, Proton shares a small cut with us at no extra cost to you —
      it helps keep GeoSpoof free and open-source. We only recommend Proton
      because we actually use it.
    </p>
  )
}

function HeroSection() {
  return (
    <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          Location privacy has two layers
        </Badge>
        <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          Do you need a VPN with{" "}
          <span className="text-(--color-brand)">GeoSpoof</span>?
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
          Short answer: for full location privacy, yes — and not because
          GeoSpoof falls short. GeoSpoof hides the location, timezone, and
          WebRTC details your browser reports. Your <strong>IP address</strong>{" "}
          is a separate signal that no extension can change — only a VPN can.
          Here's how the two layers fit together, and the VPN we trust for the
          second one.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="#two-layers"
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 sm:min-h-14 sm:w-auto",
              "rounded-brand border border-(--color-canvas-border) px-8 text-base font-semibold text-(--color-canvas-foreground) sm:text-lg",
              "transition-all hover:bg-(--color-canvas-border)",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            How the layers work
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
            Test your protection
          </Link>
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
        the mismatch gives you away — a browser reporting Tokyo while your IP
        still resolves to New York is easy to flag.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {layers.map((l) => (
          <div
            key={l.title}
            className="rounded-2xl border border-(--color-canvas-border) p-5"
          >
            <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-brand/10 text-(--color-brand)">
              {l.icon}
            </span>
            <h3 className="font-semibold text-(--color-canvas-foreground)">
              {l.title}
            </h3>
            <p className="mt-1 text-sm text-(--color-canvas-muted)">{l.body}</p>
            <p className="mt-3 text-xs font-semibold tracking-wide text-(--color-brand) uppercase">
              {l.who}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function WhyProtonSection() {
  const reasons: Array<{ icon: React.ReactNode; title: string; body: string }> =
    [
      {
        icon: <ShieldCheck className="size-5" />,
        title: "No-logs, independently audited",
        body: "Proton's no-logs policy has been independently audited repeatedly — not just claimed — and tested in real-world legal requests.",
      },
      {
        icon: <Lock className="size-5" />,
        title: "Swiss, open-source",
        body: "Based in Switzerland under strong privacy law, with fully open-source apps anyone can inspect — the same verifiable approach as GeoSpoof.",
      },
      {
        icon: <ServerCog className="size-5" />,
        title: "Pairs with VPN Sync",
        body: "GeoSpoof's VPN Sync matches your spoofed location to your VPN's exit region, and re-aligns automatically as Proton switches servers.",
      },
    ]

  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="mb-8">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          The VPN we trust
        </p>
        <ProtonLogo className="mb-5 h-8 md:h-9" />
        <h2 className="text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
          Why Proton VPN
        </h2>
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
      <p className="mt-6 text-sm leading-relaxed text-(--color-canvas-muted)">
        <strong className="text-(--color-canvas-foreground)">
          Proton isn't the only good option.
        </strong>{" "}
        Mullvad and IVPN are also well-regarded no-log providers, and GeoSpoof
        works with any VPN — you're never locked in. We point to Proton because
        we use it and it pairs with VPN Sync, but the right call is whichever
        one you trust.
      </p>
    </Section>
  )
}

function PlanGuidanceSection() {
  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          Which plan should you pick?
        </h2>
        <p className="text-(--color-canvas-muted)">
          You don't have to commit to anything. Proton's{" "}
          <strong>free tier</strong> already covers the IP-hiding job for casual
          use, and if you want to try the paid features, the{" "}
          <strong>monthly VPN Plus</strong> plan lets you do that with no
          long-term tie-in. If you already know you'll keep it, the{" "}
          <strong>1-year or 2-year VPN Plus</strong> plans are the best value —
          the same servers, at a much lower price per month. Pick whatever
          matches how long you actually expect to use it.
        </p>
        <InlineDisclosure className="mt-6 mx-0 max-w-2xl text-left" />
        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <CtaButton>Get Proton VPN</CtaButton>
          <span className="text-sm text-(--color-canvas-muted)">
            30-day money-back guarantee on paid plans
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
        recommendation, Proton shares a portion of the sale with us — at no
        extra cost to you. It helps keep GeoSpoof free, open-source, and
        ad-free. We recommend Proton because we genuinely use and trust it, not
        because of the commission, and GeoSpoof works with any VPN you prefer.
      </p>
    </Section>
  )
}
