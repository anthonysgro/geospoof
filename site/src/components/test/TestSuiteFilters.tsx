import { Filter, Search, X } from "lucide-react"
import type { FilterCriteria } from "@/lib/test-suite/filters"
import type { TestStatus } from "@/lib/test-suite/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { EMPTY_FILTER } from "@/lib/test-suite/filters"

/**
 * Controls for narrowing the rendered test list.
 *
 * - Search input matches against test name, description, id, technique,
 *   and group id so users can find tests by any visible label.
 * - Status-visibility dropdown lets users hide any combination of the
 *   five outcome statuses (pass / fail / skipped / known-limitation /
 *   error). Hiding `pass` + `known-limitation` is a common pattern for
 *   "just show me the stuff that went wrong"; hiding `pass` alone
 *   surfaces everything interesting including skipped tests and
 *   documented gaps. The `pending` status is deliberately not offered
 *   — tests transition out of it quickly and users don't benefit from
 *   hiding in-flight work.
 */
export const DEFAULT_FILTER_STATE: FilterCriteria = EMPTY_FILTER

interface TestSuiteFiltersProps {
  filters: FilterCriteria
  onChange: (next: FilterCriteria) => void
  /** Count of tests that currently match the filter, for the status line. */
  matchedCount: number
  /** Total number of tests, regardless of filter. */
  totalCount: number
}

/**
 * Status rows in the visibility dropdown. The order mirrors how users
 * mentally rank outcomes: most relevant first (fail, error, skipped,
 * known-limitation, pass at the bottom). `pending` is omitted — see
 * the file-level doc comment.
 */
const STATUS_FILTER_ROWS: ReadonlyArray<{
  status: Exclude<TestStatus, "pending">
  label: string
}> = [
  { status: "fail", label: "Fail" },
  { status: "error", label: "Error" },
  { status: "skipped", label: "Skipped" },
  { status: "known-limitation", label: "Known limitation" },
  { status: "pass", label: "Pass" },
]

export function TestSuiteFilters({
  filters,
  onChange,
  matchedCount,
  totalCount,
}: TestSuiteFiltersProps) {
  const setQuery = (query: string): void => onChange({ ...filters, query })

  const setStatusVisible = (status: TestStatus, visible: boolean): void => {
    const next = new Set(filters.hiddenStatuses)
    if (visible) {
      next.delete(status)
    } else {
      next.add(status)
    }
    onChange({ ...filters, hiddenStatuses: next })
  }

  const hiddenCount = filters.hiddenStatuses.size
  const isFiltering = filters.query.length > 0 || hiddenCount > 0

  // Trigger label: communicate state at a glance.
  const triggerLabel =
    hiddenCount === 0
      ? "All statuses"
      : `Showing ${STATUS_FILTER_ROWS.length - hiddenCount} of ${STATUS_FILTER_ROWS.length}`

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:flex-1">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search tests by name, id, or technique…"
            aria-label="Search tests"
            value={filters.query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filters.query ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : (
            <InputGroupAddon align="inline-end">
              <kbd
                className="pointer-events-none hidden rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block"
                aria-label="Keyboard shortcut: Command or Control plus K"
                title="Open command palette"
              >
                ⌘K
              </kbd>
            </InputGroupAddon>
          )}
        </InputGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={hiddenCount > 0 ? "default" : "outline"}
              className="sm:w-auto"
            >
              <Filter aria-hidden="true" />
              {triggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Show statuses</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_FILTER_ROWS.map(({ status, label }) => {
              const visible = !filters.hiddenStatuses.has(status)
              return (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={visible}
                  onCheckedChange={(next) => setStatusVisible(status, next)}
                  onSelect={(e) => {
                    // Keep the menu open when toggling individual rows
                    // so users can tick multiple without reopening.
                    e.preventDefault()
                  }}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isFiltering ? (
        <p className="text-xs text-(--color-canvas-muted)">
          Showing {matchedCount} of {totalCount} tests.
        </p>
      ) : null}
    </div>
  )
}
