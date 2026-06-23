import { Link } from "@tanstack/react-router"
import { ChevronDown, Globe, ShieldAlert, ShieldCheck } from "lucide-react"
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
import { usePlatform, type Platform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import { SITE_URL } from "@/lib/blog"

export type BrowserSlug = "chrome" | "edge" | "firefox" | "safari"

interface BrowserInfo {
  /** Display name, e.g. "Chrome". */
  name: string
  /** Store this browser installs from (drives the smart CTA). */
  storePlatform: Exclude<Platform, "unknown">
  /** Human label for the store, used in copy and steps. */
  storeName: string
  /** Operating systems this browser/extension runs on (for schema + copy). */
  operatingSystem: string
  /** Whether GeoSpoof's WebRTC protection is available on this browser. */
  webrtc: boolean
  /** One-paragraph, browser-specific intro under the H1. */
  intro: string
  /** Browser-specific "enable the extension" step. */
  enableStep: string
  /** Browser-specific FAQ entry appended to the shared questions. */
  extraFaq: { q: string; a: string }
}

export const BROWSERS: Record<BrowserSlug, BrowserInfo> = {
  chrome: {
    name: "Chrome",
    storePlatform: "chromium",
    storeName: "the Chrome Web Store",
    operatingSystem: "Windows, macOS, Linux",
    webrtc: true,
    intro:
      "Chrome reports your whereabouts to websites through the Geolocation API and your timezone through Intl and Date — and a VPN changes none of that. GeoSpoof overrides those signals inside Chrome so sites see the location you pick. The same build also runs in Brave, Opera, and other Chromium browsers.",
    enableStep:
      "Pin GeoSpoof from the puzzle-piece (Extensions) icon in Chrome's toolbar so it's one click away.",
    extraFaq: {
      q: "Does GeoSpoof work in Brave and other Chromium browsers?",
      a: "Yes. GeoSpoof installs from the Chrome Web Store, which serves Chrome, Brave, Opera, and other Chromium-based browsers. The location and timezone spoofing works identically across all of them.",
    },
  },
  edge: {
    name: "Edge",
    storePlatform: "chromium",
    storeName: "the Chrome Web Store",
    operatingSystem: "Windows, macOS",
    webrtc: true,
    intro:
      "Microsoft Edge is built on Chromium, so it exposes your location the same way Chrome does — the Geolocation API plus your system timezone. GeoSpoof installs from the Chrome Web Store, runs in Edge, and overrides those APIs to report the location you choose. It works for spoofing your location in Edge on both Windows and macOS.",
    enableStep:
      "Allow the extension from the Chrome Web Store when Edge prompts you, then pin GeoSpoof from the Extensions (puzzle-piece) icon.",
    extraFaq: {
      q: "Can I spoof my location in Edge on Windows?",
      a: "Yes. GeoSpoof runs in Edge on Windows and macOS. It overrides the location and timezone your browser reports to websites; it does not change Windows' own system location settings, so your OS stays untouched.",
    },
  },
  firefox: {
    name: "Firefox",
    storePlatform: "firefox",
    storeName: "Firefox Add-ons",
    operatingSystem: "Windows, macOS, Linux, Android",
    webrtc: true,
    intro:
      "Firefox hands websites your location through the Geolocation API and your region through the timezone APIs, regardless of any VPN. GeoSpoof installs from Firefox Add-ons and overrides those signals. It's the one build that also runs on Firefox for Android, so you can spoof your location on mobile too.",
    enableStep:
      "After adding GeoSpoof from Firefox Add-ons, pin it to the toolbar from the extensions menu for quick access.",
    extraFaq: {
      q: "Can I spoof my location in Firefox on Android?",
      a: "Yes. Firefox 140+ on Android supports GeoSpoof, so you can spoof geolocation and timezone on your phone — something Chrome on mobile can't do, since it doesn't support extensions.",
    },
  },
  safari: {
    name: "Safari",
    storePlatform: "apple",
    storeName: "the App Store",
    operatingSystem: "iOS, iPadOS, macOS",
    webrtc: false,
    intro:
      "Safari on iOS, iPadOS, and macOS reports your location and timezone to websites just like any browser. GeoSpoof installs from the App Store and runs as a Safari extension, overriding those APIs so sites see the location you choose. Geolocation and timezone spoofing are fully supported; WebRTC protection isn't available on Safari.",
    enableStep:
      "After installing from the App Store, enable GeoSpoof from Safari's extensions menu (the puzzle-piece in the address bar on iOS, or Safari → Settings → Extensions on macOS).",
    extraFaq: {
      q: "Does location spoofing work in Safari on iPhone?",
      a: "Yes. GeoSpoof is a Safari extension available through the App Store for iOS, iPadOS, and macOS. Once enabled for a site, it overrides the geolocation and timezone Safari reports. WebRTC protection is the one feature not available on Safari.",
    },
  },
}

const SHARED_FAQ = (name: string): Array<{ q: string; a: string }> => [
  {
    q: `How do I spoof my location in ${name}?`,
    a: `Install the free GeoSpoof extension, set a location (search a city, enter coordinates, or sync to your VPN), and GeoSpoof overrides the Geolocation and timezone APIs in ${name} so websites see your chosen location instead of your real one.`,
  },
  {
    q: `Does a VPN change my location in ${name}?`,
    a: `No. A VPN only changes your IP address. ${name} still reports its own browser geolocation and system timezone, so those can still reveal your real region. GeoSpoof spoofs the browser signals; use it alongside a VPN for a consistent location.`,
  },
  {
    q: `Is GeoSpoof free for ${name}?`,
    a: `Yes. GeoSpoof is free and open source. There's no account, no login, and no tracking — every setting stays on your device.`,
  },
]

function steps(info: BrowserInfo) {
  return [
    {
      name: `Install GeoSpoof for ${info.name}`,
      text: `Add the free GeoSpoof extension from ${info.storeName}.`,
    },
    { name: `Enable it in ${info.name}`, text: info.enableStep },
    {
      name: "Set your location",
      text: "Search for a city, enter coordinates, or use VPN Sync to match your VPN's exit region.",
    },
    {
      name: `${info.name} reports your chosen location`,
      text: `GeoSpoof overrides the Geolocation API and timezone (Date, Intl, Temporal) so every site sees the location you picked${
        info.webrtc ? ", and WebRTC protection blocks your real IP from leaking" : ""
      }.`,
    },
  ]
}

export function BrowserSpoofPage({ slug }: { slug: BrowserSlug }) {
  const info = BROWSERS[slug]
  const platform = usePlatform()
  const store = getStoreLink(platform, `spoof-location-${slug}`)
  const howToSteps = steps(info)
  const faqs = [...SHARED_FAQ(info.name), info.extraFaq]

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
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={"/spoof-location" as "/"}>Spoof Location</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{info.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
            >
              {info.name} Extension
            </Badge>
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              Spoof your location in{" "}
              <span className="text-(--color-brand)">{info.name}</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              {info.intro}
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
                {store ? store.cta : `Get GeoSpoof for ${info.name}`}
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
                Test your location
              </Link>
            </div>
          </div>
        </Section>

        {/* How to */}
        <Section narrow className="py-12! md:py-16!">
          <h2 className="mb-8 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
            How to spoof your location in {info.name}
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
                    WebRTC protection is available in {info.name}.
                  </span>{" "}
                  GeoSpoof also blocks your real IP from leaking through WebRTC,
                  which can otherwise bypass a VPN entirely.
                </>
              ) : (
                <>
                  <span className="font-semibold text-(--color-canvas-foreground)">
                    Note: WebRTC protection isn't available in {info.name}.
                  </span>{" "}
                  Geolocation and timezone spoofing are fully supported; the
                  WebRTC privacy API GeoSpoof relies on isn't exposed on this
                  browser.
                </>
              )}
            </p>
          </div>
        </Section>

        {/* FAQ */}
        <Section narrow className="py-12! md:py-16!" aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="mb-6 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl"
          >
            Frequently asked questions
          </h2>
          <div className="overflow-hidden rounded-2xl border border-(--color-canvas-border)">
            {faqs.map((faq, i) => (
              <details
                key={faq.q}
                className={cn(
                  "group bg-(--color-canvas) px-5 py-4",
                  i < faqs.length - 1 && "border-b border-(--color-canvas-border)"
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
            Using a different browser? See{" "}
            <Link
              to={"/spoof-location" as "/"}
              className="font-medium text-(--color-brand) hover:underline"
            >
              spoof your location in any browser
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
              description: `Spoof your geolocation and timezone in ${info.name} with a free, open-source extension.`,
              url: `${SITE_URL}/spoof-location/${slug}`,
              image: `${SITE_URL}/icon.png`,
              applicationCategory: "BrowserApplication",
              operatingSystem: info.operatingSystem,
              browserRequirements: `Requires ${info.name}`,
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "Anthony Sgro" },
            },
            {
              "@context": "https://schema.org",
              "@type": "HowTo",
              name: `How to spoof your location in ${info.name}`,
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
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Spoof Location",
                  item: `${SITE_URL}/spoof-location`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: info.name,
                  item: `${SITE_URL}/spoof-location/${slug}`,
                },
              ],
            },
          ]),
        }}
      />
    </div>
  )
}
