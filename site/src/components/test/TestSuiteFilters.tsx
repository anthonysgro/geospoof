import { Filter, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { FilterCriteria } from "@/lib/test-suite/filters"
import { EMPTY_FILTER } from "@/lib/test-suite/filters"

/**
 * Controls for narrowing the rendered test list.
 *
 * - Search filter matches against test name, description, id, technique,
 *   and group id so users can find tests by any visible label.
 * - Failures-only toggle hides passing / known-limitation / pending tests
 *   so the remaining failures and errors are easy to inspect.
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

export function TestSuiteFilters({
  filters,
  onChange,
  matchedCount,
  totalCount,
}: TestSuiteFiltersProps) {
  const setQuery = (query: string): void => onChange({ ...filters, query })
  const toggleFailuresOnly = (): void =>
    onChange({ ...filters, failuresOnly: !filters.failuresOnly })

  const isFiltering = filters.query.length > 0 || filters.failuresOnly

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
          ) : null}
        </InputGroup>

        <Button
          type="button"
          variant={filters.failuresOnly ? "default" : "outline"}
          aria-pressed={filters.failuresOnly}
          onClick={toggleFailuresOnly}
          className="sm:w-auto"
        >
          <Filter aria-hidden="true" />
          {filters.failuresOnly ? "Showing failures" : "Failures only"}
        </Button>
      </div>

      {isFiltering ? (
        <p className="text-xs text-(--color-canvas-muted)">
          Showing {matchedCount} of {totalCount} tests.
        </p>
      ) : null}
    </div>
  )
}
