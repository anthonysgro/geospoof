import * as React from "react"
import { ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/hooks/use-i18n"

/** GeoSpoof iOS app — the control surface that sets the location (Pro unlocks device GPS). */
const APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=gps&mt=8"
/** Xcode on the Mac App Store — provides the iOS developer image GeoSpoof GPS mounts. */
const XCODE_URL = "https://apps.apple.com/app/xcode/id497799835"

/**
 * Screenshots that illustrate specific setup steps, keyed by the step's index
 * in `t.gps.setup.steps`. Kept out of the i18n dictionary because the asset
 * paths are locale-independent; the alt text is English since the screenshots
 * themselves show the English UI. `width`/`height` are the intrinsic pixel
 * dimensions so the browser can reserve space and avoid layout shift.
 */
const SETUP_STEP_IMAGES: Partial<
  Record<
    number,
    {
      src: string
      alt: string
      width: number
      height: number
      /** Optional Tailwind max-width override; otherwise picked by aspect ratio. */
      maxWidthClass?: string
      /**
       * Transparent render (not a rectangular screenshot): skip the framed
       * border/background and render bare with just a drop-shadow, like the
       * other transparent PNGs on this page.
       */
      bare?: boolean
    }
  >
> = {
  // Step 1 — Install the app
  0: {
    src: "/images/gps/gps-dmg-install.png",
    alt: "The GeoSpoof GPS disk image open in Finder, with the app icon being dragged onto the Applications folder.",
    width: 1598,
    height: 1258,
    // This shot is wide; cap it smaller so it doesn't dominate the guide.
    maxWidthClass: "max-w-xs",
  },
  // Step 2 — Allow Local Network access
  1: {
    src: "/images/gps/geospoof-gps-local-network-settings.jpg",
    alt: "macOS System Settings, Privacy & Security ▸ Local Network, with the GeoSpoof GPS toggle switched on.",
    width: 996,
    height: 484,
  },
  // Step 3 — Install Xcode (Xcode's first-launch platform picker)
  2: {
    src: "/images/gps/xcode-prompt.webp",
    alt: "Xcode's first-launch “Select platforms to install” screen, with macOS checked and iOS and the other platforms left unchecked.",
    width: 996,
    height: 1308,
    maxWidthClass: "max-w-xs",
  },
  // Step 5 — Trust this computer
  4: {
    src: "/images/gps/trust-this-computer.png",
    alt: "The “Trust This Computer?” alert on an iPhone, with the Trust button highlighted.",
    width: 971,
    height: 630,
    // Cap it small so the dialog shot doesn't dominate the step.
    maxWidthClass: "max-w-xs",
  },
  // Step 6 — Enable Developer Mode
  5: {
    src: "/images/gps/ios-developer-mode-on.jpg",
    alt: "iPhone Settings, Privacy & Security ▸ Developer Mode, with the toggle switched on.",
    width: 1206,
    height: 1307,
  },
  // Step 9 — Pick a location in GeoSpoof (setup complete, GPS active)
  8: {
    src: "/images/gps/setup-complete.png",
    alt: "The GeoSpoof GPS menu-bar panel showing setup complete with GPS active.",
    width: 990,
    height: 1372,
    // Tall shot; keep it on the smaller side so it doesn't dominate the step.
    maxWidthClass: "max-w-[24rem]",
  },
}

/**
 * Outbound links attached to specific setup steps, keyed by the step's index in
 * `t.gps.setup.steps` (mirrors `SETUP_STEP_IMAGES`). The URL lives here because
 * it's locale-independent; the visible label comes from the step's `link.label`
 * in the dictionary so it stays translatable.
 */
const SETUP_STEP_LINK_HREFS: Partial<Record<number, string>> = {
  // Step 3 — Install Xcode → get Xcode (ships the developer image).
  2: XCODE_URL,
  // Step 9 — Pick a location in GeoSpoof → get the iOS app (the control surface).
  8: APP_STORE_URL,
}

/**
 * Optional terminal snippet shown under a step's `powerUserNote`, keyed by the
 * step's index in `t.gps.setup.steps`. The command is locale-independent (it's
 * code), so it lives here rather than in the dictionary; the introducing prose
 * is the step's translatable `powerUserNote`.
 */
const SETUP_STEP_CODE: Partial<Record<number, string>> = {
  // Step 8 — provision the personalized iOS developer image (iOS 17+) if Prepare
  // reports it's missing. This is the modern devicectl path; the old
  // XcodeSystemResources.pkg installer predates the personalized DDI.
  7: "xcrun devicectl manage ddis update",
}

/** A single "What you'll need" bullet — brand dot + rich (possibly linked) content. */
function ReqItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-(--color-canvas-muted)">
      <span
        className="mt-2 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
        aria-hidden="true"
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

/** External link styled for inline use inside a requirement bullet. */
function ReqLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-(--color-brand) hover:underline"
    >
      {children}
    </a>
  )
}

