import * as React from "react"
import {
  AlertTriangle,
  ChevronDown,
  CircleDashed,
  CircleMinus,
  CircleX,
  Loader2,
  XCircle,
} from "lucide-react"

import type { TestState, TestStatus } from "@/lib/test-suite/types"
import { cn } from "@/lib/utils"

interface TestCardProps {
  state: TestState
  /**
   * Forces the card to render expanded, regardless of local toggle state.
   * Used by the category auto-expand logic so failing tests open by
   * default when their category is rendered in "show failures" mode.
   */
  defaultOpen?: boolean
}

/**
 * A single test displayed as an expandable row.
 *
 * Collapsed view (single line): status icon + name + duration.
 * Expanded view: description, technique, code snippet, expected, actual,
 * error, details.
 *
 * The description was previously duplicated between the collapsed and
 * expanded views, which inflated every card vertically. Moving it into
 * the expanded view only — next to the rest of the technique/code
 * context — keeps the collapsed list scannable while still exposing the
 * explanation when someone drills in.
 */
export function TestCard({ state, defaultOpen = false }: TestCardProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const { definition, result } = state

  // If the parent re-mounts us with a different `defaultOpen` (e.g. after
  // the run completes and the category decides to collapse all-passing
  // groups) respect the new default on first render but let the user's
  // local toggle take over afterwards.
  React.useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  const hasDetails = result.details && Object.keys(result.details).length > 0

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        "border-(--color-canvas-border) bg-(--color-canvas)",
        // Soft tint so failing rows pop out of a long green list without
        // shouting.
        ROW_TONE[result.status]
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left",
          "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        <StatusIcon status={result.status} />
        <span className="min-w-0 flex-1 text-sm text-(--color-canvas-foreground)">
          {definition.name}
        </span>
        {typeof result.durationMs === "number" && result.status !== "pending" ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-(--color-canvas-muted)">
            {formatDuration(result.durationMs)}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-(--color-canvas-muted) transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-(--color-canvas-border) px-4 py-4 text-sm">
          <p className="text-sm text-(--color-canvas-muted)">
            {definition.description}
          </p>

          <DetailGrid>
            <DetailCell label="Expected" value={result.expected || "—"} />
            <DetailCell label="Actual" value={result.actual || "—"} />
          </DetailGrid>

          <DetailRow label="Technique" value={definition.technique} />

          {definition.codeSnippet ? (
            <details className="group">
              <summary className="mb-1 flex cursor-pointer items-center gap-1 text-xs font-medium text-(--color-canvas-muted) select-none">
                <ChevronDown
                  aria-hidden="true"
                  className="size-3 transition-transform group-open:rotate-180"
                />
                <span>Show code</span>
              </summary>
              <pre className="overflow-x-auto rounded-md bg-canvas-border/50 p-3 font-mono text-xs leading-relaxed text-(--color-canvas-foreground)">
                {definition.codeSnippet}
              </pre>
            </details>
          ) : null}

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

          <p className="text-[11px] text-(--color-canvas-muted)">
            <span className="font-mono">{definition.id}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Two-column detail grid at md+, stacks below. */
function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-medium tracking-wide text-(--color-canvas-muted) uppercase">
        {label}
      </div>
      <div className="rounded-md border border-(--color-canvas-border) bg-canvas-border/30 px-2 py-1.5 font-mono text-xs break-all text-(--color-canvas-foreground)">
        {value}
      </div>
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
      <div className="mb-1 text-[11px] font-medium tracking-wide text-(--color-canvas-muted) uppercase">
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

/** Per-row tint for each status. Keeps the collapsed list scannable. */
const ROW_TONE: Record<TestStatus, string> = {
  pass: "",
  fail: "border-destructive/30 bg-destructive/5",
  error: "border-destructive/30 bg-destructive/5",
  "known-limitation": "border-amber-500/30 bg-amber-500/5",
  skipped: "border-sky-500/20 bg-sky-500/5",
  pending: "",
}

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case "pass":
      return (
        <CheckMark
          className="size-4 shrink-0 text-(--color-brand)"
          aria-label="Pass"
        />
      )
    case "fail":
      return (
        <XCircle
          className="size-4 shrink-0 text-destructive"
          aria-label="Fail"
        />
      )
    case "error":
      return (
        <CircleX
          className="size-4 shrink-0 text-destructive"
          aria-label="Error"
        />
      )
    case "known-limitation":
      return (
        <AlertTriangle
          className="size-4 shrink-0 text-amber-500 dark:text-amber-400"
          aria-label="Known limitation"
        />
      )
    case "skipped":
      return (
        <CircleMinus
          className="size-4 shrink-0 text-sky-500 dark:text-sky-400"
          aria-label="Skipped"
        />
      )
    case "pending":
      return (
        <Loader2
          className="size-4 shrink-0 animate-spin text-(--color-canvas-muted)"
          aria-label="Running"
        />
      )
    default: {
      const _exhaustive: never = status
      void _exhaustive
      return (
        <CircleDashed
          className="size-4 shrink-0 text-(--color-canvas-muted)"
          aria-label="Unknown"
        />
      )
    }
  }
}

/**
 * Use the same filled-circle glyph as `StatusPill`'s pass tone so the
 * two surfaces stay visually consistent. Named separately to avoid
 * importing `CheckCircle2` twice in the same file with conflicting
 * names.
 */
function CheckMark({
  className,
  "aria-label": ariaLabel,
}: {
  className?: string
  "aria-label"?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-label={ariaLabel}
      role="img"
    >
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.1 14.3-4.2-4.2 1.4-1.4 2.8 2.8 6.1-6.1 1.4 1.4-7.5 7.5Z"
      />
    </svg>
  )
}

/** Brief-but-readable duration rendering for the collapsed row. */
function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
