/**
 * Core types for the GeoSpoof test suite.
 *
 * The suite runs client-side to detect GeoSpoof's presence and behavior.
 * Each test returns a TestResult describing what was expected, what was
 * observed, and whether it passed.
 */

import type { IdentitySnapshot } from "../verification/identity-snapshot"

/**
 * Status of an individual test.
 *
 * - `pass`: The observation matched the expectation.
 * - `fail`: The observation diverged from the expectation.
 * - `known-limitation`: The test intentionally demonstrates a documented
 *   architectural limitation of content-script-based extensions — e.g.,
 *   Web Worker timezone leaks or the MV3
 *   initialization race. These represent unfixable vectors at the
 *   extension layer; surfaced as educational rather than regressive.
 * - `skipped`: A prerequisite wasn't met so the test couldn't run —
 *   e.g., user denied geolocation permission, Temporal API unavailable,
 *   DOMParser missing. Distinct from `known-limitation` because nothing
 *   was measured; we can't say whether a leak exists.
 * - `pending`: The test has not yet completed.
 * - `error`: The test threw an unexpected exception.
 */
export type TestStatus =
  | "pass"
  | "fail"
  | "known-limitation"
  | "skipped"
  | "pending"
  | "error"

/**
 * Logical grouping of related tests.
 */
export type TestGroupId =
  | "geolocation-correctness"
  | "geolocation-stealth"
  | "timezone-correctness"
  | "timezone-stealth"
  | "internal-consistency"
  | "extension-presence"
  | "known-limitations"

/**
 * The outcome of executing a single test.
 */
export interface TestResult {
  status: TestStatus
  /** What the test expected to see (human-readable). */
  expected: string
  /** What the test actually observed (human-readable). */
  actual: string
  /** Optional structured detail object for the expandable section. */
  details?: Record<string, unknown>
  /** Populated when the test threw. */
  error?: string
  /** Millisecond duration of the test run. */
  durationMs?: number
}

/**
 * Runtime context passed to each test's `run` method.
 *
 * The context is optional so existing zero-arity `run` functions continue
 * to compile and execute without modification. Behavioral tests that need
 * to read from the shared identity snapshot accept the context and read
 * their expected values from `getIdentity()` / `awaitIdentity(...)` rather
 * than independently calling the underlying browser API — this is the
 * "single source of truth" requirement from the Verification Dashboard
 * spec.
 */
export interface TestRunContext {
  /**
   * Returns the current identity snapshot synchronously. Safe to call at
   * any point during `run`; the identity provider guarantees the snapshot
   * object reference is stable for the duration of a single run.
   */
  getIdentity: () => IdentitySnapshot
  /**
   * Waits for a specific asynchronously-resolved identity field to
   * transition out of `pending`. Resolves with the current `AsyncField<T>`
   * once it is `ready` or `error`, or after `timeoutMs` elapses — whichever
   * comes first.
   */
  awaitIdentity: <TField extends "location" | "platform">(
    field: TField,
    timeoutMs: number
  ) => Promise<IdentitySnapshot[TField]>
  /**
   * Abort signal tied to the current run. Aborted when "Run again" is hit
   * mid-run so tests can short-circuit long-running work.
   */
  signal: AbortSignal
}

/**
 * A test definition. Tests are plain objects with an async `run` that returns
 * a TestResult. They must not throw — any failure should be encoded in the
 * returned result (the runner will catch and convert unexpected throws to
 * `status: "error"` as a safety net).
 */
export interface TestDefinition {
  /** Stable, unique identifier. */
  id: string
  /** Logical group this test belongs to. */
  group: TestGroupId
  /** Short human-readable name shown in the collapsed card. */
  name: string
  /** One-sentence explanation of what the test does. */
  description: string
  /**
   * Detection technique / method being exercised.
   * Shown in the expanded view.
   */
  technique: string
  /**
   * Optional snippet of the detection code used (shown in expanded view).
   * Use as documentation — does not need to match the `run` body exactly.
   */
  codeSnippet?: string
  /**
   * Executes the test. Should not throw; encode failures in TestResult.
   *
   * The context argument is optional so existing tests that don't need
   * identity continue to compile untouched; the runner always passes a
   * context when one is configured, and JavaScript's loose arity simply
   * ignores it in legacy test definitions.
   */
  run: (ctx?: TestRunContext) => Promise<TestResult>
}

/**
 * Per-test live state used by the UI while the suite runs.
 */
export interface TestState {
  definition: TestDefinition
  result: TestResult
}

/**
 * Aggregated summary across all tests.
 */
export interface TestSummary {
  total: number
  passed: number
  failed: number
  knownLimitation: number
  skipped: number
  errored: number
  pending: number
}

/**
 * Human-readable metadata for each group.
 */
export interface TestGroupMeta {
  id: TestGroupId
  title: string
  description: string
}

export const TEST_GROUPS: ReadonlyArray<TestGroupMeta> = [
  {
    id: "geolocation-correctness",
    title: "Geolocation spoofing",
    description:
      "Verifies that the browser geolocation API returns the location configured in GeoSpoof.",
  },
  {
    id: "geolocation-stealth",
    title: "Geolocation stealth",
    description:
      "Checks whether the geolocation overrides are distinguishable from native browser APIs.",
  },
  {
    id: "timezone-correctness",
    title: "Timezone spoofing",
    description:
      "Verifies that Date and Intl APIs report the spoofed timezone when timezone spoofing is enabled.",
  },
  {
    id: "timezone-stealth",
    title: "Timezone stealth",
    description:
      "Checks whether the timezone and date overrides are distinguishable from native browser APIs.",
  },
  {
    id: "internal-consistency",
    title: "Internal consistency",
    description:
      "Checks that independent browser APIs agree with each other when describing the same moment or value.",
  },
  {
    id: "extension-presence",
    title: "Extension presence",
    description:
      "Checks whether a page can detect the extension via its modifications to the browser environment.",
  },
  {
    id: "known-limitations",
    title: "Known limitations",
    description:
      "Detection vectors that content-script extensions cannot fully mitigate. Educational — these are expected to fail.",
  },
] as const
