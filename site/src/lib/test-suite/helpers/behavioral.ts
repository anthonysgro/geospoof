/**
 * Behavioral test helper.
 *
 * The existing `buildStandardBattery` / `buildAccessorBattery` helpers
 * produce _detection_ tests — they probe the shape of an overridden
 * function (toString, name, length, descriptor, constructability...) to
 * see whether an override is distinguishable from the native API.
 *
 * Behavioral tests answer a different question: does the value that the
 * browser reports equal the value we expect it to report? The expected
 * value typically comes from the shared `IdentitySnapshot` (for Values
 * Correctness tests) or from a second, independent browser API (for
 * Internal Consistency tests). In both cases, the test compares one
 * observed value to one expected value under a caller-supplied equality
 * function.
 *
 * The generated `run` method owes the runner five well-defined outcomes:
 *
 *   - `error` when no `TestRunContext` is passed (behavioral tests
 *     require one; the runner always provides one, so this only fires in
 *     misuse cases).
 *   - `skipped` when `expected` returns `{ skipReason }` or when any
 *     callback throws `SkipTestError` — the test's prerequisites
 *     weren't met (Temporal missing, location permission denied, etc.)
 *     so no measurement is possible.
 *   - `pass` / `fail` when `equals(expected, observed)` decides the
 *     comparison.
 *   - `error` when either `expected` or `observe` throws; the runner's
 *     own safety net catches throws too, but encoding the failure in the
 *     returned `TestResult` preserves the original error message and
 *     keeps the test's duration accounting sane.
 */

import type {
  TestDefinition,
  TestGroupId,
  TestResult,
  TestRunContext,
} from "../types"

/**
 * One side of a behavioral comparison: a typed value plus a short
 * human-readable rendering used in the TestCard's Expected / Actual cells.
 */
export interface BehavioralValue<T> {
  value: T
  describe: string
}

/**
 * Signal that a behavioral test should short-circuit to `skipped`.
 * Returned from `expected` when a required capability is unavailable
 * in the current runtime (e.g. `Temporal.Now.timeZoneId`, DOMParser).
 * Distinct from `known-limitation`, which is reserved for tests that
 * document unfixable architectural gaps.
 */
export interface BehavioralSkip {
  skipReason: string
}

/**
 * Typed error that any helper called from inside `expected` or `observe`
 * can throw to short-circuit the test to `skipped` with the supplied
 * reason. Useful for shared helpers that can't return a skip union
 * type — e.g. `requireLocationSnapshot` needs to interrupt control
 * flow rather than propagate `{ ok, skipReason }` through every
 * callsite.
 *
 * The `buildBehavioralTest` wrapper detects this error by name +
 * `skipReason` field (not `instanceof` alone, since cross-realm
 * instances from iframes would fail instanceof) and converts it to
 * `status: "skipped"`. Any other thrown error becomes `status: "error"`
 * as usual.
 */
export class SkipTestError extends Error {
  readonly skipReason: string
  constructor(skipReason: string) {
    super(skipReason)
    this.name = "SkipTestError"
    this.skipReason = skipReason
  }
}

function isSkipError(err: unknown): err is SkipTestError {
  return (
    err instanceof SkipTestError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: unknown }).name === "SkipTestError" &&
      typeof (err as { skipReason?: unknown }).skipReason === "string")
  )
}

export type BehavioralExpectedResult<T> = BehavioralValue<T> | BehavioralSkip

function isSkip<T>(
  result: BehavioralExpectedResult<T>
): result is BehavioralSkip {
  return "skipReason" in result
}

export interface BehavioralTestOptions<T> {
  /** Stable, unique identifier. */
  id: string
  /** Logical group this test belongs to. */
  group: TestGroupId
  /** Short human-readable name shown in the collapsed card. */
  name: string
  /** One-sentence explanation of what the test does. */
  description: string
  /** Detection / observation technique (shown in the expanded view). */
  technique: string
  /** Optional snippet of code that exemplifies the observation. */
  codeSnippet?: string
  /**
   * Produces the expected value. Called with the `TestRunContext` so the
   * expected value can be drawn from the shared identity snapshot —
   * guaranteeing the test and the Identity Panel read from the same
   * source of truth.
   *
   * Return `{ skipReason }` to short-circuit to `known-limitation` when
   * a required capability is not available.
   */
  expected: (ctx: TestRunContext) => Promise<BehavioralExpectedResult<T>>
  /**
   * Produces the observed value from the browser. Receives the same
   * context so it can wait on async identity fields when needed.
   */
  observe: (ctx: TestRunContext) => Promise<BehavioralValue<T>>
  /**
   * Equality used to compare expected vs. observed. Defaults to
   * `Object.is`, which handles NaN and ±0 correctly for primitive values.
   * Override for structural comparisons (objects, tuples, within-tolerance
   * numeric checks, etc.).
   */
  equals?: (expected: T, observed: T) => boolean
}

/**
 * Build a behavioral `TestDefinition`.
 *
 * The returned definition's `run` method is well-behaved: it never
 * throws. Any unexpected exception from `expected` or `observe` is
 * converted into a `status: "error"` TestResult that preserves the
 * original error message.
 */
export function buildBehavioralTest<T>(
  options: BehavioralTestOptions<T>
): TestDefinition {
  const equals = options.equals ?? Object.is

  return {
    id: options.id,
    group: options.group,
    name: options.name,
    description: options.description,
    technique: options.technique,
    codeSnippet: options.codeSnippet,
    run: async (ctx): Promise<TestResult> => {
      if (!ctx) {
        return {
          status: "error",
          expected: "TestRunContext",
          actual: "undefined",
          error: "Behavioral tests require a TestRunContext.",
        }
      }

      let expectedResult: BehavioralExpectedResult<T>
      try {
        expectedResult = await options.expected(ctx)
      } catch (err) {
        if (isSkipError(err)) {
          return {
            status: "skipped",
            expected: "(skipped)",
            actual: err.skipReason,
          }
        }
        const message = err instanceof Error ? err.message : String(err)
        return {
          status: "error",
          expected: "expected() to resolve",
          actual: `expected() threw: ${message}`,
          error: message,
        }
      }

      if (isSkip(expectedResult)) {
        return {
          status: "skipped",
          expected: "(skipped)",
          actual: expectedResult.skipReason,
        }
      }

      let observedResult: BehavioralValue<T>
      try {
        observedResult = await options.observe(ctx)
      } catch (err) {
        if (isSkipError(err)) {
          return {
            status: "skipped",
            expected: expectedResult.describe,
            actual: err.skipReason,
          }
        }
        const message = err instanceof Error ? err.message : String(err)
        return {
          status: "error",
          expected: expectedResult.describe,
          actual: `observe() threw: ${message}`,
          error: message,
        }
      }

      const passed = equals(expectedResult.value, observedResult.value)
      return {
        status: passed ? "pass" : "fail",
        expected: expectedResult.describe,
        actual: observedResult.describe,
      }
    },
  }
}
