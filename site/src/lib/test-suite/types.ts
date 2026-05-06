/**
 * Core types for the GeoSpoof test suite.
 *
 * The suite runs client-side to detect GeoSpoof's presence and behavior.
 * Each test returns a TestResult describing what was expected, what was
 * observed, and whether it passed.
 */

/**
 * Status of an individual test.
 *
 * - `pass`: The observation matched the expectation.
 * - `fail`: The observation diverged from the expectation.
 * - `known-limitation`: The test intentionally demonstrates a documented
 *   limitation of content-script-based extensions (e.g., Web Worker
 *   timezone leaks). Educational, not a regression.
 * - `pending`: The test has not yet completed.
 * - `error`: The test threw an unexpected exception.
 */
export type TestStatus = "pass" | "fail" | "known-limitation" | "pending" | "error"

/**
 * Logical grouping of related tests.
 */
export type TestGroupId =
  | "geolocation-correctness"
  | "geolocation-stealth"
  | "timezone-correctness"
  | "timezone-stealth"
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
   */
  run: () => Promise<TestResult>
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
