/**
 * Test suite runner.
 *
 * Executes test definitions sequentially and emits updates so the UI can
 * render progressively rather than waiting for the whole suite to finish.
 */

import type {
  TestDefinition,
  TestResult,
  TestRunContext,
  TestState,
  TestSummary,
} from "./types"

const PENDING_RESULT: TestResult = {
  status: "pending",
  expected: "",
  actual: "",
}

/**
 * Convert an unexpected exception into an `error` TestResult. Used as a
 * safety net — well-behaved tests encode failures in their own TestResult
 * and don't throw.
 */
function errorResult(err: unknown, durationMs: number): TestResult {
  const message = err instanceof Error ? err.message : String(err)
  return {
    status: "error",
    expected: "Test to return a TestResult",
    actual: "Test threw an exception",
    error: message,
    durationMs,
  }
}

/**
 * Build the `error` TestResult returned when the run is aborted before a
 * given test starts.
 */
function abortedResult(): TestResult {
  return {
    status: "error",
    expected: "Test to run to completion",
    actual: "Run was aborted before this test started",
    error: "RUN_ABORTED",
    durationMs: 0,
  }
}

/**
 * Run a single test with a timeout and safety net.
 */
async function runOne(
  definition: TestDefinition,
  timeoutMs: number,
  context: TestRunContext | undefined
): Promise<TestResult> {
  const start = performance.now()

  try {
    const timeout = new Promise<TestResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: "error",
          expected: "Test to complete within timeout",
          actual: `Test did not complete within ${timeoutMs}ms`,
          error: "TEST_TIMEOUT",
          durationMs: performance.now() - start,
        })
      }, timeoutMs)
    })

    const result = await Promise.race([definition.run(context), timeout])
    const durationMs = performance.now() - start
    const withDuration = {
      ...result,
      durationMs: result.durationMs ?? durationMs,
    }
    // Tests in the `known-limitations` group document gaps that
    // content-script extensions cannot fully close. A `fail` result
    // from one of them is the educational outcome we want to surface,
    // not a regression. An `error` result — e.g. the probe couldn't
    // run at all on this engine — is also not something we want to
    // flag as a detectable issue; the known-limitations test is the
    // most-reasonable place we can acknowledge "this detection vector
    // doesn't apply to this browser" without silently dropping the
    // test. Remap both fail → known-limitation and error →
    // known-limitation so the dashboard's "detectable issues" count
    // excludes them and the known-limitations block accounts for
    // them in its own "N known limitations" tally.
    //
    // (Tests can still return `known-limitation` directly — e.g. via
    // `skipReason` on `buildBehavioralTest` — and those pass through.
    // Tests that explicitly skip via `SkipTestError` also pass through
    // as `skipped`, which is the right outcome when we can't measure
    // anything either way.)
    if (
      definition.group === "known-limitations" &&
      (withDuration.status === "fail" || withDuration.status === "error")
    ) {
      return { ...withDuration, status: "known-limitation" }
    }
    return withDuration
  } catch (err) {
    return errorResult(err, performance.now() - start)
  }
}

/**
 * Compute the aggregate summary across test states.
 */
export function summarize(states: ReadonlyArray<TestState>): TestSummary {
  const summary: TestSummary = {
    total: states.length,
    passed: 0,
    failed: 0,
    knownLimitation: 0,
    skipped: 0,
    errored: 0,
    pending: 0,
  }

  for (const s of states) {
    switch (s.result.status) {
      case "pass":
        summary.passed += 1
        break
      case "fail":
        summary.failed += 1
        break
      case "known-limitation":
        summary.knownLimitation += 1
        break
      case "skipped":
        summary.skipped += 1
        break
      case "error":
        summary.errored += 1
        break
      case "pending":
        summary.pending += 1
        break
    }
  }

  return summary
}

export interface RunOptions {
  /**
   * Per-test timeout in milliseconds. Default: 20s.
   *
   * Bumped from the earlier 10s to accommodate tests that have to
   * issue fresh `getCurrentPosition` calls — Chrome can take up to
   * ~10s to resolve a fresh fix on a cold cache, and the
   * sandbox-iframe / timestamp-recent tests legitimately need their
   * own live call rather than the run-shared cached position. 20s
   * leaves headroom for that without penalising the dashboard's
   * "time to first green" for well-behaved tests.
   */
  timeoutMs?: number
  /**
   * Optional callback fired after each test completes. Receives the full
   * list of current states so the UI can render in-progress.
   */
  onProgress?: (states: ReadonlyArray<TestState>) => void
  /**
   * Shared run context passed to every test. Optional so call sites that
   * don't need identity (e.g. the legacy `TestSuite` component) can keep
   * calling `runSuite(defs)` with no second argument.
   */
  context?: TestRunContext
}

/**
 * Build the initial pending state for a list of definitions.
 */
export function initialStates(
  definitions: ReadonlyArray<TestDefinition>
): Array<TestState> {
  return definitions.map((definition) => ({
    definition,
    result: PENDING_RESULT,
  }))
}

/**
 * Run the full suite. Tests run sequentially to avoid
 * contention on APIs like navigator.geolocation.
 */
export async function runSuite(
  definitions: ReadonlyArray<TestDefinition>,
  options: RunOptions = {}
): Promise<Array<TestState>> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const context = options.context
  const states = initialStates(definitions)

  options.onProgress?.(states)

  for (let i = 0; i < definitions.length; i += 1) {
    // Check for abort before issuing the next test's call so a mid-run
    // "Run again" stops issuing new work. In-flight tests still get to
    // finish (or be timed out) so we never leak resolved promises.
    if (context?.signal.aborted) {
      for (let j = i; j < definitions.length; j += 1) {
        states[j] = { ...states[j], result: abortedResult() }
      }
      options.onProgress?.(states)
      return states
    }

    const result = await runOne(definitions[i], timeoutMs, context)
    states[i] = { ...states[i], result }
    options.onProgress?.(states)
  }

  return states
}
