import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { ScreenshotsSection } from "@/components/landing/ScreenshotsSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { CompatibilitySection } from "@/components/landing/CompatibilitySection"
import { FeaturedPostSection } from "@/components/landing/FeaturedPostSection"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Footer } from "@/components/landing/Footer"
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

function App() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection />
        <ScreenshotsSection />
        <FeaturesSection />
        <TestimonialsSection />
        <CompatibilitySection />
        <FeaturedPostSection />
        <DownloadSection />
      </main>
      <Footer />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
    </div>
  )
}
