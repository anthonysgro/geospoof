import { motion } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { cn } from "@/lib/utils"

/**
 * Product demo video.
 *
 * The clip is a self-hosted, web-optimized MP4 (H.264, 1280px, 30fps,
 * faststart) served from the same origin, so it's covered by the existing
 * `default-src 'self'` CSP with no extra directive needed.
 *
 * It uses native controls with `preload="none"` and a lightweight poster so
 * the 1.5MB payload only downloads when a visitor actually hits play —
 * keeping it off the critical path for LCP/FCP.
 */
export function DemoVideoSection({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = prefersReducedMotion ? "div" : motion.div

  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto mb-10 max-w-[1200px] px-6 text-center md:px-12 lg:px-16">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Watch it work
        </p>
        <h2 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          Spoof your location in a few clicks
        </h2>
      </div>

      <MotionDiv
        className="mx-auto w-full max-w-[1100px] px-4 md:px-6"
        {...(!prefersReducedMotion && {
          initial: { opacity: 0, y: 32 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
        })}
      >
        <video
          controls
          preload="none"
          playsInline
          poster="/video/geospoof-demo-poster.jpg"
          width={1280}
          height={720}
          aria-label="GeoSpoof demo — setting a spoofed browser location with the extension"
          className="aspect-video w-full rounded-2xl border border-(--color-canvas-border) bg-black"
        >
          <source
            src="https://dsgaoei8r9jiwulf.public.blob.vercel-storage.com/geospoof-demo-v2.mp4"
            type="video/mp4"
          />
          Your browser doesn't support embedded video.{" "}
          <a href="https://dsgaoei8r9jiwulf.public.blob.vercel-storage.com/geospoof-demo-v2.mp4">
            Download the demo
          </a>{" "}
          instead.
        </video>
      </MotionDiv>
    </section>
  )
}
