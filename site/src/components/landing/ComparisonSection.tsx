import {
  BadgeCheck,
  CheckIcon,
  Fingerprint,
  Footprints,
  Globe,
  LocateFixed,
  MapPin,
  MinusIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
} from "lucide-react"
import { Section } from "./Section"
import type { Dictionary } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Three columns: a typical single-purpose location spoofer, GeoSpoof free, and
 * GeoSpoof Pro. No competitor is named, and every "typical" cell reflects the
 * common case (coordinate-only spoofers), not a claim about any one product.
 *
 * **Why three and not two.** The two-column version answered "why GeoSpoof
 * instead of that other extension?" and left the paid tier to be discovered on
 * /pro. That understated both halves: it never showed device GPS — the most
 * differentiated thing we ship — and it never showed how much of the product is
 * free, so a visitor had no way to tell whether the good rows cost money.
 *
 * Read left to right the table now makes one argument in two steps: a typical
 * spoofer does one of these eleven things, GeoSpoof free does eight of them, Pro
 * does all eleven. The free column carrying eight ticks before the first dash is
 * the load-bearing part — it's the business plan's rule that the free-vs-paid
 * line reads as power and convenience, never as "we crippled your privacy
 * unless you pay."
 */
type Cell =
  | "yes"
  | "no"
  /**
   * Free in the browser extensions and Safari, Pro on iPhone/iPad. Rendered as
   * a small "Desktop" label rather than a tick, because a bare tick in the Free
   * column would be wrong for iOS and a bare dash would be wrong for everyone
   * on a desktop browser. Only `vpnSync` and `perSite` are in this state, and
   * both are verified against the gates: `autoSyncBlocked` (see
   * `src/background/resync-core.ts`) and `proFeaturesBlocked` (see
   * `src/shared/utils/scope.ts`) are set by the iOS app alone — Chrome, Firefox
   * and macOS are unaffected.
   */
  | "desktop"

type FeatureKey = keyof Dictionary["comparison"]["features"]

/**
 * Row order is the argument. What everyone does comes first, so a reader sees
 * us concede row one before the columns start to diverge; conceding it is what
 * makes rows two through eleven credible. The three Pro-only rows land last, so
 * the Free column thins out at the bottom rather than looking gap-toothed
 * throughout.
 *
 * Each row carries its own tinted glyph — a single accent down the column is
 * tidy and forgettable, and a spread makes this read as eleven distinct
 * capabilities rather than eleven similar-looking sentences. Same palette as
 * the Free-vs-Pro table on /pro, so the two read as one family.
 */
const rows: Array<{
  key: FeatureKey
  Icon: typeof Globe
  tint: string
  typical: Cell
  free: Cell
  /** Device-GPS rows get the heavier label — they're what Pro is really for. */
  gps?: boolean
}> = [
  {
    key: "coordinates",
    Icon: MapPin,
    tint: "text-cyan-500",
    typical: "yes",
    free: "yes",
  },
  {
    key: "oneIdentity",
    Icon: Fingerprint,
    tint: "text-indigo-500",
    typical: "no",
    free: "yes",
  },
  {
    key: "citySearch",
    Icon: Search,
    tint: "text-amber-500",
    typical: "no",
    free: "yes",
  },
  {
    key: "webrtc",
    Icon: ShieldCheck,
    tint: "text-violet-500",
    typical: "no",
    free: "yes",
  },
  {
    key: "everyBrowser",
    Icon: Globe,
    tint: "text-blue-500",
    typical: "no",
    free: "yes",
  },
  {
    key: "verification",
    Icon: BadgeCheck,
    tint: "text-teal-500",
    typical: "no",
    free: "yes",
  },
  {
    key: "vpnSync",
    Icon: RefreshCw,
    tint: "text-emerald-500",
    typical: "no",
    free: "desktop",
  },
  {
    key: "perSite",
    Icon: SlidersHorizontal,
    tint: "text-orange-500",
    typical: "no",
    free: "desktop",
  },
  {
    key: "deviceGps",
    Icon: LocateFixed,
    tint: "text-(--color-brand)",
    typical: "no",
    free: "no",
    gps: true,
  },
  {
    key: "routes",
    Icon: Footprints,
    tint: "text-pink-500",
    typical: "no",
    free: "no",
    gps: true,
  },
  {
    key: "offlineHold",
    Icon: Unplug,
    tint: "text-orange-500",
    typical: "no",
    free: "no",
    gps: true,
  },
]

/** Whether any row is platform-split — drives the legend's Desktop entry. */
const hasDesktopOnly = rows.some((r) => r.free === "desktop")

function NoCell() {
  const { t } = useTranslations()
  return (
    <MinusIcon
      className="mx-auto size-4 text-(--color-canvas-muted) opacity-50"
      aria-label={t.comparison.noAria}
    />
  )
}

/**
 * The "typical" column: a quiet grey tick where they match us, a dash where
 * they don't. Deliberately never green.
 *
 * An earlier version rendered the same brand-green chip here as in our own
 * column, which meant row one — where a typical spoofer genuinely does match
 * us — put two identical green marks side by side and the table stopped making
 * a visual argument at the very top.
 */
function TypicalCell({ state }: { state: Cell }) {
  const { t } = useTranslations()
  if (state === "yes")
    return (
      <CheckIcon
        className="mx-auto size-4 text-(--color-canvas-foreground)/55"
        strokeWidth={3}
        aria-label={t.comparison.yesAria}
      />
    )
  return <NoCell />
}

