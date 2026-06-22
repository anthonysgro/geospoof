import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { ComparisonSection } from "@/components/landing/ComparisonSection"
import { ScreenshotsSection } from "@/components/landing/ScreenshotsSection"
import { DemoVideoSection } from "@/components/landing/DemoVideoSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { CompatibilitySection } from "@/components/landing/CompatibilitySection"
import { FeaturedPostSection } from "@/components/landing/FeaturedPostSection"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Footer } from "@/components/landing/Footer"
import { ExposureToast } from "@/components/landing/ExposureToast"
import { SkipLink } from "@/components/landing/SkipLink"
import { SITE_URL } from "@/lib/blog"

export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
})

// SoftwareApplication schema — tells Google + AI answer engines what GeoSpoof
// is (a free, cross-browser location/timezone spoofing extension), which feeds
// app info boxes and "best browser location spoofer" style AI answers.
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GeoSpoof",
  description:
    "Spoof your browser's geolocation, timezone, and WebRTC in one extension. Open source, privacy-first, no account required. Works on Chrome, Firefox, Edge, Brave, and Safari.",
  url: SITE_URL,
  image: `${SITE_URL}/icon.png`,
  applicationCategory: "BrowserApplication",
  operatingSystem: "Windows, macOS, Linux, iOS, iPadOS, Android",
  browserRequirements: "Requires Firefox, Chrome, Brave, Edge, or Safari",
  softwareVersion: "latest",
  isAccessibleForFree: true,
  featureList: [
    "Spoof browser geolocation via the Geolocation API",
    "Spoof timezone across Date, Intl, and Temporal",
    "Automatic VPN sync — match your spoofed location to your VPN exit region",
    "Auto background sync that follows you as you switch VPN servers",
    "WebRTC IP leak protection",
    "Per-site allow and deny filters",
    "Search 33,000+ cities offline or enter coordinates manually",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: { "@type": "Person", name: "Anthony Sgro" },
  publisher: {
    "@type": "Organization",
    name: "GeoSpoof",
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
  },
  sameAs: ["https://github.com/anthonysgro/geospoof"],
}

// Organization schema — feeds entity recognition and the logo shown beside
// results / in knowledge panels. (Previously only present nested as a
// publisher; this surfaces it as a top-level entity.)
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GeoSpoof",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  sameAs: ["https://github.com/anthonysgro/geospoof"],
}

// VideoObject schema — describes the homepage demo clip. Beyond video features,
// the explicit thumbnailUrl tells Google which image represents the video, so
// it stops pulling an arbitrary frame as the search thumbnail.
const demoVideoSchema = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "GeoSpoof demo — spoof your browser location in a few clicks",
  description:
    "A short demo of GeoSpoof overriding the browser's geolocation and timezone so websites see the location you choose.",
  thumbnailUrl: [`${SITE_URL}/images/social-og-home.png`],
  uploadDate: "2026-06-11",
  contentUrl:
    "https://dsgaoei8r9jiwulf.public.blob.vercel-storage.com/geospoof-demo-v2.mp4",
}

function App() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection />
        <ScreenshotsSection />
        <DemoVideoSection />
        <FeaturesSection />
        <ComparisonSection />
        <TestimonialsSection />
        <CompatibilitySection />
        <FeaturedPostSection />
        <DownloadSection />
      </main>
      <Footer />

      <ExposureToast />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            softwareApplicationSchema,
            organizationSchema,
            demoVideoSchema,
          ]),
        }}
      />
    </div>
  )
}
