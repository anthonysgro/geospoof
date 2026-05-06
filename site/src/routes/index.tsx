import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { ScreenshotsSection } from "@/components/landing/ScreenshotsSection"
import { CompatibilitySection } from "@/components/landing/CompatibilitySection"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"

export const Route = createFileRoute("/")({
  component: App,
})

function App() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection />
        <ScreenshotsSection />
        <FeaturesSection />
        <CompatibilitySection />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  )
}
