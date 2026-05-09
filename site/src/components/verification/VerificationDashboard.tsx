import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { CommandPalette } from "./CommandPalette"
import { DashboardTier } from "./DashboardTier"
import { DetectableIssuesSection } from "./DetectableIssuesSection"
import IdentityPanel from "./IdentityPanel"
import { StickyVerdict } from "./StickyVerdict"
import { VerificationSummary } from "./VerificationSummary"
import type {
  TestDefinition,
  TestRunContext,
  TestState,
} from "@/lib/test-suite/types"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
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
 *   - `IdentityProvider` owns the shared `IdentitySnapshot` for one run
 *     and exposes `getSnapshot` / `waitFor` / `refresh` to both the
 *     Identity Panel (for rendering) and the test runner (via
 *     `TestRunContext`).
 *   - `DashboardInner` mounts the Identity Panel, Verification Summary,
 *     and Detectable Issues Section; kicks off `loadAllTests()` and
 *     `runSuite(...)` in parallel with the provider's async resolutions;
 *     and handles the "Run again" button.
 *
 * The route subtitle above and the OpenStreetMap caption beneath the
 * location map together convey the "nothing leaves your device"
 * posture — no dedicated privacy-notice card is needed here.
 *
 * Outer layout (Section narrow, SkipLink, Navigation, Footer) is owned
 * by `routes/test.tsx` and preserved unchanged (Req 21.3).
 */
export function VerificationDashboard() {
  return (
    <IdentityProvider>
      <DashboardInner />
    </IdentityProvider>
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
   *
   * Waits for the identity-panel's location snapshot to reach a terminal
   * state (`ready` or `error`) BEFORE issuing the first test. Rationale:
   *
   *   - On a first run the browser shows a permission prompt. The user
   *     takes however long they take to read and click it, and the
   *     browser takes a few seconds to acquire a fix afterwards. During
   *     that whole window the snapshot is `pending`.
   *   - The runner's per-test timeout is 10s. If a location-dependent
   *     test starts while the snapshot is still pending, it hits that
   *     cap before the snapshot settles — the user sees "Timeout
   *     expired" on a test that would otherwise have passed.
   *   - Waiting here means all the permission-prompt reading time and
   *     the browser's acquisition time happen BEFORE any test's clock
   *     starts ticking. The panel then has a seeded position that
   *     every test's `getSharedPosition` call returns synchronously.
   *
   * Fire a timeout fallback (45s) so a user who never responds to the
   * prompt doesn't leave the dashboard stuck forever. At that point
   * the snapshot's `error` field carries "Geolocation request timed
   * out" and downstream tests correctly skip via
   * `requireLocationSnapshot`.
   */
  React.useEffect(() => {
    if (!tests) return
    let cancelled = false

    void waitFor("location", 45_000).finally(() => {
      if (cancelled) return
      startRun(tests)
    })

    // Cleanup aborts the in-flight run if the component unmounts or a
    // newer run supersedes this one.
    return () => {
      cancelled = true
      controllerRef.current?.abort()
    }
  }, [tests, runAttempt, startRun, waitFor])

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

  /** Ref used by the sticky verdict bar to know when to dock. */
  const summaryAnchorRef = React.useRef<HTMLDivElement | null>(null)

  /**
   * Manifest-load failure card. Rendered above the panel/summary so the
   * failure is immediately visible, but the Identity Panel below still
   * shows what the provider has resolved — users can confirm timezone /
   * language even when the test manifest itself failed to load.
   */
  const errorCard = manifestError ? (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>Couldn't load the test suite.</AlertTitle>
      <AlertDescription>{manifestError}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" onClick={handleRunAgain}>
          Run again
        </Button>
      </AlertAction>
    </Alert>
  ) : null

  return (
    <div className="space-y-10">
      {errorCard}

      <DashboardTier
        id="tier-identity"
        title="Your identity right now"
        subtitle="What your browser reports about you through every surface GeoSpoof can reach."
      >
        <IdentityPanel />
      </DashboardTier>

      <DashboardTier
        id="tier-verdict"
        title="Verdict"
        subtitle="Can any probe on this page detect that GeoSpoof is active?"
      >
        <Card ref={summaryAnchorRef} className="mx-auto w-full max-w-4xl">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          </CardContent>
        </Card>

        <StickyVerdict
          anchorRef={summaryAnchorRef}
          states={states}
          isRunning={isRunning}
        />
      </DashboardTier>

      <DashboardTier
        id="tier-details"
        title="Detectable issues"
        subtitle="Per-test detail. Expand any failing check to see the technique used and the observed value."
      >
        <div className="mx-auto w-full max-w-4xl">
          {tests ? (
            <DetectableIssuesSection states={states} />
          ) : manifestError ? null : (
            <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-sm text-(--color-canvas-muted)">
              Loading tests…
            </div>
          )}
        </div>
      </DashboardTier>

      <CommandPalette
        states={states}
        onRunAgain={handleRunAgain}
        isRunning={isRunning}
      />
    </div>
  )
}
