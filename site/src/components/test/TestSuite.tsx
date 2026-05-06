import * as React from "react"
import { Button } from "@/components/ui/button"
import { applyFilter, isFilterEmpty } from "@/lib/test-suite/filters"
import type { FilterCriteria } from "@/lib/test-suite/filters"
import { initialStates, runSuite, summarize } from "@/lib/test-suite/runner"
import { loadAllTests } from "@/lib/test-suite/tests"
import { TEST_GROUPS } from "@/lib/test-suite/types"
import type { TestDefinition, TestState, TestSummary } from "@/lib/test-suite/types"
import { TestGroup } from "./TestGroup"
import {
  DEFAULT_FILTER_STATE,
  TestSuiteFilters,
} from "./TestSuiteFilters"

/**
 * Top-level test suite container.
 *
 * Test definitions capture browser globals at construction time, so they
 * can't load on the server. We lazy-import the manifest on mount and
 * render a lightweight placeholder until it's ready.
 */
export function TestSuite() {
  const [tests, setTests] = React.useState<ReadonlyArray<TestDefinition> | null>(
    null
  )
  const [states, setStates] = React.useState<TestState[]>([])
  const [isRunning, setIsRunning] = React.useState(false)
  const [filters, setFilters] = React.useState<FilterCriteria>(
    DEFAULT_FILTER_STATE
  )

  const startRun = React.useCallback(
    (definitions: ReadonlyArray<TestDefinition>) => {
      setIsRunning(true)
      setStates(initialStates(definitions))
      void runSuite(definitions, {
        onProgress: (next) => setStates([...next]),
      }).finally(() => setIsRunning(false))
    },
    []
  )

  // Load the manifest and auto-run on first mount (client only).
  React.useEffect(() => {
    let cancelled = false
    void loadAllTests().then((definitions) => {
      if (cancelled) return
      setTests(definitions)
      startRun(definitions)
    })
    return () => {
      cancelled = true
    }
  }, [startRun])

  if (!tests) {
    return (
      <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-sm text-(--color-canvas-muted)">
        Loading tests…
      </div>
    )
  }

  const overallSummary = summarize(states)
  const filteredStates = applyFilter(states, filters)
  const filterActive = !isFilterEmpty(filters)

  return (
    <div className="space-y-6">
      <SuiteHeader
        summary={overallSummary}
        isRunning={isRunning}
        onRun={() => startRun(tests)}
      />

      <TestSuiteFilters
        filters={filters}
        onChange={setFilters}
        matchedCount={filteredStates.length}
        totalCount={states.length}
      />

      <div className="space-y-10">
        {TEST_GROUPS.map((meta) => {
          const groupStates = filteredStates.filter(
            (s) => s.definition.group === meta.id
          )
          // When the filter is active and a group has no matches, hide the
          // whole section — TestGroup itself already hides empty groups,
          // but this keeps the spacing tight.
          if (filterActive && groupStates.length === 0) return null
          return <TestGroup key={meta.id} meta={meta} states={groupStates} />
        })}

        {filterActive && filteredStates.length === 0 ? (
          <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-center text-sm text-(--color-canvas-muted)">
            No tests match the current filter.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SuiteHeader({
  summary,
  isRunning,
  onRun,
}: {
  summary: TestSummary
  isRunning: boolean
  onRun: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="text-sm font-medium text-(--color-canvas-foreground)">
          {isRunning
            ? `Running… ${summary.total - summary.pending}/${summary.total}`
            : `${summary.passed}/${summary.total} passed`}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-canvas-muted)">
          <SummaryStat label="Failed" value={summary.failed} />
          <SummaryStat label="Known limitations" value={summary.knownLimitation} />
          <SummaryStat label="Errors" value={summary.errored} />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onRun}
        disabled={isRunning}
      >
        {isRunning ? "Running…" : "Run again"}
      </Button>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label}: <span className="font-medium">{value}</span>
    </span>
  )
}
