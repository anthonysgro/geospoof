import * as React from "react"
import { ChevronDown } from "lucide-react"

import { TestCard } from "./TestCard"
import type { TestGroupMeta, TestState } from "@/lib/test-suite/types"
import { summarize } from "@/lib/test-suite/runner"
import { cn } from "@/lib/utils"

interface TestGroupProps {
  meta: TestGroupMeta
  states: ReadonlyArray<TestState>
}

/**
 * A group of related tests (e.g. "Geolocation stealth", "Timezone
 * spoofing"). Rendered as a collapsible section.
 *
 * Default-open behaviour:
 *   - If any test in the group has status `fail` or `error` the group
 *     opens by default so the user sees the failure without a click.
 *   - Groups that are entirely passing or mixed with only pass +
 *     known-limitation + skipped stay collapsed to keep the page
 *     scannable. The header summary tells the user the group's state.
 *
 * The group header renders a compact summary line with per-status
 * counts so a user can read the outcome without expanding.
 */
export function TestGroup({ meta, states }: TestGroupProps) {
  const summary = React.useMemo(() => summarize(states), [states])
  const hasFailures = summary.failed > 0 || summary.errored > 0

  // Failures open by default; everything else starts collapsed. The
  // `key` on a passed `defaultOpen` prop in TestCard guarantees
  // user-toggled state is preserved as the underlying result updates.
  const [open, setOpen] = React.useState<boolean>(hasFailures)

  // If a new failure appears after the group has been rendered
  // (progressive run: a test completes with status=fail), re-open
  // automatically.
  const prevFailuresRef = React.useRef(hasFailures)
  React.useEffect(() => {
    if (hasFailures && !prevFailuresRef.current) {
      setOpen(true)
    }
    prevFailuresRef.current = hasFailures
  }, [hasFailures])

  // Open this group when a child test is targeted via URL hash
  // (e.g. from the command palette). Matches `#test-<id>` against
  // every test in this group.
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const check = (): void => {
      const hash = window.location.hash
      if (!hash.startsWith("#test-")) return
      const targetId = hash.slice("#test-".length)
      if (states.some((s) => s.definition.id === targetId)) {
        setOpen(true)
      }
    }
    check()
    window.addEventListener("hashchange", check)
    return () => window.removeEventListener("hashchange", check)
  }, [states])

  if (states.length === 0) return null

  return (
    <section className="space-y-2">
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <h3 className="text-sm font-semibold text-(--color-canvas-foreground)">
              {meta.title}
            </h3>
            <GroupSummaryChips summary={summary} />
          </div>
          <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
            {meta.description}
          </p>
        </div>
      </button>

      {open ? (
        <div className="space-y-1.5 pl-6">
          {states.map((state) => (
            <TestCard
              key={state.definition.id}
              state={state}
              defaultOpen={
                state.result.status === "fail" ||
                state.result.status === "error"
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * Compact summary line: `42/42` when all acceptable, or per-status
 * chips when there's a mix. Kept on a single row next to the title so
 * the group header stays short.
 */
function GroupSummaryChips({
  summary,
}: {
  summary: ReturnType<typeof summarize>
}) {
  const { passed, failed, errored, knownLimitation, skipped, total, pending } =
    summary

  // Still running — show a loader-ish label.
  if (pending > 0) {
    return (
      <span className="text-xs text-(--color-canvas-muted)">
        {total - pending}/{total} run
      </span>
    )
  }

  const allPass = failed === 0 && errored === 0
  if (allPass && knownLimitation === 0 && skipped === 0) {
    return (
      <span className="text-xs font-medium text-(--color-brand)">
        {passed}/{total} pass
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
      {failed > 0 ? (
        <CountChip tone="fail" label={`${failed} fail`} />
      ) : null}
      {errored > 0 ? (
        <CountChip tone="fail" label={`${errored} error`} />
      ) : null}
      {knownLimitation > 0 ? (
        <CountChip tone="warn" label={`${knownLimitation} known`} />
      ) : null}
      {skipped > 0 ? (
        <CountChip tone="info" label={`${skipped} skipped`} />
      ) : null}
      {passed > 0 ? (
        <CountChip tone="pass" label={`${passed} pass`} />
      ) : null}
    </span>
  )
}

function CountChip({
  tone,
  label,
}: {
  tone: "pass" | "fail" | "warn" | "info"
  label: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5",
        tone === "pass" &&
          "border-brand/30 bg-brand/10 text-(--color-brand)",
        tone === "fail" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        tone === "info" &&
          "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
      )}
    >
      {label}
    </span>
  )
}
