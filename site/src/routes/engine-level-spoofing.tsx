import { Link, createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { ChevronDown, EyeOff, Info, ShieldCheck, Terminal } from "lucide-react"
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

const PAGE_URL = `${SITE_URL}/engine-level-spoofing`
const PAGE_TITLE = "Hide Chrome's “Started Debugging This Browser” Bar | GeoSpoof"
const PAGE_DESCRIPTION =
  "GeoSpoof's Engine-level Spoofing uses Chrome's debugger API, so Chrome shows a “GeoSpoof started debugging this browser” bar. Here's what it means, why it's safe, and how to hide it with one launch flag on Windows, macOS, and Linux."

/** The launch flag that suppresses Chrome's extension-debugger notification bar. */
const FLAG = "--silent-debugger-extension-api"

export const Route = createFileRoute("/engine-level-spoofing")({
  component: EngineLevelSpoofingPage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: PAGE_URL },
      {
        property: "og:title",
        content: "Hide Chrome's “started debugging this browser” bar",
      },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      {
        name: "twitter:title",
        content: "Hide Chrome's “started debugging this browser” bar",
      },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})

// ---------------------------------------------------------------------------
// Content data (shared between the rendered page and the structured data, so
// Google rich results and AI answer engines see the same steps and answers).
// ---------------------------------------------------------------------------

const HOW_TO_STEPS: Array<{ name: string; text: string }> = [
  {
    name: "Quit Chrome completely",
    text: "Close every Chrome window so the browser fully exits — the flag only applies to a fresh launch.",
  },
  {
    name: "Relaunch Chrome with the flag",
    text: `Start Chrome with the ${FLAG} command-line flag using the steps for your operating system.`,
  },
  {
    name: "Make it permanent (optional)",
    text: "Add the flag to the shortcut or launcher you normally use, so the bar stays hidden on every launch.",
  },
  {
    name: "Reopen GeoSpoof",
    text: "Engine-level Spoofing keeps working exactly as before — only the notification bar is gone.",
  },
]

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Why does GeoSpoof say it's “debugging” my browser?",
    a: "Engine-level Spoofing uses Chrome's debugger API (the Chrome DevTools Protocol) — the same mechanism your browser's own DevTools use — to set your timezone deeper in the browser than a normal extension can. Whenever any extension attaches with that API, Chrome shows a “started debugging this browser” bar. It's a standard Chrome notice, not a sign that something is wrong.",
  },
  {
    q: "Is it safe? Is GeoSpoof reading my data?",
    a: "GeoSpoof uses the debugger connection only to apply a timezone override. It does not read your page content, keystrokes, or browsing. GeoSpoof is open source, so you can review exactly what it sends on GitHub. If you'd rather not use it, leave Engine-level Spoofing off and GeoSpoof's standard protection still spoofs your location and timezone.",
  },
  {
    q: "How do I hide the “started debugging this browser” bar?",
    a: `Launch Chrome with the ${FLAG} flag. On Windows, add it to your Chrome shortcut's Target field; on macOS, relaunch Chrome from Terminal with that flag (or save it as a launcher); on Linux, add it to your Chrome launch command or the .desktop file. The bar disappears while spoofing keeps working.`,
  },
  {
    q: "Will the bar come back when I restart Chrome?",
    a: "Yes, unless you bake the flag into the shortcut or launcher you always use. The flag only affects launches that include it, so opening Chrome a different way brings the bar back. Add it to your everyday launcher to make it stick.",
  },
  {
    q: "Why can't GeoSpoof hide the bar for me automatically?",
    a: "The bar is controlled by Chrome itself, and only a browser launch flag can turn it off. Extensions can't set Chrome's command-line flags, so this step has to be done once by you. It's a deliberate Chrome safeguard around the debugger API.",
  },
  {
    q: "What is Engine-level Spoofing?",
    a: "It's a Chrome-only GeoSpoof option that spoofs your timezone at the browser engine level instead of from a page script. Because it applies before a page's first script runs and reaches background workers, it closes timezone leaks that page-level spoofing can miss. Geolocation continues to use GeoSpoof's standard, prompt-free method.",
  },
]

