import * as React from "react"

import { CategoryBlock } from "./CategoryBlock"
import { KNOWN_LIMITATIONS_ANCHOR_ID } from "./VerificationSummary"
import type { FilterCriteria } from "@/lib/test-suite/filters"
import type { TestState } from "@/lib/test-suite/types"
import type { UserCategory } from "@/lib/verification/categories"
import {
  DEFAULT_FILTER_STATE,
  TestSuiteFilters,
} from "@/components/test/TestSuiteFilters"
import { applyFilter, isFilterEmpty } from "@/lib/test-suite/filters"
import {
  USER_CATEGORIES,
  categoryForGroup,
} from "@/lib/verification/categories"

/**
 * The three headline categories rendered in the fixed order specified by
 * Req 8.1 and Req 8.3.
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

interface DetectableIssuesSectionProps {
  states: ReadonlyArray<TestState>
}

/**
 * The lower section of the Verification Dashboard.
 *
 * Layout:
 *   - `TestSuiteFilters` at the top with a compact copy of the user's
 *     current filter state.
 *   - `CategoryBlock` for each headline user-facing category in the
 *     fixed order Values → Consistency → Tampering.
 *   - A collapsible "Known limitations" block at the bottom.
 *
 * The section used to wrap every CategoryBlock in its own shadowed
 * card. With ~110 tests that produced three concentric boxes per test
 * (section card → group section → test card) and made the page feel
 * heavy. The category blocks are now flat headers + group lists; the
 * only bordered surface is the test row itself.
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
    <section aria-label="Detectable issues" className="space-y-8">
      <TestSuiteFilters
        filters={filters}
        onChange={setFilters}
        matchedCount={filteredStates.length}
        totalCount={states.length}
      />

      <div className="space-y-10">
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

        <CategoryBlock
          meta={KNOWN_LIMITATIONS_META}
          states={knownLimitationStates}
          headingId={CATEGORY_HEADING_IDS["known-limitations"]}
        />
      </div>
    </section>
  )
}
