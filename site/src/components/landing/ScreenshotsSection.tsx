import { motion } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"
import { PhoneCarouselSection } from "./PhoneCarouselSection"

export function ScreenshotsSection({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = prefersReducedMotion ? "div" : motion.div
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Responsive srcset — serve the smallest variant that covers the
  // displayed width at 1× DPR. The image is constrained to 1600px by
  // its container, so 1800w covers 2× retina up to ~900px viewport.
  const desktopSrcSet = isDark
    ? "/images/hero/desktop-1-dark-800.webp 800w, /images/hero/desktop-1-dark-1200.webp 1200w, /images/hero/desktop-1-dark-1800.webp 1800w, /images/hero/desktop-1-dark.webp 3012w"
    : "/images/hero/desktop-1-800.webp 800w, /images/hero/desktop-1-1200.webp 1200w, /images/hero/desktop-1-1800.webp 1800w, /images/hero/desktop-1.webp 3012w"
  const desktopPng = isDark
    ? "/images/hero/desktop-1-dark.png"
    : "/images/hero/desktop-1.png"

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
            <source
              srcSet={desktopSrcSet}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 95vw, min(1600px, 95vw)"
              type="image/webp"
            />
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

      {/* Mobile counterpart — same "in action" story, native on iOS/iPadOS. */}
      <PhoneCarouselSection embedded />
    </section>
  )
}
