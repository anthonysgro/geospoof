/**
 * Test suite runner.
 *
 * Executes test definitions sequentially and emits updates so the UI can
 * render progressively rather than waiting for the whole suite to finish.
 */

import type {
  TestDefinition,
  TestResult,
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
 * Run a single test with a timeout and safety net.
 */
async function runOne(
  definition: TestDefinition,
  timeoutMs: number
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

    const result = await Promise.race([definition.run(), timeout])
    const durationMs = performance.now() - start
    return { ...result, durationMs: result.durationMs ?? durationMs }
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
  /** Per-test timeout in milliseconds. Default: 10s. */
  timeoutMs?: number
  /**
   * Optional callback fired after each test completes. Receives the full
   * list of current states so the UI can render in-progress.
   */
  onProgress?: (states: ReadonlyArray<TestState>) => void
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
  const timeoutMs = options.timeoutMs ?? 10_000
  const states = initialStates(definitions)

  options.onProgress?.(states)

  for (let i = 0; i < definitions.length; i += 1) {
    const result = await runOne(definitions[i], timeoutMs)
    states[i] = { ...states[i], result }
    options.onProgress?.(states)
  }

  return states
}
