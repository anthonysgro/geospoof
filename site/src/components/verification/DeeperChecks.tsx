import * as React from "react"
import { CheckCircle2, Info, Loader2, MinusCircle, XCircle } from "lucide-react"

import { Section } from "@/components/landing/Section"
import { useIdentity } from "@/lib/verification/identity-context"
import { loadAllTests } from "@/lib/test-suite/tests"
import { initialStates, runSuite } from "@/lib/test-suite/runner"
import type {
  TestDefinition,
  TestRunContext,
  TestState,
  TestStatus,
} from "@/lib/test-suite/types"

/**
 * Curated "deeper checks" shown beneath the hero on /verify.
 *
 * The full /test dashboard runs ~40 probes — too much for a conversion
 * page. Here we hand-pick a short, high-signal set that showcases the
 * detection surfaces GeoSpoof closes that simpler tools miss (cross-realm
 * iframes, indirect accessors, Temporal, cross-method consistency) plus an
 * honest nod to the documented limitations (Web Worker timezone, the MV3
 * init race), so the page reads as credible rather than salesy.
 *
 * Tests are matched by keyword against the live manifest rather than by
 * hard-coded id, so the section stays resilient if individual test ids
 * are renamed — a missing keyword simply drops that row.
 */
const CURATED_KEYWORDS: ReadonlyArray<string> = [
  "webrtc",
  "iframe",
  "temporal",
  "cross-method",
  "eval",
  "worker",
  "race",
  "country",
]

/** Pick the first manifest test matching each curated keyword, in order. */
function pickCurated(
  defs: ReadonlyArray<TestDefinition>
): Array<TestDefinition> {
  const chosen: Array<TestDefinition> = []
  const used = new Set<string>()
  for (const keyword of CURATED_KEYWORDS) {
    const match = defs.find((d) => {
      if (used.has(d.id)) return false
      return `${d.id} ${d.name}`.toLowerCase().includes(keyword)
    })
    if (match) {
      used.add(match.id)
      chosen.push(match)
    }
  }
  return chosen
}

const STATUS_META: Record<
  TestStatus,
  { tone: string; icon: React.ReactNode; label: string }
> = {
  pass: {
    tone: "text-(--color-brand)",
    icon: <CheckCircle2 className="size-4" aria-hidden />,
    label: "Pass",
  },
  fail: {
    tone: "text-destructive",
    icon: <XCircle className="size-4" aria-hidden />,
    label: "Detectable",
  },
  "known-limitation": {
    tone: "text-amber-600 dark:text-amber-400",
    icon: <Info className="size-4" aria-hidden />,
    label: "Known limit",
  },
  skipped: {
    tone: "text-(--color-canvas-muted)",
    icon: <MinusCircle className="size-4" aria-hidden />,
    label: "Skipped",
  },
  error: {
    tone: "text-(--color-canvas-muted)",
    icon: <MinusCircle className="size-4" aria-hidden />,
    label: "—",
  },
  pending: {
    tone: "text-(--color-canvas-muted)",
    icon: <Loader2 className="size-4 animate-spin" aria-hidden />,
    label: "Running…",
  },
}

export function DeeperChecks() {
  const { getSnapshot, waitFor } = useIdentity()
  const [states, setStates] = React.useState<Array<TestState>>([])
  const [phase, setPhase] = React.useState<"loading" | "running" | "done">(
    "loading"
  )

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    loadAllTests().then(
      (all) => {
        if (cancelled) return
        const curated = pickCurated(all)
        if (curated.length === 0) {
          setPhase("done")
          return
        }
        setStates(initialStates(curated))
        setPhase("running")

        const context: TestRunContext = {
          getIdentity: getSnapshot,
          awaitIdentity: waitFor,
          signal: controller.signal,
        }

        // Let the location snapshot settle before running so the
        // geolocation-dependent probes don't trip their own timeout
        // while the permission prompt is still up.
        void waitFor("location", 45_000).finally(() => {
          if (cancelled) return
          void runSuite(curated, {
            context,
            onProgress: (next) => {
              if (!cancelled) setStates([...next])
            },
          }).finally(() => {
            if (!cancelled) setPhase("done")
          })
        })
      },
      () => {
        if (!cancelled) setPhase("done")
      }
    )

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [getSnapshot, waitFor])

  if (phase === "done" && states.length === 0) return null

  // Only show definitive outcomes. Skipped / errored probes are
  // environment-dependent (e.g. Firefox denying geolocation inside a fresh
  // iframe) and read as noise on a conversion page, not as GeoSpoof signals.
  const visible = states.filter(
    (s) =>
      s.result.status !== "skipped" && s.result.status !== "error"
  )

  if (phase === "done" && visible.length === 0) return null

  return (
    <Section className="border-t border-(--color-canvas-border) py-12! md:py-16!">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-1 text-2xl font-bold text-(--color-canvas-foreground)">
          The checks most tools never run
        </h2>
        <p className="mb-6 text-sm text-(--color-canvas-muted)">
          GeoSpoof closes detection surfaces that live beyond the obvious APIs.
          A few we run live, right here, on your browser.
        </p>

        <ul className="divide-y divide-(--color-canvas-border) overflow-hidden rounded-2xl border border-(--color-canvas-border)">
          {(visible.length > 0 ? visible : []).map(({ definition, result }) => {
            const meta = STATUS_META[result.status]
            return (
              <li
                key={definition.id}
                className="flex items-start gap-3 bg-(--color-canvas) p-4"
              >
                <span className={`mt-0.5 shrink-0 ${meta.tone}`}>
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-(--color-canvas-foreground)">
                      {definition.name}
                    </p>
                    <span className={`shrink-0 text-xs font-semibold ${meta.tone}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-(--color-canvas-muted)">
                    {result.status === "pending"
                      ? definition.description
                      : result.actual || definition.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-center text-xs text-(--color-canvas-muted)">
          Want the full picture?{" "}
          <a
            href="/test"
            className="font-medium text-(--color-brand) underline-offset-2 hover:underline"
          >
            Run the complete {""}
            diagnostic suite
          </a>
          .
        </p>
      </div>
    </Section>
  )
}
