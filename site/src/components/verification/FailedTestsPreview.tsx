import { AlertTriangle, ArrowDown } from "lucide-react"

import { Button } from "@/components/ui/button"

interface FailedTestsPreviewProps {
  failureCount: number
  totalCount: number
  isRunning: boolean
  /**
   * Called when the user clicks the callout's primary action. The
   * parent is responsible for (a) setting the Detectable Issues
   * filter to "only fail + error" and (b) scrolling the details tier
   * into view.
   */
  onShowOnlyFailures: () => void
}

/**
 * Compact failure callout rendered inside the Verdict tier.
 *
 * When the run settles with at least one `fail` or `error`, this
 * summarises "N failing" and offers a single action: filter the
 * Detectable Issues section to just the failures and scroll to it.
 *
 * No per-test list here — that's the job of the main Detectable
 * Issues section. This block's purpose is to save a scroll and
 * direct users to the right filter, not to duplicate the test
 * details.
 *
 * Renders nothing while a run is in progress and nothing when there
 * are no failures.
 */
export function FailedTestsPreview({
  failureCount,
  totalCount,
  isRunning,
  onShowOnlyFailures,
}: FailedTestsPreviewProps) {
  if (isRunning || failureCount === 0) return null

  return (
    <section
      aria-label={`${failureCount} failing ${failureCount === 1 ? "test" : "tests"}`}
      className="mx-auto flex w-full max-w-4xl flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-(--color-canvas-foreground)">
            {failureCount} failing {failureCount === 1 ? "test" : "tests"} out
            of {totalCount}
          </p>
          <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
            Filter the Detectable Issues section below to see only the failures.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onShowOnlyFailures}
        className="shrink-0"
      >
        Show only failures
        <ArrowDown aria-hidden="true" className="size-3.5" />
      </Button>
    </section>
  )
}
