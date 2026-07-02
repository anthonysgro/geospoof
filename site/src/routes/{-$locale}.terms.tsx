import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FileTextIcon } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import {
  buildAlternateLinks,
  buildOgLocaleMeta,
  getDictionary,
  localizedPath,
  toLocale,
} from "@/lib/i18n"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"

/**
 * Head for the Terms page. Only the page chrome is localized; the legal body
 * below stays in English (the authoritative version).
 */
export function buildTermsHead(locale: Locale) {
  const m = getDictionary(locale).legal.terms
  const canonical = `${SITE_URL}${localizedPath("/terms", locale)}`
  return {
    meta: [
      { title: m.metaTitle },
      { name: "description", content: m.metaDescription },
      ...buildOgLocaleMeta(locale),
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/terms", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/terms")({
  component: TermsPage,
  head: ({ params }) => buildTermsHead(toLocale(params.locale)),
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

export function TermsPage() {
  const { locale, t } = useTranslations()
  const d = t.legal.terms
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
              <FileTextIcon className="h-8 w-8 text-(--color-brand)" />
            </div>
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              {d.heading}
            </h1>
            <p className="text-body-base text-(--color-canvas-muted)">
              {d.lastUpdated}
            </p>
            {locale !== "en" && (
              <p className="mx-auto mt-4 max-w-md rounded-lg border border-(--color-canvas-border) bg-(--color-canvas) px-4 py-2 text-sm text-(--color-canvas-muted)">
                {t.legal.englishNote}
              </p>
            )}
          </div>

          <div className="space-y-8">
            <TermsSection title="1. Agreement to Terms">
              <p>
                These Terms of Service (the "Terms") are a binding agreement
                between you and Anthony Sgro, an individual developer based in
                the United States ("we," "us," or "the developer"). By
                installing or using the GeoSpoof browser extension (the
                "Extension"), you agree to be bound by these Terms. If you do
                not agree, do not install or use the Extension.
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
              <p>
                GeoSpoof is free to use. On iOS and iPadOS, the app also offers{" "}
                <strong>GeoSpoof Pro</strong>, which unlocks additional features
                such as automatic background VPN sync, per-site rules, widgets,
                custom accuracy, and the on-map location picker. Pro is
                available either as an optional auto-renewable subscription
                (monthly or annual) or as a one-time "lifetime" purchase that
                unlocks the same features permanently and does not renew; a free
                tier remains fully functional without either. On macOS these
                features are included at no charge, so there is no macOS
                subscription. The iOS, iPadOS, and macOS app may also offer
                optional one-time "tips" that let you support development and
                unlock no features.
              </p>
              <p>
                All in-app purchases and subscriptions are processed by Apple
                under its terms — billing, automatic renewals, receipts,
                cancellations, and any refund requests are handled by Apple, not
                by the developer. Auto-renewable subscriptions renew until
                cancelled, and you can manage or cancel a subscription anytime
                in your Apple Account settings. The lifetime purchase is a
                one-time charge that does not renew. Use of in-app purchases is
                also subject to{" "}
                <a
                  href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apple's Standard End User License Agreement
                </a>
                .
              </p>
            </TermsSection>

            <TermsSection title="3. Acceptable Use and Prohibited Uses">
              <p>
                You are solely responsible for how you use the Extension. You
                agree not to use GeoSpoof to:
              </p>
              <ul>
                <li>Violate the terms of service of any website or platform</li>
                <li>
                  Commit fraud, including misrepresenting your location for
                  financial gain, evading fraud-prevention systems, or obtaining
                  services you are not entitled to receive
                </li>
                <li>
                  Circumvent geo-restrictions on copyrighted content in
                  violation of applicable law, including but not limited to the
                  U.S. Digital Millennium Copyright Act (DMCA) and the EU
                  Copyright Directive
                </li>
                <li>
                  Access, use, or interact with any computer system in a manner
                  that violates the U.S. Computer Fraud and Abuse Act (CFAA) or
                  equivalent laws in your jurisdiction
                </li>
                <li>
                  Evade bans, sanctions, age restrictions, legal compliance
                  checks, or law-enforcement investigations
                </li>
                <li>
                  Engage in harassment, stalking, impersonation, or any activity
                  that harms another person
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
                The developer does not endorse or encourage any such use. The
                Extension is intended for privacy protection, web development
                testing, and educational purposes.
              </p>
            </TermsSection>

            <TermsSection title="4. Third-Party Services">
              <p>
                GeoSpoof (the Extension and the companion apps) communicates
                with third-party services to provide certain features. These
                services include Nominatim (OpenStreetMap), Apple geocoding,
                public-IP detection services (AWS, Cloudflare, Akamai, ipify,
                and the Cloudflare and Google STUN servers), and IP geolocation
                services (GeoJS, FreeIPAPI, ReallyFreeGeoIP, ipinfo.io). The
                extension also downloads timezone boundary data from the
                developer's own domain (geospoof.com). Your use of those
                services is subject to their respective terms and privacy
                policies. We are not responsible for the availability, accuracy,
                or conduct of any third-party service. The specific data sent to
                each service and the conditions under which it is sent are
                described in our <a href="/privacy">Privacy Policy</a>.
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
                amount paid by you, if any, for the Extension.
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

            <TermsSection title="11. Limitation of Actions">
              <p>
                Any claim arising out of or relating to these Terms or the
                Extension must be filed within one (1) year after the claim
                arose; otherwise, the claim is permanently barred, to the
                maximum extent permitted by applicable law.
              </p>
            </TermsSection>

            <TermsSection title="12. Severability">
              <p>
                If any provision of these Terms is found to be unenforceable or
                invalid under applicable law, that provision shall be modified
                to the minimum extent necessary to make it enforceable, or
                severed if modification is not possible. The remaining
                provisions shall remain in full force and effect.
              </p>
            </TermsSection>

            <TermsSection title="13. Changes to Terms">
              <p>
                We reserve the right to modify these Terms at any time. Changes
                will be posted on this page with an updated date, and material
                changes will be announced in the extension's release notes.
                Continued use of the Extension after changes are posted
                constitutes your acceptance of the revised Terms.
              </p>
            </TermsSection>

            <TermsSection title="14. Contact and Notices">
              <p>
                For questions about these Terms, or to send legal notices,
                contact us at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>.
                Electronic notice to this address satisfies any requirement of
                written notice under these Terms. We will send notices to you at
                the email address you provide (if any) or by posting on this
                page.
              </p>
            </TermsSection>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
