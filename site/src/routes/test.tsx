import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { TestSuite } from "@/components/test/TestSuite"

export const Route = createFileRoute("/test")({
  component: TestPage,
  head: () => ({
    meta: [
      { title: "Test Your Protection | GeoSpoof" },
      {
        name: "description",
        content:
          "Verify that GeoSpoof is correctly spoofing your browser geolocation and timezone. All tests run locally in your browser — nothing leaves your device.",
      },
      // No-index while the suite is in internal review
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
})

function TestPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <div className="mb-10 space-y-3 text-center">
            <h1 className="text-4xl font-bold text-(--color-canvas-foreground)">
              Test your protection
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              Verify that GeoSpoof is behaving the way you expect. Every test
              runs locally in your browser — nothing leaves your device.
            </p>
          </div>

          <TestSuite />
        </Section>
      </main>
      <Footer />
    </div>
  )
}
