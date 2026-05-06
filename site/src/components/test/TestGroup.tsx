import type { TestGroupMeta, TestState } from "@/lib/test-suite/types"
import { summarize } from "@/lib/test-suite/runner"
import { TestCard } from "./TestCard"

interface TestGroupProps {
  meta: TestGroupMeta
  states: ReadonlyArray<TestState>
}

export function TestGroup({ meta, states }: TestGroupProps) {
  if (states.length === 0) return null

  const summary = summarize(states)
  const hasFailures = summary.failed > 0 || summary.errored > 0

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-(--color-canvas-foreground)">
            {meta.title}
          </h2>
          <GroupSummary summary={summary} hasFailures={hasFailures} />
        </div>
        <p className="text-sm text-(--color-canvas-muted)">
          {meta.description}
        </p>
      </header>
      <div className="space-y-2">
        {states.map((state) => (
          <TestCard key={state.definition.id} state={state} />
        ))}
      </div>
    </section>
  )
}

function GroupSummary({
  summary,
  hasFailures,
}: {
  summary: ReturnType<typeof summarize>
  hasFailures: boolean
}) {
  // Show passed / total so "32/32" means every test passed.
  // Known-limitation counts as "acceptable" here — it didn't pass, but it
  // also isn't a regression. Errors and fails are what subtract from
  // the numerator.
  const acceptable = summary.passed + summary.knownLimitation
  const label = `${acceptable}/${summary.total}`

  return (
    <span
      className={
        hasFailures
          ? "text-xs font-medium text-destructive"
          : "text-xs font-medium text-(--color-canvas-muted)"
      }
    >
      {label}
    </span>
  )
}
