import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/support")({
  component: SupportPage,
  head: () => ({
    meta: [
      { title: "Support | GeoSpoof" },
      {
        name: "description",
        content:
          "GeoSpoof support — find answers to common issues or get in touch.",
      },
    ],
  }),
})

const faqs = [
  {
    q: "Spoofing isn't working after I installed the extension",
    a: "The extension injects into pages at load time, so any tabs that were already open when you installed or enabled it won't be protected yet. Refresh every tab you want to protect after enabling Location Protection. If it still doesn't work, try disabling and re-enabling the extension, then refresh again.",
  },
  {
    q: "VPN Sync shows a timeout or network error",
    a: "VPN Sync calls a few public IP geolocation services to detect your VPN exit region. Some VPNs or firewalls block outbound requests to these services. Try temporarily disabling your VPN's firewall or kill switch. If the issue persists, use the Search City or Enter Coordinates tabs to set your location manually instead.",
  },
  {
    q: "Spoofing stopped working after a browser update",
    a: "Browser updates occasionally change how extensions interact with page APIs. Make sure you're on the latest version of GeoSpoof. Check the version in the Details tab of the popup and compare it to the latest release on GitHub. If you're behind, update through your browser's extension manager.",
  },
  {
    q: "A specific website isn't being spoofed",
    a: "Some sites use server-side location detection based on your IP address rather than the browser Geolocation API. GeoSpoof overrides browser APIs only — it does not change your IP address. For full location consistency, use GeoSpoof alongside a VPN pointed at the same region.",
  },
  {
    q: "The extension works on desktop but not on my phone",
    a: "On Firefox for Android, the extension is fully supported on Firefox 140 and later. On iOS and macOS Safari, the extension is available through the App Store — tap the puzzle piece icon in the address bar and enable GeoSpoof for the site you want to protect. Chrome for iOS and Android does not support extensions.",
  },
  {
    q: "WebRTC Protection isn't available / greyed out",
    a: "WebRTC Protection uses a browser privacy API that is not available on all platforms. It is supported on Firefox and Chromium-based browsers on desktop. It is not available on Safari or Firefox for Android.",
  },
  {
    q: 'I see "Extensions cannot run on this page"',
    a: "Browsers restrict extensions from running on built-in pages such as about:blank, chrome://, about:newtab, and extension store pages. This is a browser security boundary that cannot be bypassed. GeoSpoof works on all normal websites.",
  },
]

function CopyEmailButton() {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText("support@geospoof.com")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
        "text-sm font-medium transition-colors",
        copied
          ? "bg-(--color-brand)/10 text-(--color-brand)"
          : "bg-(--color-canvas-border) text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
      )}
      aria-label="Copy email address"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  )
}

function SupportPage() {
  const [open, setOpen] = React.useState<number | null>(null)

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              How can we help?
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              Find answers to common issues below, or reach out directly.
            </p>
          </div>

          {/* FAQ */}
          <div className="mb-16 space-y-3">
            <h2 className="mb-6 text-xl font-semibold text-(--color-canvas-foreground)">
              Common Issues
            </h2>
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-(--color-canvas-border)"
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-4",
                    "px-5 py-4 text-left",
                    "font-semibold text-(--color-canvas-foreground)",
                    "transition-colors hover:bg-(--color-canvas-border)/50",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  )}
                  aria-expanded={open === i}
                >
                  <span>{faq.q}</span>
                  <span
                    className={cn(
                      "flex-shrink-0 text-xs text-(--color-canvas-muted) transition-transform duration-200",
                      open === i && "rotate-90"
                    )}
                  >
                    ▶
                  </span>
                </button>
                {open === i && (
                  <div className="text-body-base border-t border-(--color-canvas-border) px-5 pb-5 leading-relaxed text-(--color-canvas-muted)">
                    <p className="pt-4">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Contact — hows-today style */}
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-(--color-canvas-foreground)">
              Still need help?
            </h2>
            <p className="text-body-lg mx-auto mb-8 max-w-md text-(--color-canvas-muted)">
              Send us an email and we'll get back to you within a day or two.
            </p>

            {/* Email + copy */}
            <div className="mb-4 inline-flex items-center gap-3">
              <a
                href="mailto:support@geospoof.com"
                className="text-xl font-semibold text-(--color-brand) hover:underline"
              >
                support@geospoof.com
              </a>
              <CopyEmailButton />
            </div>

            <p className="text-body-base text-(--color-canvas-muted)">
              You can also report bugs on{" "}
              <a
                href="https://github.com/anthonysgro/geospoof/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--color-brand) hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
