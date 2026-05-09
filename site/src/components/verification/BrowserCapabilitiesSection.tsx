import * as React from "react"
import { ChevronDown } from "lucide-react"

import type { FeatureAvailability } from "@/lib/verification/identity-snapshot"
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
 * Browser_Capabilities_Section.
 *
 * Explains which browser APIs are present in the current runtime. This
 * is the sibling question to the Identity Panel: the panel shows what
 * the browser reports, and this section shows what the browser actually
 * supports. It's rendered between the Identity Panel and the
 * Verification Summary so skipped tests ("Temporal unavailable") can be
 * explained by a single scroll upward rather than a dig into a footer.
 *
 * Styled as a flat collapsible header — no border, no card — matching
 * the design language the rest of the dashboard moved to.
 *
 * Missing capabilities never contribute to the detectable-issue count
 * (Req 6.3, 6.4) — rows render neutral availability only, never fail.
 */
export function BrowserCapabilitiesSection() {
  const { snapshot } = useIdentity()
  const { features } = snapshot
  const [open, setOpen] = React.useState(false)

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
    <section aria-label="Browser capabilities" className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
          "hover:bg-(--color-canvas-border)/30"
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-(--color-canvas-muted) transition-transform",
            open && "rotate-180"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="text-sm font-semibold text-(--color-canvas-foreground)">
              Browser capabilities
            </h2>
            <span
              className={cn(
                "text-xs font-medium",
                allAvailable
                  ? "text-(--color-brand)"
                  : "text-(--color-canvas-muted)"
              )}
            >
              {availableRows}/{totalRows} available
            </span>
          </div>
          <p className="text-xs text-(--color-canvas-muted)">
            Which APIs the current runtime exposes. Missing APIs explain why
            some tests are skipped.
          </p>
        </div>
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 pl-6 md:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium tracking-wide text-(--color-canvas-muted) uppercase">
                {group.title}
              </div>
              <ul className="space-y-1.5">
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
      ) : null}
    </section>
  )
}
