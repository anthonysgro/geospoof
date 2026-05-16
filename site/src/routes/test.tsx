import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { VerificationDashboard } from "@/components/verification/VerificationDashboard"
// Import the early-timezone-probe at the top of the route module so
// its IIFE runs at module-evaluation time — the earliest point any
// dashboard-related JavaScript can read the timezone. The race-probe
// test later compares the captured value against the settled snapshot
// to determine whether the extension won or lost the initialization
// race against page-side code.
import "@/lib/verification/early-timezone-probe"

export const Route = createFileRoute("/test")({
  component: TestPage,
  head: () => ({
    meta: [
      { title: "Verify your protection | GeoSpoof" },
      {
        name: "description",
        content:
          "See what your browser is reporting as your identity and check whether any site could detect that GeoSpoof is active. Everything is computed locally — nothing leaves your device.",
      },
      // No-index while the suite is in internal review (Req 22.7)
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
        {/*
          Default Section width (max 1200px) so the dashboard has room to
          breathe. The heading block is narrowed back in to keep the
          hero copy from sprawling, but the dashboard itself uses the
          full container (Req 21.3 — outer page layout preserved).
        */}
        <Section className="py-12! md:py-16!">
          <header className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
            <h1 className="text-4xl font-bold text-(--color-canvas-foreground)">
              Verify your protection, privately
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              See what your browser reports and whether any site could detect
              GeoSpoof.
            </p>
          </header>

          <VerificationDashboard />
        </Section>
      </main>
      <Footer />
    </div>
  )
}
