import * as React from "react"
import { Info } from "lucide-react"

import type {
  ObservedFacet,
  ObservedRow,
} from "@/lib/verification/observed-probes"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { useIdentity } from "@/lib/verification/identity-context"
import {
  buildSyncFacets,
  resolveAsyncDocumentRows,
} from "@/lib/verification/observed-probes"

/**
 * Facets that are open by default — the headline identity values.
 * Every other facet is collapsed so the section stays compact; users
 * who want the full picture click to expand. Multiple facets can be
 * open at once.
 */
const DEFAULT_OPEN_FACETS: ReadonlyArray<string> = ["timezone", "location"]

/**
 * Observed Values Panel.
 *
 * Sits between the IdentityPanel (resolved identity — "what we claim")
 * and the VerificationSummary / DetectableIssuesSection ("is it
 * detectable?"). This panel is the middle layer: "show me the raw
 * values the browser actually emits through every surface GeoSpoof
 * touches."
 *
 * Design notes:
 *   - No pass/fail column. Judgment lives in the Detectable Issues
 *     Section below; this panel's job is just side-by-side legibility.
 *   - Values are probed live on the client, once per identity
 *     snapshot `runId`. Re-firing happens automatically when the
 *     user hits "Run again".
 *   - Sync facets render immediately on mount. The document-level
 *     facet gets async rows (iframe, XSLT) appended when those
 *     probes settle, so the panel is never blank.
 *   - Facets are wrapped in a shadcn Accordion with type="multiple"
 *     — Timezone and Location are open by default; the rest are
 *     collapsed until the user expands them.
 *   - SSR-safe: every browser-global access happens inside `useEffect`.
 *   - Hover cards surface a title + longer description when you hover
 *     the info icon next to a row.
 */
export function ObservedValuesPanel() {
  const { snapshot } = useIdentity()
  const { location, runId } = snapshot

  const [facets, setFacets] = React.useState<ReadonlyArray<ObservedFacet>>([])

  React.useEffect(() => {
    // Run synchronously on effect mount so the panel paints in the
    // same tick as the IdentityPanel — otherwise the page shifts
    // as the panel fills in.
    const sync = buildSyncFacets({
      location: {
        latitude: location.value?.latitude ?? null,
        longitude: location.value?.longitude ?? null,
        accuracy: location.value?.accuracy ?? null,
      },
    })
    setFacets(sync)

    let cancelled = false
    void resolveAsyncDocumentRows().then((asyncRows) => {
      if (cancelled) return
      setFacets((current) =>
        current.map((facet) =>
          facet.id === "document"
            ? { ...facet, rows: [...facet.rows, ...asyncRows] }
            : facet
        )
      )
    })
    return () => {
      cancelled = true
    }
    // runId bumps on every "Run again", and the location fields are
    // what we need when the user's initial permission decision
    // settles. These are the only two drivers.
  }, [runId, location.value?.latitude, location.value?.longitude])

  return (
    <section aria-labelledby="observed-values-heading" className="space-y-4">
      <header className="space-y-1">
        <h3
          id="observed-values-heading"
          className="text-base font-medium text-(--color-canvas-foreground)"
        >
          Observed values in detail
        </h3>
        <p className="text-sm text-(--color-canvas-muted)">
          Every API surface GeoSpoof touches, probed live. Hover a row for
          context.
        </p>
      </header>

      <Accordion
        type="multiple"
        defaultValue={[...DEFAULT_OPEN_FACETS]}
        className="w-full"
      >
        {facets.map((facet) => (
          <AccordionItem key={facet.id} value={facet.id}>
            <AccordionTrigger className="py-3">
              <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="text-sm font-semibold text-(--color-canvas-foreground)">
                  {facet.title}
                  <span className="ml-2 text-xs font-normal text-(--color-canvas-muted)">
                    {facet.rows.length}
                  </span>
                </span>
                {facet.subtitle ? (
                  <span className="text-xs font-normal text-(--color-canvas-muted)">
                    {facet.subtitle}
                  </span>
                ) : null}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {facet.rows.map((row, i) => (
                  <Row key={`${facet.id}-${i}`} row={row} />
                ))}
              </dl>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

function Row({ row }: { row: ObservedRow }) {
  return (
    <React.Fragment>
      <dt className="flex items-start gap-1.5 self-start font-mono text-xs leading-relaxed wrap-break-word text-(--color-canvas-muted)">
        <span className="min-w-0 wrap-break-word">{row.label}</span>
        {row.description ? (
          <HoverCard openDelay={150} closeDelay={120}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-label={`About ${row.label}`}
                className="mt-0.5 shrink-0 rounded-sm text-(--color-canvas-muted) transition-colors hover:text-(--color-canvas-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-canvas-foreground)"
              >
                <Info aria-hidden="true" className="size-3.5" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              side="top"
              className="w-80 max-w-[90vw] space-y-2"
            >
              <p className="font-mono text-[0.6875rem] leading-snug wrap-break-word text-(--color-canvas-foreground)">
                {row.label}
              </p>
              <p className="text-sm leading-relaxed text-(--color-canvas-muted)">
                {row.description}
              </p>
            </HoverCardContent>
          </HoverCard>
        ) : null}
      </dt>
      <dd className="self-start font-mono text-xs leading-relaxed wrap-break-word text-(--color-canvas-foreground) md:text-sm">
        {row.value}
      </dd>
    </React.Fragment>
  )
}
