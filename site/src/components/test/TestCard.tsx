import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./StatusBadge"
import type { TestState } from "@/lib/test-suite/types"

interface TestCardProps {
  state: TestState
}

/**
 * A single test displayed as an expandable card.
 *
 * Collapsed view: name, one-line description, status badge.
 * Expanded view: technique, code snippet, expected, actual, error, details.
 */
export function TestCard({ state }: TestCardProps) {
  const [open, setOpen] = React.useState(false)
  const { definition, result } = state

  const hasDetails = result.details && Object.keys(result.details).length > 0

  return (
    <div className="rounded-lg border border-(--color-canvas-border) bg-(--color-canvas) transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) rounded-lg"
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-(--color-canvas-muted) transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-(--color-canvas-foreground)">
              {definition.name}
            </span>
          </div>
          <p className="truncate text-xs text-(--color-canvas-muted)">
            {definition.description}
          </p>
        </div>
        <StatusBadge status={result.status} />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-(--color-canvas-border) px-4 py-4 text-sm">
          <DetailRow label="Technique" value={definition.technique} />

          {definition.codeSnippet ? (
            <div>
              <div className="mb-1 text-xs font-medium text-(--color-canvas-muted)">
                Code
              </div>
              <pre className="overflow-x-auto rounded-md bg-canvas-border/50 p-3 font-mono text-xs leading-relaxed text-(--color-canvas-foreground)">
                {definition.codeSnippet}
              </pre>
            </div>
          ) : null}

          <DetailRow label="Expected" value={result.expected || "—"} />
          <DetailRow label="Actual" value={result.actual || "—"} />

          {result.error ? (
            <DetailRow label="Error" value={result.error} mono />
          ) : null}

          {hasDetails ? (
            <div>
              <div className="mb-1 text-xs font-medium text-(--color-canvas-muted)">
                Details
              </div>
              <pre className="overflow-x-auto rounded-md bg-canvas-border/50 p-3 font-mono text-xs leading-relaxed text-(--color-canvas-foreground)">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </div>
          ) : null}

          {typeof result.durationMs === "number" ? (
            <p className="text-xs text-(--color-canvas-muted)">
              Completed in {result.durationMs.toFixed(0)}ms
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-(--color-canvas-muted)">
        {label}
      </div>
      <div
        className={cn(
          "text-sm text-(--color-canvas-foreground)",
          mono && "font-mono text-xs break-all"
        )}
      >
        {value}
      </div>
    </div>
  )
}
