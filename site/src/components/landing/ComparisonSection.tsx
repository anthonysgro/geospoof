import { CheckIcon, MinusIcon, SparklesIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Section } from "./Section"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Honest, generic comparison: GeoSpoof vs. a typical single-purpose location
// spoofer. No competitor is named, and every "typical" cell reflects the
// common case (coordinate-only spoofers), not a claim about any one product.
type Cell = "yes" | "partial" | "no"

const rows: Array<{
  feature: string
  geospoof: Cell
  typical: Cell
  /** Pro on iOS/iPadOS — free on desktop browsers and Safari. */
  iosPro?: boolean
}> = [
  {
    feature: "Spoof geolocation by coordinates",
    geospoof: "yes",
    typical: "yes",
  },
  {
    feature: "One consistent identity across dozens of browser APIs",
    geospoof: "yes",
    typical: "no",
  },
  {
    feature: "Set your location by city search",
    geospoof: "yes",
    typical: "no",
  },
  { feature: "WebRTC IP leak protection", geospoof: "yes", typical: "no" },
  {
    feature: "Every major browser + full Apple ecosystem",
    geospoof: "yes",
    typical: "no",
  },
  { feature: "Built-in verification page", geospoof: "yes", typical: "no" },
  {
    feature: "VPN Sync with automatic re-sync",
    geospoof: "yes",
    typical: "no",
    iosPro: true,
  },
  {
    feature: "Per-site rules & saved favorites",
    geospoof: "yes",
    typical: "no",
    iosPro: true,
  },
]

function StatusCell({ state }: { state: Cell }) {
  if (state === "yes")
    return (
      <span
        className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)"
        aria-label="Yes"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (state === "partial")
    return (
      <span
        className="text-xs font-medium text-(--color-canvas-muted)"
        aria-label="Limited"
      >
        Limited
      </span>
    )
  return (
    <MinusIcon
      className="mx-auto size-4 text-(--color-canvas-muted) opacity-50"
      aria-label="No"
    />
  )
}

export function ComparisonSection({ className }: { className?: string }) {
  return (
    <Section className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          How GeoSpoof compares
        </p>
        <h2 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          More than a coordinate swap
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          Most location spoofers do one thing: drop a fake latitude and
          longitude into the browser. GeoSpoof covers the whole signal, so your
          location, timezone, and IP all tell the same story.
        </p>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="border-b border-(--color-canvas-border) hover:bg-transparent">
                <TableHead className="pl-4 text-xs font-semibold whitespace-normal text-(--color-canvas-muted) sm:pl-6 sm:text-sm">
                  Feature
                </TableHead>
                <TableHead className="w-16 px-1 text-center text-xs font-semibold whitespace-normal text-(--color-brand) sm:w-28 sm:px-2 sm:text-sm">
                  GeoSpoof
                </TableHead>
                <TableHead className="w-16 px-1 text-center text-xs font-semibold whitespace-normal text-(--color-canvas-foreground) sm:w-28 sm:px-2 sm:text-sm">
                  Typical
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.feature}
                  className="border-b border-(--color-canvas-border) hover:bg-canvas-border/30"
                >
                  <TableCell className="py-3 pl-4 text-sm font-medium whitespace-normal text-(--color-canvas-foreground) sm:py-4 sm:pl-6 sm:text-base">
                    <span className="flex items-start gap-1.5">
                      <span>{row.feature}</span>
                      {row.iosPro && (
                        <SparklesIcon
                          className="mt-0.5 size-3.5 shrink-0 text-(--color-brand)"
                          aria-label="Pro on iPhone and iPad"
                        />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-4">
                    <StatusCell state={row.geospoof} />
                  </TableCell>
                  <TableCell className="px-1 py-3 text-center sm:px-2 sm:py-4">
                    <StatusCell state={row.typical} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-(--color-canvas-border) bg-canvas-border/20 px-6 py-4">
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <CheckIcon
              className="size-3.5 text-(--color-brand)"
              strokeWidth={3}
              aria-hidden="true"
            />{" "}
            Full support
          </span>
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <span className="font-medium">Limited</span>: partial or basic
          </span>
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <MinusIcon className="size-3.5 opacity-50" aria-hidden="true" /> Not
            supported
          </span>
        </div>
      </div>

      <p className="mx-auto mt-4 flex max-w-2xl items-center justify-center gap-1.5 text-center text-xs text-(--color-canvas-muted)">
        <SparklesIcon
          className="size-3.5 shrink-0 text-(--color-brand)"
          aria-hidden="true"
        />
        Pro on iPhone &amp; iPad. Free on desktop browsers and Safari.
      </p>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-(--color-canvas-muted)">
        Don&rsquo;t take our word for it:{" "}
        <Link
          to="/verify"
          className="font-medium text-(--color-brand) hover:underline"
        >
          test your protection
        </Link>{" "}
        and see every signal for yourself.
      </p>
    </Section>
  )
}
