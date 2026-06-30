import { motion } from "motion/react"
import { Link } from "@tanstack/react-router"
import { Section } from "./Section"
import type { MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTheme } from "@/hooks/use-theme"
import { usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "@/hooks/use-i18n"

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
  const MotionDiv = prefersReducedMotion ? "div" : motion.div
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
      className={cn(
        "relative overflow-hidden",
        "flex min-h-[calc(100vh-5rem)] flex-col justify-center",
        "py-12! md:pt-8! md:pb-20!",
        className
      )}
    >
      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 xl:grid xl:grid-cols-2 xl:gap-4">
        {/* Visual — two phones */}
        <MotionDiv
          className="order-2 flex justify-center pb-6 sm:pb-14 xl:order-1 xl:justify-start xl:pb-0"
          {...(!prefersReducedMotion && {
            initial: "hidden",
            animate: "visible",
            variants: heroVisualVariants,
          })}
        >
          <div className="relative">
            <picture className="absolute top-8 left-0 w-56 -rotate-6 drop-shadow-2xl xl:w-80">
              <source
                srcSet={`${ios2Webp640} 640w, ${ios2Webp} 1070w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios2Png}
                alt="GeoSpoof app — secondary view"
                width={1070}
                height={2185}
                className="w-full"
                fetchPriority="high"
              />
            </picture>
            <picture className="relative z-10 ml-24 block w-56 rotate-3 drop-shadow-2xl xl:ml-32 xl:w-80">
              <source
                srcSet={`${ios1Webp640} 640w, ${ios1Webp} 1070w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios1Png}
                alt="GeoSpoof app — main view"
                width={1070}
                height={2185}
                className="w-full"
                fetchPriority="high"
              />
            </picture>
          </div>
        </MotionDiv>

        {/* Text content */}
        <MotionDiv
          className="order-1 flex flex-col items-center text-center xl:order-2 xl:-ml-12 xl:items-start xl:text-left"
          {...(!prefersReducedMotion && {
            initial: "hidden",
            animate: "visible",
            variants: heroTextVariants,
          })}
        >
          <Badge
            variant="outline"
            className="mb-4 border-brand/30 bg-brand/10 tracking-wide text-(--color-brand) uppercase"
          >
            {t.hero.badge}
          </Badge>

          <h1 className="mb-4 text-4xl leading-tight font-bold text-(--color-canvas-foreground) sm:mb-6 md:text-5xl xl:text-[4.5rem]">
            {t.hero.headlinePre}
            <span className="whitespace-nowrap text-(--color-brand)">
              {t.hero.headlineEmphasis}
            </span>
            {t.hero.headlinePost}
          </h1>

          <p className="mb-6 max-w-xl text-base text-(--color-canvas-muted) sm:mb-8 md:text-lg xl:text-xl">
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
                  {store.cta}
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
              <Link
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
              </Link>
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
              <span className="font-semibold text-(--color-canvas-foreground)">
                5,000+
              </span>{" "}
              {t.hero.usersSuffix}
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
        </MotionDiv>
      </div>
    </Section>
  )
}
