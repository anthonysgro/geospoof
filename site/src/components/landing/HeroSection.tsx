import { motion } from "motion/react"
import { Section } from "./Section"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTheme } from "@/hooks/use-theme"
import { Badge } from "@/components/ui/badge"

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

  const ios1Webp = isDark ? "/images/hero-ios-1-dark.webp" : "/images/hero-ios-1.webp"
  const ios1Webp640 = isDark ? "/images/hero-ios-1-dark-640.webp" : "/images/hero-ios-1-640.webp"
  const ios1Png = isDark ? "/images/hero-ios-1-dark.png" : "/images/hero-ios-1.png"
  const ios2Webp = isDark ? "/images/hero-ios-2-dark.webp" : "/images/hero-ios-2.webp"
  const ios2Webp640 = isDark ? "/images/hero-ios-2-dark-640.webp" : "/images/hero-ios-2-640.webp"
  const ios2Png = isDark ? "/images/hero-ios-2-dark.png" : "/images/hero-ios-2.png"

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
      <div className="relative z-10 flex flex-col items-center gap-8 xl:grid xl:grid-cols-2 xl:gap-4">
        {/* Visual — two phones */}
        <MotionDiv
          className="order-2 flex justify-center pb-14 xl:order-1 xl:justify-start xl:pb-0"
          {...(!prefersReducedMotion && {
            initial: "hidden",
            animate: "visible",
            variants: heroVisualVariants,
          })}
        >
          <div className="relative">
            <picture className="absolute top-8 left-0 w-56 -rotate-6 drop-shadow-2xl xl:w-80">
              <source
                srcSet={`${ios1Webp640} 640w, ${ios1Webp} 1008w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios1Png}
                alt="GeoSpoof app — secondary view"
                width={1008}
                height={2050}
                className="w-full"
              />
            </picture>
            <picture className="relative z-10 ml-24 block w-56 rotate-3 drop-shadow-2xl xl:ml-32 xl:w-80">
              <source
                srcSet={`${ios2Webp640} 640w, ${ios2Webp} 1010w`}
                sizes="(max-width: 1280px) 224px, 320px"
                type="image/webp"
              />
              <img
                src={ios2Png}
                alt="GeoSpoof app — main view"
                width={1010}
                height={2050}
                className="w-full"
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
            className="mb-4 border-(--color-brand)/30 bg-(--color-brand)/10 text-(--color-brand) uppercase tracking-wide"
          >
            Browser Extension
          </Badge>

          <h1 className="mb-6 text-4xl leading-tight font-bold text-(--color-canvas-foreground) md:text-5xl xl:text-[4.5rem]">
            Your location,{" "}
            <span className="whitespace-nowrap text-(--color-brand)">
              your rules
            </span>
          </h1>

          <p className="mb-8 max-w-xl text-base text-(--color-canvas-muted) md:text-lg xl:text-xl">
            GeoSpoof overrides your browser's geolocation, timezone, and WebRTC
            APIs so websites see exactly where you want them to — not where you
            actually are.
          </p>

          <div className="flex flex-wrap justify-center gap-4 xl:justify-start">
            <a
              href="#download"
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById("download")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
              className={cn(
                "inline-flex items-center justify-center",
                "bg-(--color-brand) text-white",
                "transition-all hover:bg-(--color-brand-dark)",
                "min-h-14 rounded-[var(--radius-brand)] px-10",
                "text-lg font-semibold shadow-md hover:shadow-lg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
              )}
            >
              Download Free
            </a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById("features")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
              className={cn(
                "inline-flex items-center justify-center",
                "border border-(--color-canvas-border) text-(--color-canvas-foreground)",
                "transition-all hover:bg-(--color-canvas-border)",
                "min-h-14 rounded-[var(--radius-brand)] px-10",
                "text-lg font-semibold",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
              )}
            >
              See how it works
            </a>
          </div>
        </MotionDiv>
      </div>
    </Section>
  )
}
