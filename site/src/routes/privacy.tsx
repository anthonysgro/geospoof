import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheckIcon } from "lucide-react"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy | GeoSpoof" },
      {
        name: "description",
        content:
          "Privacy Policy for GeoSpoof — learn how we protect your data and respect your privacy.",
      },
    ],
  }),
})

function PolicySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-(--color-canvas-foreground)">
        {title}
      </h2>
      <div
        className={cn(
          "text-body-base space-y-4 text-(--color-canvas-muted)",
          "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6",
          "[&_li]:text-(--color-canvas-muted)",
          "[&_strong]:font-semibold [&_strong]:text-(--color-canvas-foreground)",
          "[&_a]:text-(--color-brand) [&_a]:hover:underline"
        )}
      >
        {children}
      </div>
    </div>
  )
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-(--color-brand)/10">
              <ShieldCheckIcon className="h-8 w-8 text-(--color-brand)" />
            </div>
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              Privacy Policy
            </h1>
            <p className="text-body-base text-(--color-canvas-muted)">
              Last Updated: May 3, 2026
            </p>
          </div>

          <div className="space-y-8">
            <PolicySection title="Overview">
              <p>
                GeoSpoof is committed to protecting your privacy. This extension
                is designed to enhance your location privacy and does not
                collect, store, or transmit any personal data to the extension
                developer.
              </p>
            </PolicySection>

            <PolicySection title="Data Collection">
              <p>
                <strong>GeoSpoof does not collect any personal data.</strong>{" "}
                The extension:
              </p>
              <ul>
                <li>Does NOT track your browsing activity</li>
                <li>Does NOT collect analytics or telemetry</li>
                <li>Does NOT store data on external servers</li>
                <li>
                  Does NOT share data with third parties for advertising or
                  marketing
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="Local Data Storage">
              <p>
                All extension settings are stored locally on your device using
                the browser's local storage API (
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  browser.storage.local
                </code>
                ):
              </p>
              <ul>
                <li>Your spoofed location coordinates</li>
                <li>Your timezone preferences</li>
                <li>WebRTC protection settings</li>
                <li>Onboarding completion status</li>
              </ul>
              <p>
                This data never leaves your device and is only accessible by the
                extension.
              </p>
            </PolicySection>

            <PolicySection title="Third-Party API Usage">
              <p>
                When you use certain features, the extension communicates with
                external services:
              </p>
              <p>
                <strong>Nominatim (OpenStreetMap)</strong> — Used when you
                search for a city or the extension performs reverse geocoding.
                Sends your search query or coordinates.{" "}
                <a
                  href="https://wiki.osmfoundation.org/wiki/Privacy_Policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
              </p>
              <p>
                <strong>VPN Sync Services</strong> — Only when you explicitly
                enable "Sync with VPN". Your public IP is sent to ipify, GeoJS,
                FreeIPAPI, ReallyFreeGeoIP, and ipinfo.io to determine your VPN
                exit region. Your IP is never persisted to disk and is cleared
                when you disable VPN sync.
              </p>
              <p>
                <strong>browser-geo-tz</strong> — Makes HTTPS range requests to
                a CDN to fetch timezone boundary data chunks. Your coordinates
                are never sent to a third-party API.
              </p>
            </PolicySection>

            <PolicySection title="Permissions Explained">
              <ul>
                <li>
                  <strong>storage:</strong> To save your settings locally
                </li>
                <li>
                  <strong>privacy:</strong> To configure WebRTC protection
                </li>
                <li>
                  <strong>{"<all_urls>"}:</strong> To inject location spoofing
                  on websites you visit
                </li>
              </ul>
              <p>
                These permissions are used solely for the extension's
                functionality and not for data collection.
              </p>
            </PolicySection>

            <PolicySection title="Your Rights">
              <p>You have complete control over your data:</p>
              <ul>
                <li>
                  All settings can be cleared by disabling or removing the
                  extension
                </li>
                <li>
                  You can view all stored data in your browser's extension
                  storage inspector
                </li>
                <li>No account or registration is required</li>
              </ul>
            </PolicySection>

            <PolicySection title="Important Disclaimers">
              <p>
                Using location spoofing may violate the terms of service of
                certain websites (streaming services, financial services,
                e-commerce platforms). You are responsible for ensuring your use
                complies with applicable terms of service and laws.
              </p>
              <p>
                GeoSpoof does NOT change browser language, spoof your IP
                address, or bypass server-side detection.
              </p>
            </PolicySection>

            <PolicySection title="Contact">
              <p>
                For questions about this privacy policy, contact us at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>{" "}
                or open an issue on{" "}
                <a
                  href="https://github.com/anthonysgro/geospoof"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                .
              </p>
            </PolicySection>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
