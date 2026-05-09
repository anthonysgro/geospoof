import { motion } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"

export function ScreenshotsSection({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = prefersReducedMotion ? "div" : motion.div
  const { resolvedTheme } = useTheme()
  const desktopWebp =
    resolvedTheme === "dark"
      ? "/images/hero-desktop-1-dark.webp"
      : "/images/hero-desktop-1.webp"
  const desktopPng =
    resolvedTheme === "dark"
      ? "/images/hero-desktop-1-dark.png"
      : "/images/hero-desktop-1.png"

  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      {/* Heading — constrained width */}
      <div className="mx-auto mb-10 max-w-[1200px] px-6 text-center md:px-12 lg:px-16">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          See it in action
        </p>
        <h2 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          Works everywhere you browse
        </h2>
      </div>

      {/* Full-bleed image with subtle frame */}
      <MotionDiv
        className="mx-auto w-full max-w-[1600px] px-4 md:px-6"
        {...(!prefersReducedMotion && {
          initial: { opacity: 0, y: 32 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
        })}
      >
        <div className="rounded-2xl p-[2px]">
          <picture>
            <source srcSet={desktopWebp} type="image/webp" />
            <img
              src={desktopPng}
              alt="GeoSpoof browser extension running on desktop — showing location spoofing in action"
              width={3012}
              height={2130}
              loading="lazy"
              className="w-full rounded-2xl"
            />
          </picture>
        </div>
      </MotionDiv>
    </section>
  )
}
