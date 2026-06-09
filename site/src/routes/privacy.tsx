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
              Last Updated: June 8, 2026
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
                <strong>GeoSpoof does not implement VPN functionality.</strong>{" "}
                It does not use NetworkExtension or any VPN framework, and it
                does not route, tunnel, or inspect network traffic. The word
                "VPN" appears only in reference to the optional "Sync with VPN"
                feature, which helps align your browser's reported location with
                the exit region of a third-party VPN you are already running.
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
                When you use certain features, GeoSpoof (both the Safari
                extension and the companion app) communicates with external
                services. The developer operates no server and receives none of
                this data.
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
                GeoSpoof first detects your public (VPN exit) IP, then looks up
                its approximate region. In the Safari extension, detection tries{" "}
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  checkip.amazonaws.com
                </code>{" "}
                (AWS),{" "}
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  cloudflare.com/cdn-cgi/trace
                </code>
                ,{" "}
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  whatismyip.akamai.com
                </code>{" "}
                (Akamai), and{" "}
                <a
                  href="https://www.ipify.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ipify
                </a>{" "}
                (
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  api.ipify.org
                </code>
                ) in order with failover; the companion app instead sends a STUN
                request to Cloudflare and Google (
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  stun.cloudflare.com
                </code>
                ,{" "}
                <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                  stun.l.google.com
                </code>
                ) with ipify as a fallback. The detected IP is then sent in
                parallel over HTTPS to up to four geolocation services; the first
                successful response is used and the rest are cancelled. Only your
                public IP is transmitted — no identifiers, account data, or
                browsing history:
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
                  (
                  <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
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
                  (
                  <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
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
                  (
                  <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
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
                  (
                  <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                    ipinfo.io
                  </code>
                  ) — fallback
                </li>
              </ul>
              <p>
                <strong>Privacy safeguards for VPN Sync:</strong> all requests
                use HTTPS. Your IP address is held only in an in-memory cache
                for the current browser session — it is never written to disk.
                The in-memory cache is cleared the moment you disable "Sync with
                VPN" or switch to a different location input method.
              </p>
              <p>
                <strong>browser-geo-tz</strong> — Makes HTTPS range requests to
                a CDN to fetch small chunks of timezone boundary data. Your
                coordinates are never sent as a query or stored by a third-party
                API; the extension resolves your timezone locally using the
                downloaded boundary data.{" "}
                <a
                  href="https://github.com/kevmo314/browser-geo-tz"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Project page
                </a>
              </p>
              <p>
                <strong>Apple geocoding</strong> (companion app only) — When you
                set a manual location in the app, it uses Apple's on-device
                geocoding (<code className="rounded bg-(--color-canvas-border) px-1 text-sm">CLGeocoder</code>)
                to resolve the precise timezone for the chosen coordinates,
                falling back to bundled offline boundary data when offline. City
                search in the app is fully offline and sends nothing.
              </p>
            </PolicySection>

            <PolicySection title="Data Security">
              <ul>
                <li>
                  All settings are stored locally using the browser's secure
                  storage API
                </li>
                <li>No data is transmitted to the extension developer</li>
                <li>All third-party API calls use HTTPS encryption</li>
                <li>
                  The developer operates no backend server and maintains no user
                  accounts
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="Permissions Explained">
              <p>
                The extension requires the following permissions. Exact
                permissions vary slightly by browser (some APIs do not exist on
                every engine), but the principles below apply everywhere.
              </p>
              <ul>
                <li>
                  <strong>storage:</strong> To save your settings locally on
                  your device
                </li>
                <li>
                  <strong>privacy</strong> (Firefox/Chromium only): To configure
                  WebRTC protection settings
                </li>
                <li>
                  <strong>proxy</strong> (Firefox/Chromium only): To detect when
                  a browser-based VPN switches exit nodes so VPN Sync can
                  re-align your spoofed location. GeoSpoof only <em>observes</em>{" "}
                  proxy changes — it never sets or routes a proxy.
                </li>
                <li>
                  <strong>scripting:</strong> To inject the location-spoofing
                  overrides into pages
                </li>
                <li>
                  <strong>alarms:</strong> To run periodic health checks that
                  keep the spoofing overrides active
                </li>
                <li>
                  <strong>idle</strong> (Firefox/Chromium only): Part of the
                  VPN-sync re-check scheduling
                </li>
                <li>
                  <strong>{"<all_urls>"} / host access to all websites:</strong>{" "}
                  To inject location spoofing on every website you visit
                </li>
                <li>
                  <strong>webRequest permissions</strong> (Firefox only): To
                  repair the timezone leak inside Web Workers at the network
                  layer
                </li>
              </ul>
              <p>
                These permissions are used solely for the extension's
                functionality and not for data collection.
              </p>
            </PolicySection>

            <PolicySection title='Why Safari warns that GeoSpoof can "read and alter webpages"'>
              <p>
                When you enable GeoSpoof, Safari shows a prompt similar to: "The
                extension 'GeoSpoof' would like to access [websites]. This
                extension will be able to read and alter webpages and see your
                browsing history on these websites. This could include sensitive
                information, including passwords, phone numbers, and credit
                cards."
              </p>
              <p>
                <strong>
                  This warning is standard for any extension that runs on every
                  site, and the specific websites Safari names are simply the
                  tabs you happen to have open at that moment — GeoSpoof does not
                  single them out and has no special interest in them.
                </strong>{" "}
                Safari shows this same wording for ad blockers, password
                managers, and dark-mode extensions.
              </p>
              <p>
                GeoSpoof needs broad website access because its only job is to
                make every site you visit see your chosen location instead of
                your real one. To do that it must run a small script on each page
                that overrides the browser's location, timezone, and date APIs{" "}
                <em>before</em> the page's own code runs. There is no narrower
                permission that would let it spoof location site-wide.
              </p>
              <p>
                <strong>What "read and alter webpages" technically allows vs.
                what GeoSpoof actually does:</strong>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm [&_td]:border [&_td]:border-(--color-canvas-border) [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-(--color-canvas-border) [&_th]:p-2 [&_th]:font-semibold [&_th]:text-(--color-canvas-foreground)">
                  <thead>
                    <tr>
                      <th>Safari says it could</th>
                      <th>What GeoSpoof actually does</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        Read page content (including passwords, form fields,
                        credit cards)
                      </td>
                      <td>
                        Never reads form fields, passwords, page text, or any
                        page content. The overrides only replace location/time
                        API return values.
                      </td>
                    </tr>
                    <tr>
                      <td>Alter webpages</td>
                      <td>
                        Only "alters" the values returned by the Geolocation,{" "}
                        <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                          Date
                        </code>
                        ,{" "}
                        <code className="rounded bg-(--color-canvas-border) px-1 text-sm">
                          Intl
                        </code>
                        , and Temporal APIs. It does not modify page text, inject
                        ads, or rewrite content.
                      </td>
                    </tr>
                    <tr>
                      <td>See your browsing history</td>
                      <td>
                        Never reads, stores, or transmits your history or the
                        list of sites you visit.
                      </td>
                    </tr>
                    <tr>
                      <td>Transmit data externally</td>
                      <td>
                        Sends nothing to the developer. The only outbound
                        requests are the optional geocoding / VPN-sync API calls
                        described above, and only when you actively use those
                        features.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                The extension is open source, so you can verify all of the
                above:{" "}
                <a
                  href="https://github.com/anthonysgro/geospoof"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/anthonysgro/geospoof
                </a>
              </p>
              <p>
                <strong>
                  Which Safari permission option should you choose?
                </strong>
              </p>
              <ul>
                <li>
                  <strong>Allow for One Day</strong> — best for trying GeoSpoof
                  out. Access expires automatically, so it's the lowest-commitment
                  option.
                </li>
                <li>
                  <strong>Always Allow on Every Website</strong> — most
                  convenient if you want location protection everywhere without
                  re-granting access.
                </li>
                <li>
                  <strong>Allow / Always Allow on specific websites</strong> — if
                  you only want spoofing on certain sites, grant access per-site
                  and leave the rest unprotected.
                </li>
                <li>
                  <strong>Deny</strong> — GeoSpoof will not run on that site (it
                  cannot spoof your location there).
                </li>
              </ul>
              <p>
                You can change or revoke any of these at any time in{" "}
                <strong>Safari → Settings → Extensions → GeoSpoof</strong>, or
                per-site from the <strong>AA</strong> menu in the address bar on
                iOS/iPadOS. Restricting access never deletes your settings — it
                only controls where spoofing is allowed to run.
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
                <strong>What this extension does NOT do:</strong>
              </p>
              <ul>
                <li>
                  <strong>Does NOT implement VPN functionality</strong> — no
                  NetworkExtension, no tunneling, no traffic interception
                </li>
                <li>
                  <strong>Does NOT change browser language or locale
                  settings</strong> — your browser's language preferences remain
                  unchanged, which may create detectable inconsistencies with
                  your spoofed location
                </li>
                <li>
                  <strong>Does NOT spoof IP address</strong> — your real IP
                  address is still visible to websites unless you use a VPN
                </li>
                <li>
                  <strong>Does NOT bypass server-side detection</strong> —
                  websites can still detect your location through IP address,
                  payment methods, account history, and other server-side
                  signals
                </li>
              </ul>
              <p>
                <strong>Terms of service compliance.</strong> Using location
                spoofing may violate the terms of service of certain websites,
                particularly streaming services (Netflix, HBO Max, Disney+,
                etc.), financial services, and e-commerce platforms with
                region-specific pricing.{" "}
                <strong>
                  You are responsible for ensuring your use of this extension
                  complies with applicable terms of service and laws.
                </strong>{" "}
                The extension developer is not liable for any violations or
                consequences resulting from your use of this extension.
              </p>
              <p>
                <strong>Intended use.</strong> This extension is intended for
                privacy protection and testing, web development and testing,
                educational purposes, and legitimate privacy enhancement. It is
                NOT intended for circumventing geo-restrictions on copyrighted
                content, fraud or deception, or violating terms of service
                agreements. We absolutely do not endorse any illegitimate or
                illegal use of this tool whatsoever. Use responsibly and in
                accordance with local laws and regulations.
              </p>
            </PolicySection>

            <PolicySection title="For Users in the European Economic Area, United Kingdom, and Switzerland">
              <p>
                If you are located in the EEA, UK, or Switzerland, the following
                applies to you in addition to the rest of this policy.
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
                "Sync with VPN" in the extension popup. Withdrawing consent does
                not affect the lawfulness of processing based on consent before
                its withdrawal.
              </p>
              <p>
                <strong>International transfers:</strong> The third-party
                services listed above (AWS, Cloudflare, Akamai, ipify, GeoJS,
                FreeIPAPI, ReallyFreeGeoIP, ipinfo.io, Google STUN, Nominatim,
                and the jsDelivr CDN) are operated outside the EEA, including in
                the United States. When you use features that contact these
                services, your public IP is transferred to their infrastructure.
                Each service is an independent controller and determines its own
                transfer mechanisms. The extension developer operates no server
                and performs no cross-border transfer on its own.
              </p>
              <p>
                <strong>Your rights under GDPR / UK GDPR:</strong> you have the
                right to access, rectify, erase, restrict, object to, and port
                your personal data, and to withdraw consent at any time. Because
                the extension stores no personal data on any server controlled
                by the developer, most of these rights are exercised directly by
                you within the extension: uninstalling the extension or
                disabling "Sync with VPN" fully erases everything the developer
                could ever access. You also have the right to lodge a complaint
                with your local data protection authority.
              </p>
              <p>
                <strong>Retention:</strong> Your public IP is held only in
                volatile memory for the current browser session and cleared when
                you disable the feature or close your browser. No retention
                period applies because no storage occurs.
              </p>
            </PolicySection>

            <PolicySection title="For California Residents">
              <p>
                If you are a California resident, the California Consumer
                Privacy Act (CCPA), as amended by the California Privacy Rights
                Act (CPRA), gives you specific rights regarding your personal
                information.
              </p>
              <p>
                <strong>
                  We do not sell or share your personal information
                </strong>{" "}
                as those terms are defined under the CCPA/CPRA. We do not
                disclose personal information for cross-context behavioral
                advertising. We do not knowingly handle the personal information
                of consumers under 16.
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
                personal information is collected, the right to delete personal
                information, the right to correct inaccurate personal
                information, the right to opt out of sale or sharing (there is
                nothing to opt out of here), and the right not to receive
                discriminatory treatment for exercising these rights. Because no
                personal information is retained by the developer, these rights
                are effectively exercised by uninstalling the extension or
                disabling the feature. For any inquiry, contact{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>.
              </p>
            </PolicySection>

            <PolicySection title="Children's Privacy">
              <p>
                GeoSpoof is not directed to children under 13, and we do not
                knowingly collect personal information from children under 13.
                If you believe a child under 13 has used the extension in a way
                that caused personal information to reach a third-party service
                referenced above, please contact us at{" "}
                <a href="mailto:support@geospoof.com">support@geospoof.com</a>{" "}
                and we will take reasonable steps to assist.
              </p>
            </PolicySection>

            <PolicySection title="Security Incidents">
              <p>
                Because the extension stores no personal data on any
                developer-operated server, there is no developer-side database
                that can be breached. In the unlikely event of a security issue
                affecting the extension itself (for example, a vulnerability in
                the extension code), we will publish an advisory on the
                project's GitHub page and release a patched version through the
                relevant browser stores. Where required by applicable law, we
                will notify affected users and the relevant data protection
                authority.
              </p>
            </PolicySection>

            <PolicySection title="Changes to This Policy">
              <p>
                If this privacy policy changes, the updated version will be
                posted on this page and in the extension's repository. The "Last
                Updated" date at the top of this page will be revised
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

            <PolicySection title="Open Source">
              <p>
                GeoSpoof is open source. You can review the complete source code
                to verify these privacy practices:{" "}
                <a
                  href="https://github.com/anthonysgro/geospoof"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/anthonysgro/geospoof
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
