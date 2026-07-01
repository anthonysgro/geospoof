import { Link, createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { ChevronDown, EyeOff, Info, ShieldCheck, Terminal } from "lucide-react"
import type { Dictionary, Locale } from "@/lib/i18n"
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
import { format, getDictionary, localizedPath } from "@/lib/i18n"

/** The launch flag that suppresses Chrome's extension-debugger notification bar. */
const FLAG = "--silent-debugger-extension-api"

/** Build the `head` payload for the Engine-level Spoofing page in a locale. */
export function buildEngineLevelHead(locale: Locale) {
  const m = getDictionary(locale).engineLevel.meta
  const canonical = `${SITE_URL}${localizedPath("/engine-level-spoofing", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: canonical },
      { property: "og:title", content: m.ogTitle },
      { property: "og:description", content: m.description },
      { name: "twitter:url", content: canonical },
      { name: "twitter:title", content: m.ogTitle },
      { name: "twitter:description", content: m.description },
    ],
    links: [
      { rel: "canonical", href: canonical },
      {
        rel: "alternate",
        hrefLang: "en",
        href: `${SITE_URL}/engine-level-spoofing`,
      },
      {
        rel: "alternate",
        hrefLang: "fr",
        href: `${SITE_URL}/fr/engine-level-spoofing`,
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: `${SITE_URL}/engine-level-spoofing`,
      },
    ],
  }
}

export const Route = createFileRoute("/engine-level-spoofing")({
  component: EngineLevelSpoofingPage,
  head: () => buildEngineLevelHead("en"),
})

/** Per-OS launch instructions. `os` names and `code` commands stay literal. */
function getOsGuides(t: Dictionary): Array<{
  os: string
  steps: Array<React.ReactNode>
  code: string
  note?: string
}> {
  const g = t.engineLevel.guides
  return [
    {
      os: "Windows",
      steps: [
        g.win.step1,
        g.win.step2,
        <>
          {g.win.step3a}
          <strong>{g.win.step3strong}</strong>
          {g.win.step3mid}
          <code>{g.win.step3code}</code>
          {g.win.step3end}
        </>,
        g.win.step4,
      ],
      code: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ${FLAG}`,
      note: g.win.note,
    },
    {
      os: "macOS",
      steps: [
        g.mac.step1,
        g.mac.step2,
        <>
          {g.mac.step3a}
          <strong>{g.mac.step3strong}</strong>
          {g.mac.step3end}
        </>,
      ],
      code: `open -b com.google.Chrome --args ${FLAG}`,
    },
    {
      os: "Linux",
      steps: [g.linux.step1, g.linux.step2],
      code: `google-chrome ${FLAG}`,
      note: g.linux.note,
    },
  ]
}

