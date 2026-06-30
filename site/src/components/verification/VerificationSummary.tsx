import { StatusPill } from "./StatusPill"
import type { TestState } from "@/lib/test-suite/types"
import { Progress } from "@/components/ui/progress"

/**
 * Anchor id of the collapsible "Known limitations" block rendered at the
 * bottom of the Detectable_Issues_Section. Shared so the summary's
 * secondary link and the section itself stay in sync.
 */
export const KNOWN_LIMITATIONS_ANCHOR_ID = "known-limitations"

/**
 * Count test states that represent a detectable issue — i.e. statuses
 * that a page-level script could use to tell that GeoSpoof is installed
 * or that its presented values are wrong.
 *
 * `known-limitation` states explicitly DO NOT contribute; they represent
 * documented gaps that content-script extensions cannot fully close and
 * are surfaced separately (Req 7.5, Req 23.5).
 *
 * Exported so Property 2 (summary counts detectable issues exactly) can
 * reference the same implementation the UI renders.
 */
export function detectableIssueCount(states: ReadonlyArray<TestState>): number {
  let count = 0
  for (const s of states) {
    const status = s.result.status
    if (status === "fail" || status === "error") count += 1
  }
  return count
}

/**
 * Count test states with status `known-limitation`. Used for the secondary
 * "<K> known limitation(s)" line (Req 7.4).
 */
export function knownLimitationCount(states: ReadonlyArray<TestState>): number {
  let count = 0
  for (const s of states) {
    if (s.result.status === "known-limitation") count += 1
  }
  return count
}

/**
 * Count test states with status `skipped` — tests whose prerequisites
 * weren't met (e.g. user denied geolocation permission, Temporal API
 * unavailable) so no measurement was possible. Distinct from
 * `known-limitation` (unfixable architectural gap) and from `fail`
 * (actual regression).
 */
export function skippedCount(states: ReadonlyArray<TestState>): number {
  let count = 0
  for (const s of states) {
    if (s.result.status === "skipped") count += 1
  }
  return count
}

/**
 * Count test states that have finished running (i.e. are not `pending`).
 * Used for the in-progress headline.
 */
export function completedCount(states: ReadonlyArray<TestState>): number {
  let count = 0
  for (const s of states) {
    if (s.result.status !== "pending") count += 1
  }
  return count
}

interface VerificationSummaryProps {
  states: ReadonlyArray<TestState>
  isRunning: boolean
}

/**
 * One-line verdict above the Detectable Issues section.
 *
 * - While the run is in progress → "<completed>/<total> tests complete"
 *   + pending pill (Req 7.3).
 * - Zero detectable issues + zero pending → "No detectable issues found"
 *   + pass pill + clarifier that this does not imply unfingerprintability
 *   (Req 7.1, Req 7.6).
 * - One or more detectable issues → "<N> detectable issue(s) — review
 *   below" + fail pill (Req 7.2).
 * - When any `known-limitation` state exists, a secondary line links to
 *   the collapsible known-limitations block (Req 7.4).
 *
 * The headline + pill are wrapped in a polite live region so screen
 * readers announce state changes without interrupting the user (Req 18.2).
 */
export function VerificationSummary({
  states,
  isRunning,
}: VerificationSummaryProps) {
  const total = states.length
  const completed = completedCount(states)
  const issues = detectableIssueCount(states)
  const knownLimitations = knownLimitationCount(states)
  const skipped = skippedCount(states)

  let headline: React.ReactNode
  let pill: React.ReactNode
  let clarifier: React.ReactNode = null

  const headlineClass = "text-lg font-semibold text-(--color-canvas-foreground)"

  if (isRunning || completed < total) {
    headline = (
      <h3 className={headlineClass}>
        {completed}/{total} tests complete
      </h3>
    )
    pill = <StatusPill tone="muted">Running</StatusPill>
  } else if (issues === 0) {
    headline = <h3 className={headlineClass}>No detectable issues found</h3>
    pill = <StatusPill tone="pass">Pass</StatusPill>
    clarifier = (
      <p className="text-sm text-(--color-canvas-muted)">
        This means no probe run on this page could tell that GeoSpoof is active.
        It does not imply that your browser is unfingerprintable.
      </p>
    )
  } else {
    headline = (
      <h3 className={headlineClass}>
        {issues} detectable issue{issues === 1 ? "" : "s"} — review below
      </h3>
    )
    pill = <StatusPill tone="fail">Fail</StatusPill>
  }

  return (
    <section aria-labelledby="verdict-summary-heading" className="space-y-2">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex flex-wrap items-center gap-3"
      >
        <div id="verdict-summary-heading">{headline}</div>
        {pill}
      </div>

      {isRunning && total > 0 ? (
        <Progress
          value={Math.round((completed / total) * 100)}
          aria-label={`${completed} of ${total} tests complete`}
          className="mt-1"
        />
      ) : null}

      {clarifier}

      {knownLimitations > 0 ? (
        <p className="text-sm text-(--color-canvas-muted)">
          <a
            href={`#${KNOWN_LIMITATIONS_ANCHOR_ID}`}
            className="underline underline-offset-2 hover:text-(--color-canvas-foreground)"
          >
            {knownLimitations} known limitation
            {knownLimitations === 1 ? "" : "s"}
          </a>{" "}
          — surfaced separately below.
        </p>
      ) : null}

      {skipped > 0 ? (
        <p className="text-sm text-(--color-canvas-muted)">
          {skipped} test{skipped === 1 ? "" : "s"} skipped — prerequisites
          unavailable in this environment (e.g. location permission denied,
          Temporal API unsupported).
        </p>
      ) : null}
    </section>
  )
}
