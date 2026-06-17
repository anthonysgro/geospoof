import { CheckIcon, MinusIcon } from "lucide-react"
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

const browsers = ["Firefox", "Chrome", "Brave", "Edge", "Safari"]

const platforms: Array<{
  name: string
  support: Array<"full" | "none" | "na">
}> = [
  { name: "macOS", support: ["full", "full", "full", "full", "full"] },
  { name: "Windows", support: ["full", "full", "full", "full", "na"] },
  { name: "Linux", support: ["full", "full", "full", "full", "na"] },
  { name: "Android", support: ["full", "none", "none", "none", "na"] },
  { name: "iOS", support: ["na", "na", "na", "na", "full"] },
]

function SupportBadge({ status }: { status: "full" | "none" | "na" }) {
  if (status === "full")
    return (
      <span
        className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-(--color-brand)"
        aria-label="Supported"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (status === "na")
    return (
      <span
        className="text-xs text-(--color-canvas-muted) opacity-40"
        aria-label="Not applicable"
      >
        N/A
      </span>
    )
  return (
    <MinusIcon
      className="mx-auto size-4 text-(--color-canvas-muted) opacity-50"
      aria-label="Not supported"
    />
  )
}

export function CompatibilitySection({ className }: { className?: string }) {
  return (
    <Section id="compatibility" className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Compatibility
        </p>
        <h2 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          Works across all your devices
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          GeoSpoof runs on every major browser and platform. One extension,
          consistent protection everywhere.
        </p>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-(--color-canvas-border)">
        <div className="overflow-x-auto">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow className="border-b border-(--color-canvas-border) hover:bg-transparent">
                <TableHead className="w-32 pl-6 font-semibold text-(--color-canvas-muted)">
                  Platform
                </TableHead>
                {browsers.map((b) => (
                  <TableHead
                    key={b}
                    className="text-center font-semibold text-(--color-canvas-foreground)"
                  >
                    {b}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {platforms.map((platform) => (
                <TableRow
                  key={platform.name}
                  className="border-b border-(--color-canvas-border) hover:bg-canvas-border/30"
                >
                  <TableCell className="pl-6 font-medium text-(--color-canvas-foreground)">
                    {platform.name}
                  </TableCell>
                  {platform.support.map((status, i) => (
                    <TableCell
                      key={browsers[i]}
                      className="py-4 text-center text-base"
                    >
                      <SupportBadge status={status} />
                    </TableCell>
                  ))}
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
            Supported
          </span>
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <MinusIcon className="size-3.5 opacity-50" aria-hidden="true" /> Not
            supported
          </span>
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted) opacity-60">
            N/A — Not applicable
          </span>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-(--color-canvas-muted)">
        Firefox for Android requires Firefox 140+. Safari requires iOS 16+ or
        macOS 13+.
      </p>
    </Section>
  )
}
