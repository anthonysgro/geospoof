import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FileTextIcon } from "lucide-react"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service | GeoSpoof" },
      {
        name: "description",
        content:
          "Terms of Service for GeoSpoof — understand the terms governing your use of the extension.",
      },
    ],
  }),
})

function TermsSection({
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

function TermsPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-(--color-brand)/10">
              <FileTextIcon className="h-8 w-8 text-(--color-brand)" />
            </div>
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              Terms of Service
            </h1>
            <p className="text-body-base text-(--color-canvas-muted)">
              Last Updated: May 6, 2026
            </p>
          </div>

          <div className="space-y-8">
            <TermsSection title="1. Agreement to Terms">
              <p>
                By installing or using the GeoSpoof browser extension (the
                "Extension"), you agree to be bound by these Terms of Service.
                If you do not agree, do not install or use the Extension.
              </p>
              <p>
                Your use of the Extension is also governed by our{" "}
                <a href="/privacy">Privacy Policy</a>, which is incorporated
                into these Terms by reference.
              </p>
            </TermsSection>

            <TermsSection title="2. Description of the Extension">
              <p>
                GeoSpoof is a browser extension that overrides browser APIs
                related to geolocation, timezone, and WebRTC to allow you to
                present a chosen location to websites. It is intended for
                privacy protection, web development testing, and educational
                purposes.
              </p>
              <p>
                GeoSpoof does not change your IP address. It does not provide
                anonymity or circumvent server-side detection methods.
              </p>
            </TermsSection>

            <TermsSection title="3. Acceptable Use">
              <p>
                You are solely responsible for how you use the Extension. You
                agree not to use GeoSpoof to:
              </p>
              <ul>
                <li>Violate the terms of service of any website or platform</li>
                <li>
                  Commit fraud, including misrepresenting your location for
                  financial gain
                </li>
                <li>
                  Circumvent geo-restrictions on copyrighted content in
                  violation of applicable law
                </li>
                <li>
                  Engage in any activity that is illegal under applicable local,
                  national, or international law
                </li>
              </ul>
              <p>
                <strong>
                  Use of this Extension to violate third-party terms of service
                  or applicable law is entirely at your own risk and
                  responsibility.
                </strong>{" "}
                The developer does not endorse or encourage any such use.
              </p>
            </TermsSection>

            <TermsSection title="4. Third-Party Services">
              <p>
                The Extension communicates with third-party services to provide
                certain features. These services include Nominatim
                (OpenStreetMap), ipify, GeoJS, FreeIPAPI, ReallyFreeGeoIP,
                ipinfo.io, and the browser-geo-tz CDN. Your use of those
                services is subject to their respective terms and privacy
                policies. We are not responsible for the availability,
                accuracy, or conduct of any third-party service. The specific
                data sent to each service and the conditions under which it is
                sent are described in our{" "}
                <a href="/privacy">Privacy Policy</a>.
              </p>
            </TermsSection>

            <TermsSection title="5. Open Source">
              <p>
                GeoSpoof is open source software licensed under the MIT License.
                The source code is available at{" "}
                <a
                  href="https://github.com/anthonysgro/geospoof"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/anthonysgro/geospoof
                </a>
                . The{" "}
                <a
                  href="https://github.com/anthonysgro/geospoof/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MIT License
                </a>{" "}
                governs your rights to use, copy, modify, and distribute the
                source code.
              </p>
            </TermsSection>

            <TermsSection title="6. Intellectual Property">
              <p>
                The GeoSpoof name, logo, and associated branding are the
                property of the developer. The underlying source code is
                available under the MIT License. Nothing in these Terms grants
                you rights to use the GeoSpoof name or branding beyond what is
                necessary to describe your use of the Extension.
              </p>
            </TermsSection>

            <TermsSection title="7. Disclaimer of Warranties">
              <p>
                The Extension is provided on an "AS IS" and "AS AVAILABLE" basis
                without warranties of any kind, express or implied. We do not
                warrant that:
              </p>
              <ul>
                <li>
                  The Extension will function correctly on all browsers,
                  websites, or platforms
                </li>
                <li>
                  The Extension will remain undetected by websites or
                  fingerprinting tools
                </li>
                <li>
                  The Extension will be free from bugs, errors, or interruptions
                </li>
                <li>
                  Third-party services used by the Extension will remain
                  available
                </li>
              </ul>
            </TermsSection>

            <TermsSection title="8. Limitation of Liability">
              <p>
                To the maximum extent permitted by applicable law, the developer
                shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages arising from your use of or
                inability to use the Extension, including but not limited to:
              </p>
              <ul>
                <li>
                  Account bans, suspensions, or penalties imposed by third-party
                  platforms
                </li>
                <li>
                  Legal consequences resulting from your use of the Extension in
                  violation of applicable law or third-party terms
                </li>
                <li>
                  Loss of data or privacy breaches caused by third parties
                </li>
              </ul>
              <p>
                In no event shall the developer's total liability exceed the
                amount paid by you, if any, for the Extension (which is free).
              </p>
            </TermsSection>

            <TermsSection title="9. Indemnification">
              <p>
                You agree to indemnify and hold harmless the developer from and
                against any claims, damages, losses, or expenses (including
                reasonable attorney's fees) arising from your use of the
                Extension or your violation of these Terms.
              </p>
            </TermsSection>

            <TermsSection title="10. Governing Law">
              <p>
                These Terms shall be governed by and construed in accordance
                with the laws of the State of New York, United States, without
                regard to its conflict of law provisions.
              </p>
            </TermsSection>

            <TermsSection title="11. Severability">
              <p>
                If any provision of these Terms is found to be unenforceable or
                invalid under applicable law, that provision shall be modified
                to the minimum extent necessary to make it enforceable, or
                severed if modification is not possible. The remaining
                provisions shall remain in full force and effect.
              </p>
            </TermsSection>

            <TermsSection title="12. Changes to Terms">
              <p>
                We reserve the right to modify these Terms at any time. Changes
                will be posted on this page with an updated date. Continued use
                of the Extension after changes are posted constitutes your
                acceptance of the revised Terms.
              </p>
            </TermsSection>

            <TermsSection title="13. Contact">
              <p>
                For questions about these Terms, contact us at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>.
              </p>
            </TermsSection>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
