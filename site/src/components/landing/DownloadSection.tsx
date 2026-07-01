import { Section } from "./Section"
import type { Platform } from "@/hooks/use-platform"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { usePlatform } from "@/hooks/use-platform"
import { useTranslations } from "@/hooks/use-i18n"

interface DownloadOption {
  id: "firefox" | "chromium" | "apple"
  /** Which detected platform this store serves (undefined = no auto-match). */
  platform?: Exclude<Platform, "unknown">
  /** Store brand name — a proper noun, kept as-is across locales. */
  name: string
  /** Square brand logo shown on the card. */
  icon: string
  href: (campaign: string) => string
  primary?: boolean
  badge?: string
}

// Static store metadata. Display copy (description, CTA verb) is pulled from
// the active dictionary at render time via `t.download.stores[id]`.
const downloads: Array<DownloadOption> = [
  {
    id: "firefox",
    platform: "firefox",
    name: "Firefox Add-ons",
    icon: "/images/stores/firefox-store-icon.png",
    href: (campaign) =>
      `https://addons.mozilla.org/firefox/addon/geo-spoof/?utm_source=geospoof.com&utm_medium=website&utm_campaign=${campaign === "homepage" ? "download" : campaign}`,
    primary: true,
  },
  {
    id: "chromium",
    platform: "chromium",
    name: "Chrome Web Store",
    icon: "/images/stores/chrome-store-icon.png",
    href: (campaign) =>
      `https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje?utm_source=geospoof.com&utm_medium=website&utm_campaign=${campaign === "homepage" ? "download" : campaign}`,
    primary: true,
  },
  {
    id: "apple",
    platform: "apple",
    name: "App Store",
    icon: "/images/stores/safari-icon.png",
    href: (campaign) =>
      `https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=${campaign === "homepage" ? "dotcom" : campaign}&mt=8`,
    primary: true,
  },
]

const selfHosted: Array<{
  id: "dmg" | "xpi"
  icon: string
  href: () => string
}> = [
  {
    id: "dmg",
    icon: "/images/stores/dmg-install-icon.png",
    href: () => "https://github.com/anthonysgro/geospoof/releases/latest",
  },
  {
    id: "xpi",
    icon: "/images/stores/github-store-icon.svg",
    href: () => "https://github.com/anthonysgro/geospoof/releases/latest",
  },
]

export function DownloadSection({
  className,
  campaign = "homepage",
}: {
  className?: string
  campaign?: string
}) {
  const platform = usePlatform()
  const { t } = useTranslations()
  const recommended = downloads.find((d) => d.platform === platform)

  // Show the matched store first; the rest keep their original order. On the
  // server (and first client render) platform is "unknown", so this is a no-op
  // and the markup matches — the reorder happens after hydration.
  const orderedDownloads = recommended
    ? [recommended, ...downloads.filter((d) => d !== recommended)]
    : downloads

  return (
    <Section id="download" className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          {t.download.eyebrow}
        </p>
        <h2 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          {t.download.heading}
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          {t.download.subhead}
        </p>
      </div>

      {/* Primary download cards — the card matching the visitor's browser is
          moved first and highlighted (see orderedDownloads / isRecommended). */}
      <div className="mx-auto mb-8 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        {orderedDownloads.map((d) => {
          const isRecommended = d === recommended
          return (
            <a
              key={d.name}
              href={d.href(campaign)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-2xl p-6 text-center",
                "border transition-all duration-200",
                "cursor-pointer hover:border-(--color-brand) hover:shadow-lg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
                isRecommended
                  ? "border-(--color-brand) shadow-md ring-1 ring-brand/40"
                  : "border-(--color-canvas-border)"
              )}
            >
              {isRecommended ? (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-(--color-brand) text-white">
                  {t.download.recommendedBadge}
                </Badge>
              ) : null}
              <img
                src={d.icon}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 object-contain"
                width={48}
                height={48}
              />
              <span className="text-lg font-bold text-(--color-canvas-foreground)">
                {d.name}
              </span>
              <span className="text-sm text-(--color-canvas-muted)">
                {t.download.stores[d.id].description}
              </span>
              {d.badge ? (
                <Badge variant="secondary" className="mt-auto">
                  {d.badge}
                </Badge>
              ) : (
                <span className="mt-auto inline-block rounded-full bg-(--color-brand)/10 px-3 py-1 text-xs font-semibold text-(--color-brand)">
                  {t.download.installFree} →
                </span>
              )}
            </a>
          )
        })}
      </div>

      {/* Self-hosted options */}
      <div className="mx-auto max-w-3xl">
        <h3 className="mb-4 text-center text-sm font-semibold tracking-widest text-(--color-canvas-muted) uppercase">
          {t.download.otherWays}
        </h3>
        <div className="space-y-3">
          {selfHosted.map((option) => (
            <div
              key={option.id}
              className="flex flex-col gap-3 rounded-xl border border-(--color-canvas-border) px-6 py-4 md:flex-row md:items-center"
            >
              <img
                src={option.icon}
                alt=""
                aria-hidden="true"
                className="hidden h-8 w-8 object-contain md:block"
                width={32}
                height={32}
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-(--color-canvas-foreground)">
                  {t.download.selfHosted[option.id].name}
                </span>
                <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
                  {t.download.selfHosted[option.id].description}
                </p>
              </div>
              <a
                href={option.href()}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "shrink-0 rounded-lg border border-(--color-canvas-border) px-4 py-2",
                  "text-sm font-medium text-(--color-canvas-foreground)",
                  "transition-colors hover:border-(--color-brand) hover:text-(--color-brand)",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {t.download.selfHosted.cta} →
              </a>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
