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
  if (status === "full") return <span className="text-(--color-brand)">✓</span>
  if (status === "na")
    return (
      <span className="text-xs text-(--color-canvas-muted) opacity-40">
        N/A
      </span>
    )
  return <span className="text-(--color-canvas-muted)">—</span>
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
        <Table>
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
                className="border-b border-(--color-canvas-border) hover:bg-(--color-canvas-border)/30"
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

        {/* Legend */}
        <div className="flex items-center gap-6 border-t border-(--color-canvas-border) bg-(--color-canvas-border)/20 px-6 py-4">
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <span className="font-bold text-(--color-brand)">✓</span> Supported
          </span>
          <span className="flex items-center gap-2 text-xs text-(--color-canvas-muted)">
            <span className="font-bold">—</span> Not supported
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
