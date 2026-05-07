import { ChevronDown } from "lucide-react"

import { StatusPill } from "./StatusPill"
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
 * Diagnostic footer that explains which browser APIs are present in the
 * current runtime. It is intentionally rendered BELOW the Detectable
 * Issues section and collapsed by default (Req 6.2) so it cannot
 * compete with the Identity Panel or the verification verdict for the
 * visitor's attention.
 *
 * Missing capabilities never contribute to the detectable-issue count
 * (Req 6.3, 6.4) — the rows use tones `pass` and `muted` only, never
 * `fail`.
 *
 * Header copy includes the count of available capabilities so a visitor
 * can tell at a glance whether anything unusual is going on without
 * needing to expand the block.
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

  return (
    <details className="group rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 shadow-sm md:p-6">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3",
          "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-(--color-canvas-foreground)">
            Browser capabilities
          </h2>
          <p className="text-sm text-(--color-canvas-muted)">
            {availableRows}/{totalRows} APIs available — affects which tests can
            run.
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 text-(--color-canvas-muted) transition-transform",
            "group-open:rotate-180"
          )}
        />
      </summary>

      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-2 text-xs font-medium tracking-wide text-(--color-canvas-muted) uppercase">
              {group.title}
            </div>
            <ul className="space-y-1.5">
              {group.rows.map((row) => {
                const available = features[row.key]
                return (
                  <li key={row.key} className="flex items-center gap-2.5">
                    <StatusPill
                      tone={available ? "pass" : "muted"}
                      className="w-28 shrink-0 justify-start"
                    >
                      {available ? "Available" : "Unavailable"}
                    </StatusPill>
                    <span className="min-w-0 flex-1 font-mono text-xs break-all text-(--color-canvas-foreground)">
                      {row.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