/**
 * The Free column: a green tick (ours, but unweighted), a dash, or the
 * platform-split "Desktop" label.
 */
function FreeCell({ state }: { state: Cell }) {
  const { t } = useTranslations()
  if (state === "yes")
    return (
      <CheckIcon
        className="mx-auto size-4 text-(--color-brand)"
        strokeWidth={3}
        aria-label={t.comparison.yesAria}
      />
    )
  if (state === "desktop") return <DesktopLabel />
  return <NoCell />
}

function DesktopLabel() {
  const { t } = useTranslations()
  return (
    <span
      className="text-[0.6875rem] font-medium text-(--color-canvas-muted)"
      // The full qualifier, not just the word: a screen reader hearing
      // "Desktop" alone would have no way to know what it excludes.
      aria-label={t.comparison.proNote}
    >
      <span aria-hidden="true">{t.comparison.desktopOnly}</span>
    </span>
  )
}

/**
 * The Pro column: a filled brand-green disc on every row, because Pro includes
 * everything. Needs no state — the unbroken green run beside a Free column that
 * thins out is the whole visual argument, and it's the same mark the in-app
 * comparison uses so the two surfaces look like one product.
 */
function ProCell() {
  const { t } = useTranslations()
  return (
    <span
      className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)"
      aria-label={t.comparison.yesAria}
    >
      <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </span>
  )
}

export function ComparisonSection({ className }: { className?: string }) {
  const { t } = useTranslations()
  return (
    <Section
      id="comparison"
      className={cn("py-16! md:py-24!", className)}
      aria-labelledby="comparison-heading"
    >
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          {t.comparison.eyebrow}
        </p>
        <h2
          id="comparison-heading"
          className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl"
        >
          {t.comparison.heading}
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          {t.comparison.subhead}
        </p>
      </div>

      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="border-b border-(--color-canvas-border) hover:bg-transparent">
                <TableHead className="pl-4 text-xs font-semibold whitespace-normal text-(--color-canvas-muted) sm:pl-6 sm:text-sm">
                  {t.comparison.featureHeader}
                </TableHead>
                {/* Typical recedes; the two GeoSpoof columns are brand-coloured,
                    with Pro — the column being sold — carrying the weight. */}
                <TableHead className="w-14 px-1 text-center text-xs font-semibold whitespace-normal text-(--color-canvas-muted) sm:w-24 sm:px-2 sm:text-sm">
                  {t.comparison.typicalHeader}
                </TableHead>
                <TableHead className="w-14 px-1 text-center text-xs font-semibold whitespace-normal text-(--color-brand) sm:w-24 sm:px-2 sm:text-sm">
                  {t.comparison.freeHeader}
                </TableHead>
                <TableHead className="w-14 px-1 text-center text-xs font-bold whitespace-normal text-(--color-brand) sm:w-24 sm:px-2 sm:text-sm">
                  {t.comparison.proHeader}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.key}
                  className="border-b border-(--color-canvas-border) hover:bg-canvas-border/30"
                >
                  <TableCell className="py-3 pl-4 text-sm whitespace-normal text-(--color-canvas-foreground) sm:py-3.5 sm:pl-6 sm:text-base">
                    <span className="flex items-start gap-2.5">
                      <row.Icon
                        className={cn("mt-0.5 size-4 shrink-0", row.tint)}
                        aria-hidden="true"
                      />
                      <span className={row.gps ? "font-semibold" : ""}>
                        {t.comparison.features[row.key]}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-3.5">
                    <TypicalCell state={row.typical} />
                  </TableCell>
                  <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-3.5">
                    <FreeCell state={row.free} />
                  </TableCell>
                  <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-3.5">
                    <ProCell />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend. Only the marks the table actually renders get a line. */}
        <div className="border-t border-(--color-canvas-border) bg-canvas-border/20 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
              <CheckIcon
                className="size-3.5 text-(--color-brand)"
                strokeWidth={3}
                aria-hidden="true"
              />
              {t.comparison.legend.includedFree}
            </span>
            <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
              {/* The same chip the Pro column renders, at legend scale. */}
              <span
                className="inline-flex size-4 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)"
                aria-hidden="true"
              >
                <CheckIcon className="size-2.5" strokeWidth={3} />
              </span>
              {t.comparison.legend.proOnly}
            </span>
            <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
              <MinusIcon className="size-3.5 opacity-50" aria-hidden="true" />
              {t.comparison.legend.notSupported}
            </span>
          </div>

          {/* The platform split gets its own line rather than a fourth entry in
              the row above: it's a sentence, not a mark, and inlining it pushed
              the three marks off the edge on a narrow viewport. */}
          {hasDesktopOnly && (
            <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-(--color-canvas-muted)">
              <span className="font-medium text-(--color-canvas-foreground)">
                {t.comparison.desktopOnly}
              </span>
              {t.comparison.proNote}
            </p>
          )}
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-(--color-canvas-muted)">
        {t.comparison.ctaLead}
        <LocaleLink
          to="/verify"
          className="font-medium text-(--color-brand) hover:underline"
        >
          {t.comparison.ctaLink}
        </LocaleLink>
        {t.comparison.ctaTail}
      </p>
    </Section>
  )
}
