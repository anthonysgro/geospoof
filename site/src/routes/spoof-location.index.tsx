import { Link, createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BROWSERS, type BrowserSlug } from "@/components/seo/BrowserSpoofPage"
import { SITE_URL } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/spoof-location`
const DESCRIPTION =
  "Spoof your browser location in Chrome, Edge, Firefox, or Safari. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose."

export const Route = createFileRoute("/spoof-location/")({
  component: SpoofLocationHub,
  head: () => ({
    meta: [
      { title: "Spoof Your Browser Location — Free Extension | GeoSpoof" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your browser location" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your browser location" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})

const ORDER: Array<BrowserSlug> = ["chrome", "edge", "firefox", "safari"]

const HREF: Record<BrowserSlug, string> = {
  chrome: "/spoof-location/chrome",
  edge: "/spoof-location/edge",
  firefox: "/spoof-location/firefox",
  safari: "/spoof-location/safari",
}

function SpoofLocationHub() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section className="pt-12! pb-8! md:pt-20! md:pb-12!">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
            >
              Location Spoofing
            </Badge>
            <h1 className="mb-5 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl">
              Spoof your browser{" "}
              <span className="text-(--color-brand)">location</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base text-(--color-canvas-muted) md:text-lg">
              Websites read your location through the browser's Geolocation API
              and your timezone — a VPN changes neither. GeoSpoof overrides both
              so sites see the location you pick. Pick your browser to get
              started.
            </p>
          </div>

          {/* Browser cards */}
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {ORDER.map((slug) => {
              const info = BROWSERS[slug]
              return (
                <Link
                  key={slug}
                  to={HREF[slug] as "/"}
                  className={cn(
                    "flex flex-col gap-1 rounded-2xl border border-(--color-canvas-border) p-6",
                    "transition-all hover:border-(--color-brand) hover:shadow-lg",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  )}
                >
                  <span className="text-lg font-bold text-(--color-canvas-foreground)">
                    Spoof your location in {info.name}
                  </span>
                  <span className="text-sm text-(--color-canvas-muted)">
                    {info.storeName.replace(/^the /, "")} ·{" "}
                    {info.operatingSystem}
                  </span>
                  <span className="mt-2 text-sm font-semibold text-(--color-brand)">
                    Open guide →
                  </span>
                </Link>
              )
            })}
          </div>
        </Section>

        <DownloadSection
          campaign="spoof-location"
          className="border-t border-(--color-canvas-border)"
        />
      </main>
      <Footer />
    </div>
  )
}