const OS_GUIDES: Array<{
  os: string
  steps: Array<React.ReactNode>
  code: string
  note?: string
}> = [
  {
    os: "Windows",
    steps: [
      "Close all Chrome windows.",
      "Right-click the Chrome shortcut you use (taskbar, desktop, or Start menu) and choose Properties.",
      <>
        In the <strong>Target</strong> field, leave the quoted path to{" "}
        <code>chrome.exe</code> as-is and add the flag after the closing quote
        (note the leading space).
      </>,
      "Click OK, then open Chrome from that shortcut.",
    ],
    code: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ${FLAG}`,
    note: "Repeat for each shortcut you launch Chrome from (taskbar and Start menu are separate shortcuts).",
  },
  {
    os: "macOS",
    steps: [
      "Quit Chrome completely (⌘Q).",
      "Open Terminal and run the command below.",
      <>
        Chrome reopens without the bar. To launch this way every time, save the
        command as an Automator <strong>Application</strong> or a shell alias.
      </>,
    ],
    code: `open -b com.google.Chrome --args ${FLAG}`,
  },
  {
    os: "Linux",
    steps: [
      "Close Chrome.",
      "Launch it with the flag, or add the flag to the Exec= line of your Chrome .desktop launcher to make it permanent.",
    ],
    code: `google-chrome ${FLAG}`,
    note: "Use chromium in place of google-chrome if you run Chromium.",
  },
]

function StructuredData() {
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to hide Chrome's “started debugging this browser” bar",
    description:
      "Hide the notification bar Chrome shows while GeoSpoof's Engine-level Spoofing is on, by launching Chrome with the --silent-debugger-extension-api flag.",
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
        name: "Engine-level Spoofing",
        item: PAGE_URL,
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

function EngineLevelSpoofingPage() {
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
            <BreadcrumbPage>Engine-level Spoofing</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mx-auto max-w-3xl text-center">
        <Badge
          variant="outline"
          className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
        >
          Chrome · Engine-level Spoofing
        </Badge>
        <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
          Hide Chrome's{" "}
          <span className="text-(--color-brand)">
            “started debugging this browser”
          </span>{" "}
          bar
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
          Chrome shows a “started debugging this browser” bar while Engine-level
          Spoofing is on. It's harmless — here's how to hide it.
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
            How to hide the bar
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
            {store ? store.cta : "Get GeoSpoof free"}
          </a>
        </div>
      </div>
      <figure className="mx-auto mt-12 max-w-5xl md:mt-16">
        <img
          src="/images/help/debugger-api-tutorial.png"
          alt="Chrome showing a “GeoSpoof started debugging this browser” notification bar at the top of the window while Engine-level Spoofing is on"
          width={3396}
          height={1530}
          className="w-full"
        />
        <figcaption className="mt-3 text-center text-sm text-(--color-canvas-muted)">
          The “started debugging this browser” bar Chrome shows while
          Engine-level Spoofing is on.
        </figcaption>
      </figure>
    </Section>
  )
}

function WhatTheBarIsSection() {
  const points: Array<{ icon: React.ReactNode; title: string; body: string }> = [
    {
      icon: <Info className="size-5" />,
      title: "It's a standard Chrome notice",
      body: "Chrome shows the bar for any extension that uses the debugger API — the same API DevTools use. It appears the moment GeoSpoof attaches, not because anything went wrong.",
    },
    {
      icon: <ShieldCheck className="size-5" />,
      title: "GeoSpoof only sets a timezone override",
      body: "The debugger connection is used solely to apply your spoofed timezone across frames and workers. It doesn't read your page content, keystrokes, or browsing — and the code is open source.",
    },
    {
      icon: <EyeOff className="size-5" />,
      title: "The bar is cosmetic",
      body: "It changes nothing about how sites see you. Hiding it is purely about removing the strip at the top of the window.",
    },
  ]

  return (
    <Section narrow className="py-12! md:py-16!">
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        What the bar means
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">
        Engine-level Spoofing applies your timezone at the browser level, before
        a page's first script runs, so it also covers background workers. To
        reach that deep, GeoSpoof uses Chrome's debugger API — and Chrome
        announces that with a notification bar.
      </p>
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
              <p className="mt-1 text-sm text-(--color-canvas-muted)">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function HowToSection() {
  return (
    <Section narrow className="py-12! md:py-16!" aria-labelledby="how-to">
      <h2
        id="how-to"
        className="scroll-mt-24 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
      >
        How to hide the bar
      </h2>
      <p className="mt-3 mb-8 text-(--color-canvas-muted)">
        Launch Chrome with the{" "}
        <code className="text-(--color-canvas-foreground)">{FLAG}</code> flag.
        Quit Chrome first, then follow the steps for your system.
      </p>

      <div className="space-y-5">
        {OS_GUIDES.map((guide) => (
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
  return (
    <Section narrow className="py-12! md:py-16!">
      <div className="rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <ShieldCheck className="mb-3 size-6 text-(--color-brand)" />
        <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
          Make it stick
        </h2>
        <p className="text-(--color-canvas-muted)">
          The flag only applies to launches that include it, so the bar returns
          if you open Chrome a different way. To keep it hidden for good, add{" "}
          <code className="text-(--color-canvas-foreground)">{FLAG}</code> to the
          shortcut or launcher you open Chrome from every day — the Windows
          shortcut Target, a macOS launcher app, or your Linux{" "}
          <code className="text-(--color-canvas-foreground)">.desktop</code> file.
        </p>
        <p className="mt-4 text-sm text-(--color-canvas-muted)">
          Prefer not to bother? Leave Engine-level Spoofing off — GeoSpoof's
          standard protection still spoofs your{" "}
          <Link
            to="/spoof-location"
            className="font-medium text-(--color-brand) hover:underline"
          >
            location
          </Link>{" "}
          and{" "}
          <Link
            to="/spoof-timezone"
            className="font-medium text-(--color-brand) hover:underline"
          >
            timezone
          </Link>{" "}
          without any debugger bar.
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