function StructuredData() {
  const { locale, t } = useTranslations()
  const s = t.engineLevel.schema
  const pageUrl = `${SITE_URL}${localizedPath("/engine-level-spoofing", locale)}`

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: s.howToName,
    description: format(s.howToDesc, { flag: FLAG }),
    step: [
      { name: s.howToStep1Name, text: s.howToStep1Text },
      {
        name: s.howToStep2Name,
        text: format(s.howToStep2Text, { flag: FLAG }),
      },
      { name: s.howToStep3Name, text: s.howToStep3Text },
      { name: s.howToStep4Name, text: s.howToStep4Text },
    ].map((step) => ({ "@type": "HowToStep", ...step })),
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.engineLevel.faq.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: format(f.a, { flag: FLAG }),
      },
    })),
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: t.engineLevel.hero.breadcrumbHome,
        item: `${SITE_URL}${localizedPath("/", locale)}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t.engineLevel.hero.breadcrumb,
        item: pageUrl,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // Static, app-authored schema (no user input).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify([howToSchema, faqSchema, breadcrumbSchema]),
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EngineLevelSpoofingPage() {
  const platform = usePlatform()
  const store = getStoreLink(platform, "engine-level-spoofing")

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection store={store} />
        <HowToSection />
        <PermanentSection />
        <WhatTheBarIsSection />
        <FaqSection />
        <DownloadSection
          campaign="engine-level-spoofing"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
      <StructuredData />
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-(--color-canvas-border) bg-canvas-foreground/4 p-3">
      <code className="font-mono text-sm break-all text-(--color-canvas-foreground) select-all">
        {children}
      </code>
    </pre>
  )
}

function HeroSection({ store }: { store: ReturnType<typeof getStoreLink> }) {
  const { locale, t } = useTranslations()
  const d = t.engineLevel.hero

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
          {d.headingPost}
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
          {d.intro}
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="#how-to"
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center sm:min-h-14 sm:w-auto",
              "rounded-brand bg-(--color-brand) px-8 text-base font-semibold text-white sm:text-lg",
              "shadow-md transition-all hover:bg-(--color-brand-dark) hover:shadow-lg",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {d.ctaHowTo}
          </a>
          <a
            href={store ? store.href : "#download"}
            {...(store ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 sm:min-h-14 sm:w-auto",
              "rounded-brand border border-(--color-canvas-border) px-8 text-base font-semibold text-(--color-canvas-foreground) sm:text-lg",
              "transition-all hover:bg-(--color-canvas-border)",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            {store ? t.storeCta[store.key] : d.ctaFallback}
          </a>
        </div>
      </div>
      <figure className="mx-auto mt-12 max-w-5xl md:mt-16">
        <img
          src="/images/help/debugger-api-tutorial.png"
          alt={d.figureAlt}
          width={3396}
          height={1530}
          className="w-full"
        />
        <figcaption className="mt-3 text-center text-sm text-(--color-canvas-muted)">
          {d.figCaption}
        </figcaption>
      </figure>
    </Section>
  )
}

function WhatTheBarIsSection() {
  const { t } = useTranslations()
  const d = t.engineLevel.whatBar
  const points = [
    {
      icon: <Info className="size-5" />,
      title: d.point1Title,
      body: d.point1Body,
    },
    {
      icon: <ShieldCheck className="size-5" />,
      title: d.point2Title,
      body: d.point2Body,
    },
    {
      icon: <EyeOff className="size-5" />,
      title: d.point3Title,
      body: d.point3Body,
    },
  ]

  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {d.heading}
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">{d.intro}</p>
      <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        {points.map((p, i) => (
          <div
            key={p.title}
            className={cn(
              "flex items-start gap-4 px-5 py-4",
              i < points.length - 1 && "border-b border-(--color-canvas-border)"
            )}
          >
            <span className="mt-0.5 text-(--color-brand)">{p.icon}</span>
            <div>
              <h3 className="font-semibold text-(--color-canvas-foreground)">
                {p.title}
              </h3>
              <p className="mt-1 text-sm text-(--color-canvas-muted)">
                {p.body}
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
  const d = t.engineLevel.howTo
  const guides = getOsGuides(t)

  return (
    <Section narrow className="py-12! md:py-16!" aria-labelledby="how-to">
      <h2
        id="how-to"
        className="scroll-mt-24 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        {d.heading}
      </h2>
      <p className="mt-3 mb-8 text-(--color-canvas-muted)">
        {d.introPre}
        <code className="text-(--color-canvas-foreground)">{FLAG}</code>
        {d.introPost}
      </p>

      <div className="space-y-5">
        {guides.map((guide) => (
          <div
            key={guide.os}
            className="rounded-2xl border border-(--color-canvas-border) p-5 md:p-6"
          >
            <div className="mb-3 flex items-center gap-2">
              <Terminal className="size-5 text-(--color-brand)" />
              <h3 className="text-lg font-semibold text-(--color-canvas-foreground)">
                {guide.os}
              </h3>
            </div>
            <ol className="ml-4 list-decimal space-y-2 text-sm text-(--color-canvas-muted)">
              {guide.steps.map((step, i) => (
                <li key={i} className="pl-1">
                  {step}
                </li>
              ))}
            </ol>
            <CodeBlock>{guide.code}</CodeBlock>
            {guide.note ? (
              <p className="mt-2 text-xs text-(--color-canvas-muted)">
                {guide.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  )
}

function PermanentSection() {
  const { locale, t } = useTranslations()
  const d = t.engineLevel.permanent

  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <ShieldCheck className="mb-3 size-6 text-(--color-brand)" />
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          {d.heading}
        </h2>
        <p className="text-(--color-canvas-muted)">
          {d.bodyPre}
          <code className="text-(--color-canvas-foreground)">{FLAG}</code>
          {d.bodyMid}
          <code className="text-(--color-canvas-foreground)">
            {d.bodyDesktopCode}
          </code>
          {d.bodyEnd}
        </p>
        <p className="mt-4 text-sm text-(--color-canvas-muted)">
          {d.body2Pre}
          <Link
            to={localizedPath("/spoof-location", locale) as "/"}
            className="font-medium text-(--color-brand) hover:underline"
          >
            {d.locationLink}
          </Link>
          {d.body2Mid}
          <Link
            to={localizedPath("/spoof-timezone", locale) as "/"}
            className="font-medium text-(--color-brand) hover:underline"
          >
            {d.timezoneLink}
          </Link>
          {d.body2End}
        </p>
      </div>
    </Section>
  )
}

function FaqSection() {
  const { t } = useTranslations()
  const d = t.engineLevel.faq

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
              {format(faq.a, { flag: FLAG })}
            </p>
          </details>
        ))}
      </div>
    </Section>
  )
}
