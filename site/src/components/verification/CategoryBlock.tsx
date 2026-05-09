import * as React from "react"
import type {
  TestGroupId,
  TestGroupMeta,
  TestState,
} from "@/lib/test-suite/types"
import type { CategoryMeta } from "@/lib/verification/categories"
import { TestGroup } from "@/components/test/TestGroup"
import { TEST_GROUPS } from "@/lib/test-suite/types"

/**
 * Index of `TestGroupMeta` by id for O(1) lookup when mapping
 * `CategoryMeta.subGroups` to the metadata the existing `TestGroup`
 * component expects.
 */
const GROUP_META_BY_ID: ReadonlyMap<TestGroupId, TestGroupMeta> = new Map(
  TEST_GROUPS.map((m) => [m.id, m])
)

interface CategoryBlockProps {
  meta: CategoryMeta
  /** Filtered test states that belong to this category. */
  states: ReadonlyArray<TestState>
  /**
   * Optional heading element id so the parent can anchor-link to this
   * category (used for the "Known limitations" secondary link in the
   * Verification Summary).
   */
  headingId?: string
}

/**
 * One user-facing Test_Category block.
 *
 * Renders the category title and headline, then one `TestGroup` per
 * entry in `CategoryMeta.subGroups`. The previous implementation
 * wrapped each category in a bordered card; that stacked three
 * concentric boxes (category card → group section → per-test card)
 * and made the page feel cluttered. This version lets the individual
 * test rows carry the border, so the category is a flat header +
 * group list.
 */
export function CategoryBlock({ meta, states, headingId }: CategoryBlockProps) {
  const statesByGroup = React.useMemo(() => {
    const map = new Map<TestGroupId, Array<TestState>>()
    for (const g of meta.subGroups) map.set(g, [])
    for (const state of states) {
      const bucket = map.get(state.definition.group)
      if (bucket) bucket.push(state)
    }
    return map
  }, [meta, states])

  const isEmpty = states.length === 0

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <header className="space-y-1">
        <h3
          id={headingId}
          className="text-lg font-semibold text-(--color-canvas-foreground)"
        >
          {meta.title}
        </h3>
        <p className="text-sm text-(--color-canvas-muted)">{meta.headline}</p>
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-(--color-canvas-border) p-4 text-sm text-(--color-canvas-muted)">
          {meta.emptyMessage}
        </p>
      ) : (
        <div className="space-y-5">
          {meta.subGroups.map((groupId) => {
            const groupMeta = GROUP_META_BY_ID.get(groupId)
            const groupStates = statesByGroup.get(groupId) ?? []
            if (!groupMeta || groupStates.length === 0) return null
            return (
              <TestGroup key={groupId} meta={groupMeta} states={groupStates} />
            )
          })}
        </div>
      )}
    </section>
  )
}
