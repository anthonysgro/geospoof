import * as React from "react"

import { StatusPill } from "./StatusPill"
import {
  completedCount,
  detectableIssueCount,
  knownLimitationCount,
  skippedCount,
} from "./VerificationSummary"
import type { TestState } from "@/lib/test-suite/types"
import { cn } from "@/lib/utils"

interface StickyVerdictProps {
  /**
   * Element that must be visible for the sticky bar to STAY HIDDEN —
   * typically the main `VerificationSummary` block at the top of the
   * dashboard. Once the user scrolls past this element the sticky bar
   * docks to the top of the viewport and stays there; scrolling back
   * reveals the original summary and hides the sticky copy. This
   * prevents double-showing the verdict when both are on screen.
   */
  anchorRef: React.RefObject<HTMLElement | null>
  states: ReadonlyArray<TestState>
  isRunning: boolean
}

/**
 * A slim verdict bar that docks to the top of the viewport once the
 * user has scrolled past the main Verification_Summary. Keeps the
 * overall outcome in view without making the user scroll back to the
 * top of a long results list.
 *
 * Hidden:
 *   - On initial load (before the anchor has been observed at all).
 *   - While the anchor is intersecting the viewport.
 *   - At breakpoints below `md` — mobile users typically scroll quickly
 *     and a floating bar competes with the OS chrome + our top nav.
 */
export function StickyVerdict({
  anchorRef,
  states,
  isRunning,
}: StickyVerdictProps) {
  const [anchorVisible, setAnchorVisible] = React.useState(true)

  React.useEffect(() => {
    const el = anchorRef.current
    if (!el || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setAnchorVisible(entry.isIntersecting)
      },
      {
        // Treat anything within the top 100px of the viewport as
        // "still visible" so the sticky bar doesn't flash into view
        // for a scroll fraction while the summary itself is leaving.
        rootMargin: "-100px 0px 0px 0px",
        threshold: 0,
      }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [anchorRef])

  const total = states.length
  const completed = completedCount(states)
  const issues = detectableIssueCount(states)
  const known = knownLimitationCount(states)
  const skipped = skippedCount(states)

  // Label + tone mirror the main VerificationSummary so the two
  // surfaces stay in lock-step.
  let label: string
  let tone: "pass" | "fail" | "muted"
  if (isRunning || completed < total) {
    label = `${completed}/${total} tests`
    tone = "muted"
  } else if (issues === 0) {
    label = "No detectable issues"
    tone = "pass"
  } else {
    label = `${issues} detectable issue${issues === 1 ? "" : "s"}`
    tone = "fail"
  }

  const show = !anchorVisible

  return (
    <div
      aria-hidden={show ? undefined : true}
      className={cn(
        // Docked beneath the sticky top Navigation (h-18 md:h-20 + pt-2/3).
        // z-index sits just below Navigation so its backdrop doesn't get
        // masked on translucent backgrounds.
        "pointer-events-none fixed inset-x-0 z-40 hidden justify-center px-4",
        "top-[calc(var(--nav-offset)+0.5rem)] md:flex",
        "[--nav-offset:5rem] md:[--nav-offset:5.5rem]",
        "transition-all duration-150 ease-out",
        show
          ? "opacity-100 translate-y-0"
          : "pointer-events-none opacity-0 -translate-y-2"
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-1.5 shadow-sm backdrop-blur",
          "border-(--color-canvas-border) bg-canvas/85"
        )}
      >
        <StatusPill tone={tone === "muted" ? "muted" : tone}>
          {tone === "pass" ? "Pass" : tone === "fail" ? "Fail" : "Running"}
        </StatusPill>
        <span className="text-sm font-medium text-(--color-canvas-foreground)">
          {label}
        </span>
        {tone !== "muted" && known > 0 ? (
          <span className="text-xs text-(--color-canvas-muted)">
            · {known} known
          </span>
        ) : null}
        {tone !== "muted" && skipped > 0 ? (
          <span className="text-xs text-(--color-canvas-muted)">
            · {skipped} skipped
          </span>
        ) : null}
      </div>
    </div>
  )
}
