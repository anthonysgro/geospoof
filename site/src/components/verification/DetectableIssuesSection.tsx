import * as React from "react"
import { ChevronDown } from "lucide-react"

import { CategoryBlock } from "./CategoryBlock"
import { KNOWN_LIMITATIONS_ANCHOR_ID } from "./VerificationSummary"
import type { FilterCriteria } from "@/lib/test-suite/filters"
import type { TestState } from "@/lib/test-suite/types"
import type { UserCategory } from "@/lib/verification/categories"
import {
  DEFAULT_FILTER_STATE,
  TestSuiteFilters,
} from "@/components/test/TestSuiteFilters"
import { TestGroup } from "@/components/test/TestGroup"
import { applyFilter, isFilterEmpty } from "@/lib/test-suite/filters"
import { TEST_GROUPS } from "@/lib/test-suite/types"
import {
  USER_CATEGORIES,
  categoryForGroup,
} from "@/lib/verification/categories"
import { cn } from "@/lib/utils"

/**
 * The three headline categories rendered in the fixed order specified by
 * Req 8.1 and Req 8.3. Known limitations is rendered separately below
 * as a collapsible block (Req 8.2) so it stays out of the main headline
 * flow.
 */
const HEADLINE_CATEGORIES = USER_CATEGORIES.filter(
  (c) => c.id !== "known-limitations"
)
const KNOWN_LIMITATIONS_META = USER_CATEGORIES.find(
  (c) => c.id === "known-limitations"
)!

/** Stable DOM ids per category so the layout is keyboard-navigable. */
const CATEGORY_HEADING_IDS: Record<UserCategory, string> = {
  "values-correctness": "category-values-correctness",
  "internal-consistency": "category-internal-consistency",
  "tampering-signals": "category-tampering-signals",
  "known-limitations": KNOWN_LIMITATIONS_ANCHOR_ID,
}

const TEST_GROUPS_BY_ID = new Map(TEST_GROUPS.map((m) => [m.id, m]))

interface DetectableIssuesSectionProps {
  states: ReadonlyArray<TestState>
}

/**
 * The lower section of the Verification Dashboard.
 *
 * Layout:
 *   - `TestSuiteFilters` (reused unchanged — Req 8.5, Req 18.4).
 *   - `CategoryBlock` for each headline user-facing category in the
 *     fixed order Values → Consistency → Tampering (Req 8.1, Req 8.3).
 *   - A collapsible "Known limitations" block at the bottom with an
 *     anchor id that the Verification Summary links to (Req 8.2).
 *
 * Filter semantics:
 *   - `failuresOnly` hides both `pass` and `known-limitation` states —
 *     this is already the behaviour of `matchesFilter` in
 *     `filters.ts`, so when it is active the known-limitations block
 *     naturally empties out (Req 8.6).
 *   - The search query matches against name / description / id /
 *     technique / group.
 *
 * All test cards are rendered via the existing
 * `TestGroup`/`TestCard`/`StatusBadge` components — the 327+ preserved
 * tests keep their current expand/collapse behaviour verbatim
 * (Req 8.7, Req 12.3).
 */
export function DetectableIssuesSection({
  states,
}: DetectableIssuesSectionProps) {
  const [filters, setFilters] =
    React.useState<FilterCriteria>(DEFAULT_FILTER_STATE)

  const filteredStates = React.useMemo(
    () => applyFilter(states, filters),
    [states, filters]
  )

  // Bucket the filtered states by user-facing category so each
  // CategoryBlock only receives its own slice.
  const statesByCategory = React.useMemo(() => {
    const map = new Map<UserCategory, Array<TestState>>()
    for (const c of USER_CATEGORIES) map.set(c.id, [])
    for (const state of filteredStates) {
      const category = categoryForGroup(state.definition.group)
      map.get(category)!.push(state)
    }
    return map
  }, [filteredStates])

  const knownLimitationStates = statesByCategory.get("known-limitations") ?? []

  const filterActive = !isFilterEmpty(filters)
  const everyHeadlineEmpty = HEADLINE_CATEGORIES.every(
    (c) => (statesByCategory.get(c.id) ?? []).length === 0
  )

  return (
    <section aria-label="Detectable issues" className="space-y-6">
      <TestSuiteFilters
        filters={filters}
        onChange={setFilters}
        matchedCount={filteredStates.length}
        totalCount={states.length}
      />

      <div className="space-y-6">
        {HEADLINE_CATEGORIES.map((meta) => (
          <CategoryBlock
            key={meta.id}
            meta={meta}
            states={statesByCategory.get(meta.id) ?? []}
            headingId={CATEGORY_HEADING_IDS[meta.id]}
          />
        ))}

        {filterActive &&
        everyHeadlineEmpty &&
        knownLimitationStates.length === 0 ? (
          <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-center text-sm text-(--color-canvas-muted)">
            No tests match the current filter.
          </div>
        ) : null}
      </div>

      <KnownLimitationsBlock
        states={knownLimitationStates}
        filterActive={filterActive}
      />
    </section>
  )
}

interface KnownLimitationsBlockProps {
  states: ReadonlyArray<TestState>
  filterActive: boolean
}

/**
 * Collapsible "Known limitations" block rendered below the three
 * headline categories (Req 8.2).
 *
 * Uses native `<details>`/`<summary>` so keyboard navigation and
 * screen-reader support are automatic. The anchor id matches
 * `KNOWN_LIMITATIONS_ANCHOR_ID` so the secondary link in the
 * Verification Summary can scroll here (Req 7.4).
 *
 * When the failures-only filter hides every known-limitation state, the
 * block is still rendered — with its `emptyMessage` as the content — so
 * the user can tell the filter is hiding things rather than the dashboard
 * having lost them.
 */
function KnownLimitationsBlock({
  states,
  filterActive,
}: KnownLimitationsBlockProps) {
  const groupMeta = TEST_GROUPS_BY_ID.get("known-limitations")
  const isEmpty = states.length === 0

  return (
    <details
      id={KNOWN_LIMITATIONS_ANCHOR_ID}
      className="group rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 shadow-sm md:p-6"
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3",
          "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-(--color-canvas-foreground)">
            {KNOWN_LIMITATIONS_META.title}
          </h2>
          <p className="text-sm text-(--color-canvas-muted)">
            {KNOWN_LIMITATIONS_META.headline}
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

      <div className="mt-6 space-y-4">
        {isEmpty ? (
          <p className="rounded-md border border-dashed border-(--color-canvas-border) p-4 text-sm text-(--color-canvas-muted)">
            {filterActive
              ? "No known limitations match the current filter."
              : KNOWN_LIMITATIONS_META.emptyMessage}
          </p>
        ) : groupMeta ? (
          <TestGroup meta={groupMeta} states={states} />
        ) : null}
      </div>
    </details>
  )
}