/**
 * The GeoSpoof GPS setup guide: a "What you'll need" prerequisites box followed
 * by the numbered steps (mirroring the in-app "Set Up…" wizard). Copy lives in
 * the i18n dictionary under `t.gps` (`setup`, `requirements`); step-specific
 * screenshots, outbound links, and terminal snippets are paired by index via
 * the maps above since they're locale-independent.
 *
 * Rendered on the /support page (not /gps): the GPS app now ships in-app
 * onboarding, so the full guide lives in support to keep the product page
 * uncluttered.
 */
export function GpsSetupGuide() {
  const { t } = useTranslations()
  const g = t.gps

  return (
    <div>
      {/* Titled "How it works" (reuses the localized howItWorks.title so every
          locale stays translated) — the app ships in-app onboarding, so this
          reads as an explainer rather than a required setup guide. */}
      <h2 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
        {g.howItWorks.title}
      </h2>
      <p className="mb-8 text-(--color-canvas-muted)">{g.setup.intro}</p>

      {/* What you'll need — right under the setup header so people can gather prerequisites first. */}
      <div className="mb-10 rounded-2xl border border-(--color-canvas-border) bg-brand/5 p-6 md:p-8">
        <div className="mb-4 flex items-center gap-2 text-(--color-brand)">
          <ListChecks className="size-6" aria-hidden="true" />
          <h3 className="text-xl font-bold text-(--color-canvas-foreground) md:text-2xl">
            {g.requirements.title}
          </h3>
        </div>
        <ul className="space-y-3">
          <ReqItem>{g.requirements.macos}</ReqItem>
          <ReqItem>
            {g.requirements.appPre}
            <ReqLink href={APP_STORE_URL}>{g.requirements.appLink}</ReqLink>
            {g.requirements.appPost}
          </ReqItem>
          <ReqItem>{g.requirements.iphone}</ReqItem>
          <ReqItem>
            {g.requirements.xcodePre}
            <ReqLink href={XCODE_URL}>{g.requirements.xcodeLink}</ReqLink>
            {g.requirements.xcodePost}
          </ReqItem>
        </ul>
      </div>

      <ol className="space-y-6 md:space-y-8">
        {g.setup.steps.map((step, i) => {
          const bullets = "bullets" in step ? step.bullets : undefined
          const image = SETUP_STEP_IMAGES[i]
          const link = "link" in step ? step.link : undefined
          const linkHref = SETUP_STEP_LINK_HREFS[i]
          const powerUserNote =
            "powerUserNote" in step ? step.powerUserNote : undefined
          const code = SETUP_STEP_CODE[i]
          return (
            <li key={step.name} className="flex gap-4">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-(--color-brand)"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-(--color-canvas-foreground)">
                  {step.name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-(--color-canvas-muted)">
                  {step.text}
                </p>
                {bullets && bullets.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex gap-2.5 text-sm leading-relaxed text-(--color-canvas-muted)"
                      >
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-(--color-brand)"
                          aria-hidden="true"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {link && linkHref && (
                  <a
                    href={linkHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
                  >
                    {link.label}
                  </a>
                )}
                {/* Secondary power-user note + copy-pasteable command. */}
                {powerUserNote && code && (
                  <div className="mt-4">
                    <p className="text-sm leading-relaxed text-(--color-canvas-muted)">
                      {powerUserNote}
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-(--color-canvas-border) bg-black/5 p-3 text-xs leading-relaxed dark:bg-white/10">
                      <code className="font-mono text-(--color-canvas-foreground)">
                        {code}
                      </code>
                    </pre>
                  </div>
                )}
                {image && (
                  <img
                    src={image.src}
                    alt={image.alt}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "mt-4 h-auto w-full",
                      // Framed for rectangular screenshots; bare (no border
                      // or shadow — a drop-shadow would trace the alpha
                      // silhouette and look odd) for transparent renders.
                      image.bare
                        ? ""
                        : "rounded-xl border border-(--color-canvas-border) shadow-sm",
                      image.maxWidthClass ??
                        (image.height > image.width
                          ? "max-w-[16rem]"
                          : "max-w-md")
                    )}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
