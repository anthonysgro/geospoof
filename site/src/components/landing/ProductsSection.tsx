import { ArrowRight } from "lucide-react"
import { Section } from "./Section"
import type { MouseEvent, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

const ctaClass = cn(
  "group inline-flex items-center justify-center gap-2",
  "min-h-12 rounded-brand px-6",
  "text-base font-semibold transition-all",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

/**
 * Product icons served from /public. These are the real app icons and carry
 * their own rounded-tile background, so we render them as-is with a soft
 * shadow (no wrapper, no extra rounding).
 *
 * The GPS card deliberately points at the /images/gps/ copy rather than the
 * identical /images/hero/ one: it's the same asset /gps loads, so a visitor who
 * follows the card gets a cache hit instead of a second download.
 */
const APP_ICON = "/images/hero/mac-icon-512@2x.png"
const GPS_ICON = "/images/gps/Icon-iOS-Dark-1024@1x.png"

const productIconClass = "size-12 shrink-0 drop-shadow-sm"

const arrowClass =
  "size-4 shrink-0 transition-transform group-hover:translate-x-0.5"

/**
 * Homepage products section — the "branded house" moment. Sits right after the
 * hero to answer "what does GeoSpoof make?" before the deeper feature sections.
 *
 * The two cards are the two *products*: GeoSpoof (the extension + mobile app,
 * free, on every major browser plus iPhone/iPad/Mac) and GeoSpoof GPS (the free
 * Mac/Windows menu-bar companion that moves the iPhone's real system GPS).
 *
 * GeoSpoof Pro is a *tier*, not a product, so it gets the strip below the grid
 * rather than a card. This is a reversal of the earlier framing, which put Pro
 * in card two and led its body with GPS. That version had two problems: it
 * conflated the paid tier with the free companion app (they're different things
 * on different platforms with different prices), and it left GPS — now the most
 * differentiated thing we ship, and a hard requirement for device GPS on iOS —
 * with no name-level billing anywhere above the footer.
 *
 * The original worry behind that framing was real, though: titling a card
 * "GeoSpoof GPS" made the whole subscription read as Mac-gated to the (larger)
 * audience without a Mac. The fix is the Pro strip. Pro is described there as an
 * in-app upgrade with its full benefit list, so nothing about the subscription
 * hangs off card two, while card two still says plainly that device GPS needs
 * Pro and a connected computer. Each product states its own platforms and its
 * own price, which is what keeps the lineup legible.
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
        <p className="mx-auto max-w-2xl text-(--color-canvas-muted)">
          {p.subhead}
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 items-stretch gap-6 md:grid-cols-2">
        {/* GeoSpoof — the extension + mobile app (top of funnel) */}
        <ProductCard
          icon={APP_ICON}
          badge={<Badge variant="secondary">{p.app.badge}</Badge>}
          title={p.app.title}
          tagline={p.app.tagline}
          description={p.app.description}
          specs={[{ label: p.availableOn, value: p.app.platforms }]}
          cta={
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
          }
        />

        {/* GeoSpoof GPS — the desktop companion (highlighted: newest, and the
            one people don't know exists) */}
        <ProductCard
          highlighted
          icon={GPS_ICON}
          badge={
            <Badge className="bg-(--color-brand) text-white">
              {p.gps.badge}
            </Badge>
          }
          title={p.gps.title}
          tagline={p.gps.tagline}
          description={p.gps.description}
          specs={[
            { label: p.availableOn, value: p.gps.platforms },
            { label: p.requires, value: p.gps.requirement },
          ]}
          cta={
            <LocaleLink
              to="/gps"
              className={cn(
                ctaClass,
                "bg-(--color-brand) text-white shadow-md",
                "hover:bg-(--color-brand-dark) hover:shadow-lg"
              )}
            >
              {p.gps.cta}
              <ArrowRight className={arrowClass} aria-hidden="true" />
            </LocaleLink>
          }
        />
      </div>

      {/* Pro — a tier of GeoSpoof, not a third product. Full-width strip so the
          revenue path stays prominent without occupying a product slot. */}
      <div
        className={cn(
          "mx-auto mt-6 max-w-4xl rounded-2xl p-6 md:p-8",
          "border border-(--color-canvas-border) bg-(--color-canvas-border)/25",
          "flex flex-col gap-5 md:flex-row md:items-center md:gap-8"
        )}
      >
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-bold text-(--color-canvas-foreground)">
              {p.pro.title}
            </h3>
            <Badge className="bg-(--color-brand) text-white">
              {p.pro.badge}
            </Badge>
          </div>
          <p className="text-sm text-(--color-canvas-muted)">
            {p.pro.description}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <LocaleLink
            to="/pro"
            className={cn(
              ctaClass,
              "bg-(--color-canvas-foreground) text-(--color-canvas)",
              "shadow-sm hover:opacity-90"
            )}
          >
            {p.pro.cta}
            <ArrowRight className={arrowClass} aria-hidden="true" />
          </LocaleLink>
          <p className="text-xs text-(--color-canvas-muted)">
            {p.pro.priceNote}
          </p>
        </div>
      </div>
    </Section>
  )
}

/**
 * One product card. The `specs` rows are the part that does the real
 * differentiating work: a lineup only reads clearly if each product states its
 * own platforms, and a *companion* product only reads honestly if it states its
 * dependency in the same breath. Rendered as a description list so the
 * label/value pairing survives a screen reader.
 */
function ProductCard({
  icon,
  badge,
  title,
  tagline,
  description,
  specs,
  cta,
  highlighted = false,
}: {
  icon: string
  badge: ReactNode
  title: string
  tagline: string
  description: string
  specs: Array<{ label: string; value: string }>
  cta: ReactNode
  highlighted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl p-8",
        highlighted
          ? "border border-(--color-brand) shadow-md ring-1 ring-brand/40"
          : "border border-(--color-canvas-border)"
      )}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <img
          src={icon}
          alt=""
          aria-hidden="true"
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className={productIconClass}
        />
        {badge}
      </div>

      <h3 className="text-xl font-bold text-(--color-canvas-foreground)">
        {title}
      </h3>
      <p className="mt-1 mb-3 text-sm font-medium text-(--color-brand)">
        {tagline}
      </p>
      <p className="mb-6 text-(--color-canvas-muted)">{description}</p>

      <dl className="mt-auto mb-6 space-y-2 border-t border-(--color-canvas-border) pt-5 text-xs">
        {specs.map((spec) => (
          <div key={spec.label} className="flex flex-wrap gap-x-1.5">
            <dt className="font-semibold text-(--color-canvas-foreground)">
              {spec.label}:
            </dt>
            <dd className="flex-1 text-(--color-canvas-muted)">{spec.value}</dd>
          </div>
        ))}
      </dl>

      {cta}
    </div>
  )
}
