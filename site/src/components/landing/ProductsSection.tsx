import { ArrowRight } from "lucide-react"
import { Section } from "./Section"
import type { MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

const ctaClass = cn(
  "group mt-auto inline-flex items-center justify-center gap-2",
  "min-h-12 rounded-brand px-6",
  "text-base font-semibold transition-all",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

/**
 * Product icons served from /public. These are the real app icons and carry
 * their own rounded-tile background, so we render them as-is with a soft
 * shadow (no wrapper, no extra rounding) — same as the GPS page hero icon.
 */
const FREE_ICON = "/images/hero/mac-icon-512@2x.png"
const PRO_ICON = "/images/hero/Icon-iOS-Dark-1024@1x.png"

const productIconClass = "size-12 shrink-0 drop-shadow-sm"

const arrowClass =
  "size-4 shrink-0 transition-transform group-hover:translate-x-0.5"

/**
 * Homepage products section — the "branded house" moment. Sits right after the
 * hero to answer "what does GeoSpoof make?" before the deeper feature sections:
 * the free browser extension (top of funnel) and GeoSpoof GPS (the Pro,
 * device-level flagship). Each card routes to its own surface.
 */
export function ProductsSection({ className }: { className?: string }) {
  const { t } = useTranslations()
  const p = t.products

  const scrollToDownload = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    document
      .getElementById("download")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <Section id="products" className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          {p.eyebrow}
        </p>
        <h2 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          {p.heading}
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          {p.subhead}
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {/* Free — the browser extension (top of funnel) */}
        <div className="flex flex-col rounded-2xl border border-(--color-canvas-border) p-8">
          <div className="mb-5 flex items-center justify-between">
            <img
              src={FREE_ICON}
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              className={productIconClass}
            />
            <Badge variant="secondary">{p.free.badge}</Badge>
          </div>
          <h3 className="mb-2 text-xl font-bold text-(--color-canvas-foreground)">
            {p.free.title}
          </h3>
          <p className="mb-6 text-(--color-canvas-muted)">
            {p.free.description}
          </p>
          <a
            href="#download"
            onClick={scrollToDownload}
            className={cn(
              ctaClass,
              "border border-(--color-canvas-border) text-(--color-canvas-foreground)",
              "hover:bg-(--color-canvas-border)"
            )}
          >
            {t.hero.downloadFree}
            <ArrowRight className={arrowClass} aria-hidden="true" />
          </a>
        </div>

        {/* Pro — GeoSpoof GPS (device-level flagship, highlighted) */}
        <div className="flex flex-col rounded-2xl border border-(--color-brand) p-8 shadow-md ring-1 ring-brand/40">
          <div className="mb-5 flex items-center justify-between">
            <img
              src={PRO_ICON}
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              className={productIconClass}
            />
            <Badge className="bg-(--color-brand) text-white">
              {p.pro.badge}
            </Badge>
          </div>
          <h3 className="mb-2 text-xl font-bold text-(--color-canvas-foreground)">
            {p.pro.title}
          </h3>
          <p className="mb-6 text-(--color-canvas-muted)">
            {p.pro.description}
          </p>
          <LocaleLink
            to="/gps"
            className={cn(
              ctaClass,
              "bg-(--color-brand) text-white shadow-md",
              "hover:bg-(--color-brand-dark) hover:shadow-lg"
            )}
          >
            {p.pro.cta}
            <ArrowRight className={arrowClass} aria-hidden="true" />
          </LocaleLink>
        </div>
      </div>
    </Section>
  )
}
