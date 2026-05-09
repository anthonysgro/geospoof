/**
 * Mapping from internal `TestGroupId` values to the four user-facing
 * Test_Categories rendered by the Verification Dashboard.
 *
 * The dashboard organises detectable issues around user concerns rather
 * than test-file layout: "Values correctness" (does what the browser
 * reports match what GeoSpoof was configured to present?), "Internal
 * consistency" (do independent browser APIs agree with each other?),
 * "Tampering signals" (can a page tell that any override was installed?),
 * and "Known limitations" (documented gaps that content-script extensions
 * cannot fully close).
 *
 * This module is a pure data + pure-function layer — no browser-global
 * access at import time so it stays safe to load under SSR.
 */

import type { TestGroupId } from "../test-suite/types"

/**
 * The four user-facing categories rendered in the Detectable Issues
 * section, in the fixed display order.
 */
export type UserCategory =
  | "values-correctness"
  | "internal-consistency"
  | "tampering-signals"
  | "known-limitations"

/**
 * Human-readable metadata for a single `UserCategory` plus the ordered
 * list of internal `TestGroupId` values that belong to it. The `subGroups`
 * array drives the sub-headings shown within each category block.
 */
export interface CategoryMeta {
  id: UserCategory
  title: string
  headline: string
  emptyMessage: string
  /** Order of internal sub-groups within this category (for sub-headings). */
  subGroups: ReadonlyArray<TestGroupId>
}

/**
 * The four user-facing categories in fixed display order:
 * values-correctness → internal-consistency → tampering-signals → known-limitations.
 */
export const USER_CATEGORIES: ReadonlyArray<CategoryMeta> = [
  {
    id: "values-correctness",
    title: "Values correctness",
    headline:
      "Does what the browser reports match what GeoSpoof was configured to present?",
    emptyMessage: "No issues detected in this category.",
    subGroups: ["geolocation-correctness", "timezone-correctness"],
  },
  {
    id: "internal-consistency",
    title: "Internal consistency",
    headline: "Do independent browser APIs agree with each other?",
    emptyMessage: "No issues detected in this category.",
    subGroups: ["internal-consistency"],
  },
  {
    id: "tampering-signals",
    title: "Tampering signals",
    headline: "Can a page tell that any override was installed?",
    emptyMessage: "No issues detected in this category.",
    subGroups: [
      "geolocation-stealth",
      "timezone-stealth",
      "extension-presence",
    ],
  },
  {
    id: "known-limitations",
    title: "Known limitations",
    headline:
      "Documented gaps that content-script extensions cannot fully close.",
    emptyMessage: "No known limitations reported.",
    subGroups: ["known-limitations"],
  },
]

/**
 * Pure mapping from an internal `TestGroupId` to its user-facing
 * `UserCategory`. Implemented as an exhaustive switch so TypeScript
 * enforces coverage across every `TestGroupId` member.
 */
export function categoryForGroup(group: TestGroupId): UserCategory {
  // Exhaustive switch — TypeScript enforces coverage.
  switch (group) {
    case "geolocation-correctness":
    case "timezone-correctness":
      return "values-correctness"
    case "internal-consistency":
      return "internal-consistency"
    case "geolocation-stealth":
    case "timezone-stealth":
    case "extension-presence":
      return "tampering-signals"
    case "known-limitations":
      return "known-limitations"
  }
}
