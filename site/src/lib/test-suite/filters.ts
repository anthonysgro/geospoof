/**
 * Pure filter logic for the test suite UI.
 *
 * Kept separate from the React components so the behavior can be unit-tested
 * without a DOM and shared between the top-level summary and the per-group
 * rendering.
 */

import type { TestState } from "./types"

export interface FilterCriteria {
  /** Free-text search. Matches name, description, id, technique, group. */
  query: string
  /** When true, only `fail` and `error` results survive the filter. */
  failuresOnly: boolean
}

export const EMPTY_FILTER: FilterCriteria = {
  query: "",
  failuresOnly: false,
}

/**
 * Returns true when the filter is a no-op and the entire input list will
 * pass through unchanged. Callers can use this to skip unnecessary copies.
 */
export function isFilterEmpty(filter: FilterCriteria): boolean {
  return filter.query.trim().length === 0 && !filter.failuresOnly
}

/**
 * Match a single test state against the filter. Exported so the filter
 * logic can be used in contexts other than full-list filtering (e.g.
 * per-group counts).
 */
export function matchesFilter(
  state: TestState,
  filter: FilterCriteria
): boolean {
  if (filter.failuresOnly) {
    const s = state.result.status
    if (s !== "fail" && s !== "error") return false
  }

  const query = filter.query.trim().toLowerCase()
  if (query.length === 0) return true

  const def = state.definition
  const haystack = [
    def.id,
    def.name,
    def.description,
    def.technique,
    def.group,
  ]
    .join(" \u0000 ")
    .toLowerCase()

  return haystack.includes(query)
}

export function applyFilter(
  states: ReadonlyArray<TestState>,
  filter: FilterCriteria
): ReadonlyArray<TestState> {
  if (isFilterEmpty(filter)) return states
  return states.filter((s) => matchesFilter(s, filter))
}
