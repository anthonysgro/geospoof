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
 * entry in `CategoryMeta.subGroups` — reusing the existing
 * `TestGroup`/`TestCard`/`StatusBadge` components unchanged so the
 * ~327 preserved stealth/presence tests keep their current card layout
 * (Req 8.7, Req 12.3).
 *
 * When no test in this category survives the current filter, the block
 * still renders its header plus the category's `emptyMessage` rather
 * than hiding the category entirely (Req 8.4).
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
    <section
      aria-labelledby={headingId}
      className="space-y-6 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 shadow-sm md:p-6"
    >
      <header className="space-y-1">
        <h2
          id={headingId}
          className="text-xl font-semibold text-(--color-canvas-foreground)"
        >
          {meta.title}
        </h2>
        <p className="text-sm text-(--color-canvas-muted)">{meta.headline}</p>
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-(--color-canvas-border) p-4 text-sm text-(--color-canvas-muted)">
          {meta.emptyMessage}
        </p>
      ) : (
        <div className="space-y-8">
          {meta.subGroups.map((groupId) => {
            const groupMeta = GROUP_META_BY_ID.get(groupId)
            const groupStates = statesByGroup.get(groupId) ?? []
            // `TestGroup` returns null for empty groups on its own; we
            // skip them here too so the spacing between sub-groups stays
            // tight when a filter hides everything in one sub-group.
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
