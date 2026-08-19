import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { Section } from "./Section"
import type { MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTheme } from "@/hooks/use-theme"
import { usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

const heroTextVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

const heroVisualVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1] as const,
      delay: 0.2,
    },
  },
}

export function HeroSection({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const { t } = useTranslations()

  const platform = usePlatform()
  const store = getStoreLink(platform)

  const scrollToDownload = (e: MouseEvent) => {
    e.preventDefault()
    document
      .getElementById("download")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Render a localized users phrase (a "{count}" template) with the count
  // emphasized. Used for both the short and "trusted by" variants; the count
  // isn't always in the middle (e.g. JA/RU), so we split on the placeholder.
  const renderUsers = (template: string) => {
    const [before, after] = template.split("{count}")
    return (
      <>
        {before}
        <span className="font-semibold text-(--color-canvas-foreground)">
          25,000+
        </span>
        {after}
      </>
    )
  }

  const ios1Webp = isDark
    ? "/images/hero/ios-1-dark.webp"
    : "/images/hero/ios-1.webp"
  const ios1Webp640 = isDark
    ? "/images/hero/ios-1-dark-640.webp"
    : "/images/hero/ios-1-640.webp"
  const ios1Png = isDark
    ? "/images/hero/ios-1-dark.png"
    : "/images/hero/ios-1.png"
  const ios2Webp = isDark
    ? "/images/hero/ios-2-dark.webp"
    : "/images/hero/ios-2.webp"
  const ios2Webp640 = isDark
    ? "/images/hero/ios-2-dark-640.webp"
    : "/images/hero/ios-2-640.webp"
  const ios2Png = isDark
    ? "/images/hero/ios-2-dark.png"
    : "/images/hero/ios-2.png"

  return (
    <Section
      id="hero"
      // The hero runs wider than the 1200px body measure on 2048px+ canvases.
      // It has to: the `3xl` art step is 544px of block width, which leaves a
      // 1200px container too little room for the text track and drives the
      // headline to three lines. 1400px keeps the two columns in proportion and
      // trims the side gutter from ~450px to ~350px at 2100px wide. This is
      // display content, not prose, so it isn't bound by the reading measure.
      innerClassName="3xl:max-w-[87.5rem]"
      className={cn(
        "relative overflow-hidden",
        "flex min-h-[calc(100vh-5rem)] flex-col justify-center",
        "py-12! md:pt-8! md:pb-20!",
        className
      )}
    >
      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 xl:grid xl:grid-cols-2 xl:gap-4">
        {/* Visual — two phones */}
        {/* Always a motion component, even under reduced motion.
            Swapping in a plain `div` for reduced-motion users made the whole hero
            permanently invisible. The server can't read the media query, so SSR
            renders the `hidden` variant and bakes `style="opacity:0"` into the
            HTML. A plain `div` passes no `style` prop, and React hydration does
            not strip server-rendered attributes the client doesn't control — so
            the element stayed at opacity 0 forever with no motion component left
            to overwrite it.
            Keeping it a motion component and pointing `initial` at the FINAL
            state means motion still owns the style (clearing the SSR value) while
            running no animation at all, since initial and animate now match. */}
        <motion.div
          className="order-2 flex justify-center pb-6 sm:pb-14 xl:order-1 xl:justify-center xl:pb-0 tall:xl:justify-start"
          initial={prefersReducedMotion ? "visible" : "hidden"}
          animate="visible"
          variants={heroVisualVariants}
        >
          <div className="relative">
            <picture className="absolute top-8 left-0 w-56 -rotate-6 drop-shadow-2xl mid:xl:w-60 tall:xl:w-80 tall:3xl:w-96">
              <source
                srcSet={`${ios2Webp640} 640w, ${ios2Webp} 1070w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios2Png}
                alt={t.hero.secondaryPhoneAlt}
                width={1070}
                height={2185}
                className="w-full"
                fetchPriority="high"
              />
            </picture>
            <picture className="relative z-10 ml-24 block w-56 rotate-3 drop-shadow-2xl mid:xl:w-60 tall:xl:ml-32 tall:xl:w-80 tall:3xl:ml-40 tall:3xl:w-96">
              <source
                srcSet={`${ios1Webp640} 640w, ${ios1Webp} 1070w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios1Png}
                alt={t.hero.mainPhoneAlt}
                width={1070}
                height={2185}
                className="w-full"
                fetchPriority="high"
              />
            </picture>
          </div>
        </motion.div>

        {/* Text content */}
        {/* Same fix as the visual column above. This block holds the headline,
            subhead and BOTH download CTAs, so the bug hid the entire conversion
            path for anyone with Reduce Motion enabled. */}
        <motion.div
          className="order-1 flex flex-col items-center text-center xl:order-2 xl:-ml-12 xl:items-start xl:text-left"
          initial={prefersReducedMotion ? "visible" : "hidden"}
          animate="visible"
          variants={heroTextVariants}
        >
          {/* Announcement pill — the top-of-hero slot is reserved for the
              newest launch (GeoSpoof GPS) and links straight to its page. */}
          <LocaleLink
            to="/gps"
            className={cn(
              "group mb-5 inline-flex items-center gap-2 rounded-full",
              "border border-(--color-brand)/30 bg-(--color-brand)/10 py-1 pr-3 pl-1",
              "text-sm text-(--color-canvas-foreground)",
              "transition-colors hover:bg-(--color-brand)/15",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
            )}
          >
            <span className="rounded-full bg-(--color-brand) px-2 py-0.5 text-xs font-semibold tracking-wide text-white uppercase">
              {t.hero.gpsBadge}
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              {t.hero.gpsHint}
              <ArrowRight
                className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </LocaleLink>

          <h1 className="mb-4 text-4xl leading-tight font-bold text-balance text-(--color-canvas-foreground) sm:mb-6 md:text-5xl xl:text-6xl 2xl:text-[4.5rem] 3xl:text-[5.5rem]">
            {t.hero.headlinePre}
            <span className="whitespace-nowrap text-(--color-brand)">
              {t.hero.headlineEmphasis}
            </span>
            {t.hero.headlinePost}
          </h1>

          <p className="mb-6 max-w-xl text-base text-(--color-canvas-muted) sm:mb-8 md:text-lg xl:text-xl 3xl:text-2xl">
            {t.hero.subhead}
          </p>

          <div className="flex w-full flex-col items-center gap-3 xl:w-auto xl:items-start">
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-4 xl:justify-start">
              {store ? (
                <a
                  href={store.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center justify-center",
                    "bg-(--color-brand) text-white",
                    "transition-all hover:bg-(--color-brand-dark)",
                    "min-h-12 w-full rounded-brand px-6 sm:min-h-14 sm:w-auto sm:px-10",
                    "text-base font-semibold shadow-md hover:shadow-lg sm:text-lg",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  )}
                >
                  {t.storeCta[store.key]}
                </a>
              ) : (
                <a
                  href="#download"
                  onClick={scrollToDownload}
                  className={cn(
                    "inline-flex items-center justify-center",
                    "bg-(--color-brand) text-white",
                    "transition-all hover:bg-(--color-brand-dark)",
                    "min-h-12 w-full rounded-brand px-6 sm:min-h-14 sm:w-auto sm:px-10",
                    "text-base font-semibold shadow-md hover:shadow-lg sm:text-lg",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  )}
                >
                  {t.hero.downloadFree}
                </a>
              )}
              <LocaleLink
                to="/verify"
                className={cn(
                  "group inline-flex items-center justify-center gap-2.5",
                  "border border-(--color-canvas-border) text-(--color-canvas-foreground)",
                  "transition-all hover:bg-(--color-canvas-border)",
                  "min-h-12 w-full rounded-brand px-6 sm:min-h-14 sm:w-auto sm:px-10",
                  "text-base font-semibold sm:text-lg",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                <span className="relative flex size-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
                </span>
                {t.hero.seeWhatSitesDetect}
              </LocaleLink>
            </div>

            {/* When we've matched a store, still let people reach the others. */}
            {store ? (
              <a
                href="#download"
                onClick={scrollToDownload}
                className="text-sm text-(--color-canvas-muted) underline-offset-4 transition-colors hover:text-(--color-canvas-foreground) hover:underline"
              >
                {t.hero.allPlatforms}
              </a>
            ) : null}
          </div>

          {/* Social proof */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 xl:justify-start">
            <span className="text-sm text-(--color-canvas-muted)">
              {/* xs: bare count ("25,000+ users"). sm+: full "trusted by" line. */}
              <span className="sm:hidden">
                {renderUsers(t.hero.usersShort)}
              </span>
              <span className="hidden sm:inline">
                {renderUsers(t.hero.usersTrust)}
              </span>
            </span>
            <span
              className="hidden h-3.5 w-px bg-(--color-canvas-border) sm:block"
              aria-hidden="true"
            />
            <span className="flex items-center gap-1 text-sm text-(--color-canvas-muted)">
              <span className="text-amber-500" aria-hidden="true">
                ★★★★★
              </span>
              <span>
                <span className="font-semibold text-(--color-canvas-foreground)">
                  5.0
                </span>{" "}
                {t.hero.firefoxRating}
              </span>
            </span>
          </div>
        </motion.div>
      </div>
    </Section>
  )
}
