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
              Last Updated: May 6, 2026
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
              <p>
                <strong>
                  GeoSpoof does not implement VPN functionality.
                </strong>{" "}
                It does not use NetworkExtension or any VPN framework, and it
                does not route, tunnel, or inspect network traffic. The word
                "VPN" appears only in reference to the optional "Sync with VPN"
                feature, which helps align your browser's reported location
                with the exit region of a third-party VPN you are already
                running.
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
                <li>Resolved location name (city, country)</li>
                <li>WebRTC protection settings</li>
                <li>VPN sync preference</li>
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
                external services. The developer operates no server and
                receives none of this data.
              </p>
              <p>
                <strong>Nominatim (OpenStreetMap)</strong> — Used when you
                search for a city or the extension performs reverse geocoding.
                Sends your search query or coordinates over HTTPS.{" "}
                <a
                  href="https://wiki.osmfoundation.org/wiki/Privacy_Policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
              </p>
              <p>
                <strong>VPN Sync Services</strong> — Used only when you
                explicitly enable "Sync with VPN" or tap the "Re-sync" button.
                Your public IP address is first detected via{" "}
                <a
                  href="https://www.ipify.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ipify
                </a>{" "}
                (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  api.ipify.org
                </code>
                ), then sent in parallel over HTTPS to up to four public IP
                geolocation services to resolve its approximate region. The
                first successful response is used; the rest are cancelled. Only
                your public IP is transmitted — no identifiers, account data,
                or browsing history:
              </p>
              <ul>
                <li>
                  <a
                    href="https://www.geojs.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GeoJS
                  </a>{" "}
                  (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                    get.geojs.io
                  </code>
                  ) — primary service
                </li>
                <li>
                  <a
                    href="https://freeipapi.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    FreeIPAPI
                  </a>{" "}
                  (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                    free.freeipapi.com
                  </code>
                  ) — fallback
                </li>
                <li>
                  <a
                    href="https://reallyfreegeoip.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ReallyFreeGeoIP
                  </a>{" "}
                  (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                    reallyfreegeoip.org
                  </code>
                  ) — fallback
                </li>
                <li>
                  <a
                    href="https://ipinfo.io/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ipinfo.io
                  </a>{" "}
                  (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                    ipinfo.io
                  </code>
                  ) — fallback
                </li>
              </ul>
              <p>
                <strong>Privacy safeguards for VPN Sync:</strong> all requests
                use HTTPS. Your IP address is held only in an in-memory cache
                for the current browser session — it is never written to disk.
                The in-memory cache is cleared the moment you disable "Sync
                with VPN" or switch to a different location input method.
              </p>
              <p>
                <strong>browser-geo-tz</strong> — Makes HTTPS range requests to
                a CDN to fetch small chunks of timezone boundary data. Your
                coordinates are never sent as a query or stored by a
                third-party API; the extension resolves your timezone locally
                using the downloaded boundary data.{" "}
                <a
                  href="https://github.com/kevmo314/browser-geo-tz"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Project page
                </a>
              </p>
            </PolicySection>

            <PolicySection title="Data Security">
              <ul>
                <li>
                  All settings are stored locally using the browser's secure
                  storage API
                </li>
                <li>No data is transmitted to the extension developer</li>
                <li>
                  All third-party API calls use HTTPS encryption
                </li>
                <li>
                  The developer operates no backend server and maintains no
                  user accounts
                </li>
              </ul>
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

            <PolicySection title="For Users in the European Economic Area, United Kingdom, and Switzerland">
              <p>
                If you are located in the EEA, UK, or Switzerland, the
                following applies to you in addition to the rest of this
                policy.
              </p>
              <p>
                <strong>Controller:</strong> Anthony Sgro, an individual
                developer based in the United States, acts as the data
                controller for any personal data processed by this extension.
                You can contact the controller at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>.
              </p>
              <p>
                <strong>Legal basis for processing:</strong> The only personal
                data processed is your public IP address, and only when you
                explicitly enable the "Sync with VPN" feature. We rely on your
                consent (GDPR Art. 6(1)(a)), which you give by enabling the
                feature, and which you can withdraw at any time by disabling
                "Sync with VPN" in the extension popup. Withdrawing consent
                does not affect the lawfulness of processing based on consent
                before its withdrawal.
              </p>
              <p>
                <strong>International transfers:</strong> The third-party
                services listed above (ipify, GeoJS, FreeIPAPI,
                ReallyFreeGeoIP, ipinfo.io, Nominatim) are operated outside
                the EEA, including in the United States. When you use features
                that contact these services, your public IP is transferred to
                their infrastructure. Each service is an independent
                controller and determines its own transfer mechanisms. The
                extension developer operates no server and performs no
                cross-border transfer on its own.
              </p>
              <p>
                <strong>Your rights under GDPR / UK GDPR:</strong> you have
                the right to access, rectify, erase, restrict, object to, and
                port your personal data, and to withdraw consent at any time.
                Because the extension stores no personal data on any server
                controlled by the developer, most of these rights are
                exercised directly by you within the extension: uninstalling
                the extension or disabling "Sync with VPN" fully erases
                everything the developer could ever access. You also have the
                right to lodge a complaint with your local data protection
                authority.
              </p>
              <p>
                <strong>Retention:</strong> Your public IP is held only in
                volatile memory for the current browser session and cleared
                when you disable the feature or close your browser. No
                retention period applies because no storage occurs.
              </p>
            </PolicySection>

            <PolicySection title="For California Residents">
              <p>
                If you are a California resident, the California Consumer
                Privacy Act (CCPA), as amended by the California Privacy
                Rights Act (CPRA), gives you specific rights regarding your
                personal information.
              </p>
              <p>
                <strong>
                  We do not sell or share your personal information
                </strong>{" "}
                as those terms are defined under the CCPA/CPRA. We do not
                disclose personal information for cross-context behavioral
                advertising. We do not knowingly handle the personal
                information of consumers under 16.
              </p>
              <p>
                <strong>Categories collected:</strong> The only category of
                personal information touched by the extension is an internet
                identifier (your public IP address), and only when you
                explicitly enable "Sync with VPN." It is used for the single
                purpose described above and is not retained.
              </p>
              <p>
                <strong>Your rights:</strong> You have the right to know what
                personal information is collected, the right to delete
                personal information, the right to correct inaccurate personal
                information, the right to opt out of sale or sharing (there is
                nothing to opt out of here), and the right not to receive
                discriminatory treatment for exercising these rights. Because
                no personal information is retained by the developer, these
                rights are effectively exercised by uninstalling the extension
                or disabling the feature. For any inquiry, contact{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>.
              </p>
            </PolicySection>

            <PolicySection title="Children's Privacy">
              <p>
                GeoSpoof is not directed to children under 13, and we do not
                knowingly collect personal information from children under 13.
                If you believe a child under 13 has used the extension in a
                way that caused personal information to reach a third-party
                service referenced above, please contact us at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>{" "}
                and we will take reasonable steps to assist.
              </p>
            </PolicySection>

            <PolicySection title="Security Incidents">
              <p>
                Because the extension stores no personal data on any
                developer-operated server, there is no developer-side database
                that can be breached. In the unlikely event of a security
                issue affecting the extension itself (for example, a
                vulnerability in the extension code), we will publish an
                advisory on the project's GitHub page and release a patched
                version through the relevant browser stores. Where required
                by applicable law, we will notify affected users and the
                relevant data protection authority.
              </p>
            </PolicySection>

            <PolicySection title="Changes to This Policy">
              <p>
                If this privacy policy changes, the updated version will be
                posted on this page and in the extension's repository. The
                "Last Updated" date at the top of this page will be revised
                accordingly. Continued use of the extension after changes are
                posted constitutes your acceptance of the updated policy.
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
