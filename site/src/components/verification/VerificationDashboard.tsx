import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { BrowserCapabilitiesSection } from "./BrowserCapabilitiesSection"
import { DetectableIssuesSection } from "./DetectableIssuesSection"
import IdentityPanel from "./IdentityPanel"
import { PrivacyNotice } from "./PrivacyNotice"
import { VerificationSummary } from "./VerificationSummary"
import type {
  TestDefinition,
  TestRunContext,
  TestState,
} from "@/lib/test-suite/types"
import {
  IdentityProvider,
  useIdentity,
} from "@/lib/verification/identity-context"
import { loadAllTests } from "@/lib/test-suite/tests"
import { initialStates, runSuite } from "@/lib/test-suite/runner"
import { Button } from "@/components/ui/button"

/**
 * Root component of the Verification Dashboard — the redesigned `/test`
 * page.
 *
 * Composition:
 *   - `PrivacyNotice` (static, SSR-safe) sits above everything.
 *   - `IdentityProvider` owns the shared `IdentitySnapshot` for one run
 *     and exposes `getSnapshot` / `waitFor` / `refresh` to both the
 *     Identity Panel (for rendering) and the test runner (via
 *     `TestRunContext`).
 *   - `DashboardInner` mounts the Identity Panel, Verification Summary,
 *     and Detectable Issues Section; kicks off `loadAllTests()` and
 *     `runSuite(...)` in parallel with the provider's async resolutions;
 *     and handles the "Run again" button.
 *
 * Outer layout (Section narrow, SkipLink, Navigation, Footer) is owned
 * by `routes/test.tsx` and preserved unchanged (Req 21.3).
 */
export function VerificationDashboard() {
  return (
    <div className="space-y-6">
      <PrivacyNotice />
      <IdentityProvider>
        <DashboardInner />
      </IdentityProvider>
    </div>
  )
}

function DashboardInner() {
  const { getSnapshot, waitFor, refresh } = useIdentity()

  /** Test manifest; `null` until `loadAllTests()` resolves. */
  const [tests, setTests] =
    React.useState<ReadonlyArray<TestDefinition> | null>(null)
  /** Live per-test state driven by the runner's `onProgress` callback. */
  const [states, setStates] = React.useState<Array<TestState>>([])
  const [isRunning, setIsRunning] = React.useState(false)
  /** Set when the manifest import itself rejects (Req 20.3). */
  const [manifestError, setManifestError] = React.useState<string | null>(null)
  /** Bumped to re-attempt a failed manifest import. */
  const [loadAttempt, setLoadAttempt] = React.useState(0)
  /** Bumped to re-run the suite without re-loading the manifest. */
  const [runAttempt, setRunAttempt] = React.useState(0)

  /**
   * Abort controller scoped to the currently in-flight run. Each call to
   * `startRun` aborts the previous controller so a mid-run "Run again"
   * stops issuing new tests (Req 19.4, Req 13.3).
   */
  const controllerRef = React.useRef<AbortController | null>(null)

  /**
   * Start a suite run. Builds a fresh `TestRunContext` that wires the
   * provider's non-reactive accessors (`getSnapshot`, `waitFor`) and a
   * run-scoped `AbortSignal` into the runner.
   *
   * Reuses the existing TestSuite progressive-render pattern —
   * `onProgress` calls `setStates([...next])` directly. React batches the
   * updates within one animation frame so this satisfies Req 15.1
   * without a custom rAF scheduler.
   */
  const startRun = React.useCallback(
    (definitions: ReadonlyArray<TestDefinition>) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setIsRunning(true)
      setStates(initialStates(definitions))

      const context: TestRunContext = {
        getIdentity: getSnapshot,
        awaitIdentity: waitFor,
        signal: controller.signal,
      }

      void runSuite(definitions, {
        onProgress: (next) => {
          if (controller.signal.aborted) return
          setStates([...next])
        },
        context,
      }).finally(() => {
        // Don't flip `isRunning` off if a newer run has superseded this
        // one — the newer run owns the flag until it settles.
        if (!controller.signal.aborted) setIsRunning(false)
      })
    },
    [getSnapshot, waitFor]
  )

  /**
   * Load the manifest once on mount, and re-attempt when `loadAttempt`
   * bumps (which only happens from the error card's "Run again"). The
   * `tests != null` early return ensures we don't re-fetch on every
   * render.
   *
   * Manifest rejections are stored in `manifestError` and surfaced via
   * the error card below rather than thrown to an error boundary
   * (Req 20.3).
   */
  React.useEffect(() => {
    if (tests) return
    let cancelled = false
    setManifestError(null)

    loadAllTests().then(
      (definitions) => {
        if (cancelled) return
        setTests(definitions)
      },
      (err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setManifestError(message)
      }
    )

    return () => {
      cancelled = true
    }
  }, [loadAttempt, tests])

  /**
   * Auto-run the suite whenever the manifest first loads or `runAttempt`
   * bumps. `startRun` is stable (its closure depends only on the
   * provider's stable callbacks), so the only drivers are `tests` and
   * `runAttempt`.
   */
  React.useEffect(() => {
    if (!tests) return
    startRun(tests)
    // Cleanup aborts the in-flight run if the component unmounts or a
    // newer run supersedes this one.
    return () => {
      controllerRef.current?.abort()
    }
  }, [tests, runAttempt, startRun])

  const handleRunAgain = React.useCallback(() => {
    if (manifestError) {
      // Retry the failed manifest import.
      setManifestError(null)
      setLoadAttempt((n) => n + 1)
      return
    }
    // Normal path: re-resolve identity and re-run the suite in parallel.
    // Both state updates are batched by React so the provider's
    // re-resolution and the dashboard's new run kick off on the same
    // tick (Req 13.3, Req 14.2).
    refresh()
    setRunAttempt((n) => n + 1)
  }, [manifestError, refresh])

  /**
   * Manifest-load failure card. Rendered above the panel/summary so the
   * failure is immediately visible, but the Identity Panel below still
   * shows what the provider has resolved — users can confirm timezone /
   * language even when the test manifest itself failed to load.
   */
  const errorCard = manifestError ? (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-(--color-canvas-foreground)"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-(--color-canvas-foreground)">
            Couldn't load the test suite.
          </p>
          <p className="text-xs text-(--color-canvas-muted)">{manifestError}</p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={handleRunAgain}>
        Run again
      </Button>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {errorCard}

      <IdentityPanel />

      <div className="flex flex-col gap-4 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <VerificationSummary states={states} isRunning={isRunning} />
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleRunAgain}
            disabled={isRunning || (!tests && !manifestError)}
          >
            {isRunning ? "Running…" : "Run again"}
          </Button>
        </div>
      </div>

      {tests ? (
        <DetectableIssuesSection states={states} />
      ) : manifestError ? null : (
        <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-sm text-(--color-canvas-muted)">
          Loading tests…
        </div>
      )}

      {/* Diagnostic footer — collapsed by default so it doesn't compete
          with the Identity Panel or the verification verdict (Req 6). */}
      <BrowserCapabilitiesSection />
    </div>
  )
}
