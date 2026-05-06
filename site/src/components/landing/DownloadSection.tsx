import { Section } from "./Section"
import { cn } from "@/lib/utils"

interface DownloadOption {
  name: string
  description: string
  href: string
  primary?: boolean
  badge?: string
}

const downloads: Array<DownloadOption> = [
  {
    name: "Firefox Add-ons",
    description: "Firefox 140+ on desktop and Android",
    href: "https://addons.mozilla.org/firefox/addon/geo-spoof/",
    primary: true,
  },
  {
    name: "Chrome Web Store",
    description: "Chrome, Brave, and Edge",
    href: "https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje",
    primary: true,
  },
  {
    name: "App Store",
    description: "Safari on iOS and macOS",
    href: "#", // TODO: replace with App Store URL
    primary: true,
    badge: "Coming soon",
  },
]

const selfHosted: DownloadOption = {
  name: "Self-hosted XPI (Firefox)",
  description:
    "Signed XPI for Firefox forks or manual installs. Auto-updates via our update manifest.",
  href: "https://github.com/anthonysgro/geospoof/releases/latest",
}

export function DownloadSection({ className }: { className?: string }) {
  return (
    <Section id="download" className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Download
        </p>
        <h2 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          Get GeoSpoof free
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          Available on all major browsers. No account required, no telemetry, no
          tracking.
        </p>
      </div>

      {/* Primary download cards */}
      <div className="mx-auto mb-8 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        {downloads.map((d) => (
          <a
            key={d.name}
            href={d.href}
            target={d.href === "#" ? undefined : "_blank"}
            rel="noopener noreferrer"
            aria-disabled={d.href === "#"}
            onClick={d.href === "#" ? (e) => e.preventDefault() : undefined}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl p-6 text-center",
              "border transition-all duration-200",
              d.href === "#"
                ? "cursor-not-allowed border-(--color-canvas-border) opacity-60"
                : "cursor-pointer border-(--color-canvas-border) hover:border-(--color-brand) hover:shadow-lg",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            <span className="text-lg font-bold text-(--color-canvas-foreground)">
              {d.name}
            </span>
            <span className="text-sm text-(--color-canvas-muted)">
              {d.description}
            </span>
            {d.badge ? (
              <span className="mt-auto inline-block rounded-full bg-(--color-canvas-border) px-3 py-1 text-xs font-medium text-(--color-canvas-muted)">
                {d.badge}
              </span>
            ) : (
              <span className="mt-auto inline-block rounded-full bg-(--color-brand)/10 px-3 py-1 text-xs font-semibold text-(--color-brand)">
                Install free →
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Self-hosted option */}
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-3 rounded-xl border border-(--color-canvas-border) px-6 py-4 md:flex-row md:items-center">
          <div className="flex-1">
            <span className="text-sm font-semibold text-(--color-canvas-foreground)">
              {selfHosted.name}
            </span>
            <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
              {selfHosted.description}
            </p>
          </div>
          <a
            href={selfHosted.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "shrink-0 rounded-lg border border-(--color-canvas-border) px-4 py-2",
              "text-sm font-medium text-(--color-canvas-foreground)",
              "transition-colors hover:border-(--color-brand) hover:text-(--color-brand)",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            GitHub Releases →
          </a>
        </div>
      </div>
    </Section>
  )
}
