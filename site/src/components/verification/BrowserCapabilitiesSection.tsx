import { ChevronDown } from "lucide-react"

import type { FeatureAvailability } from "@/lib/verification/identity-snapshot"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIdentity } from "@/lib/verification/identity-context"
import { cn } from "@/lib/utils"

interface FeatureRow {
  key: keyof FeatureAvailability
  label: string
}

interface FeatureGroup {
  title: string
  rows: ReadonlyArray<FeatureRow>
}

/**
 * Feature rows grouped by API family, preserving the enumeration
 * required by Req 6.1.
 */
const FEATURE_GROUPS: ReadonlyArray<FeatureGroup> = [
  {
    title: "Navigator",
    rows: [
      { key: "geolocation", label: "navigator.geolocation" },
      { key: "permissions", label: "navigator.permissions" },
      { key: "userAgentData", label: "navigator.userAgentData" },
    ],
  },
  {
    title: "Intl",
    rows: [
      { key: "intlDateTimeFormat", label: "Intl.DateTimeFormat" },
      {
        key: "intlFormatToParts",
        label: "Intl.DateTimeFormat.prototype.formatToParts",
      },
    ],
  },
  {
    title: "Temporal",
    rows: [
      { key: "temporal", label: "Temporal" },
      { key: "temporalTimeZoneId", label: "Temporal.Now.timeZoneId" },
    ],
  },
]

/**
 * Compact Browser Capabilities trigger for the Identity Panel sidebar.
 *
 * Renders a single "APIs available N/M" row as a Popover trigger.
 * Clicking opens a floating panel with the full grouped list — so
 * expanding it doesn't reflow the rest of the sidebar below.
 *
 * Lives at the bottom of the Identity sidebar as environment
 * metadata closely related to Platform. Missing capabilities never
 * contribute to the detectable-issue count (Req 6.3, 6.4) — rows
 * render neutral availability only, never fail.
 */
export function BrowserCapabilitiesSection() {
  const { snapshot } = useIdentity()
  const { features } = snapshot

  const totalRows = FEATURE_GROUPS.reduce(
    (sum, group) => sum + group.rows.length,
    0
  )
  const availableRows = FEATURE_GROUPS.reduce(
    (sum, group) => sum + group.rows.filter((row) => features[row.key]).length,
    0
  )
  const allAvailable = availableRows === totalRows

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "group/caps flex w-full items-center gap-2 rounded-md py-1 text-left text-sm outline-none",
          "focus-visible:ring-2 focus-visible:ring-(--color-brand)",
          "hover:text-(--color-canvas-foreground)"
        )}
      >
        <span className="text-sm font-medium text-(--color-canvas-foreground)">
          APIs available
        </span>
        <span
          className={cn(
            "ml-auto text-xs font-medium",
            allAvailable
              ? "text-(--color-brand)"
              : "text-(--color-canvas-muted)"
          )}
        >
          {availableRows}/{totalRows}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--color-canvas-muted) transition-transform group-aria-expanded/caps:rotate-180"
        />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 max-w-[90vw]">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-(--color-canvas-foreground)">
              APIs available
            </p>
            <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
              Which surfaces the current runtime exposes. Missing APIs explain
              why some tests are skipped.
            </p>
          </div>

          {FEATURE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-(--color-canvas-muted) uppercase">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.rows.map((row) => {
                  const available = features[row.key]
                  return (
                    <li
                      key={row.key}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          available
                            ? "bg-(--color-brand)"
                            : "bg-canvas-muted/40"
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 font-mono break-all",
                          available
                            ? "text-(--color-canvas-foreground)"
                            : "text-(--color-canvas-muted) line-through decoration-canvas-muted/40"
                        )}
                      >
                        {row.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
