import { FactsStrip } from "./FactsStrip"
import { LocationField } from "./LocationField"
import { ObservedValuesPanel } from "./ObservedValuesPanel"
import { Separator } from "@/components/ui/separator"

/**
 * Identity Panel.
 *
 * One full-width card with three stacked regions:
 *
 *   1. Location — map + coords + tile-source caption. Full horizontal
 *      width so the map reads as a proper hero visual.
 *   2. FactsStrip — horizontal row of at-a-glance facts: timezone,
 *      local time, language, platform, APIs available.
 *   3. Observed Values — the accordion with full per-surface detail.
 *
 * Regions 2 and 3 are intentionally related: the strip shows the
 * headline value for each identity facet, the accordion below shows
 * every surface the browser exposes for that facet. Keeping them in
 * the same card signals that they're the same subject viewed at two
 * zoom levels.
 *
 * The previous layout put a two-column 3fr:2fr grid here with the
 * sidebar duplicating content now surfaced more completely by the
 * Observed Values accordion. Collapsing to a single column gives the
 * map full width and drops the duplication.
 */
export default function IdentityPanel() {
  return (
    <section
      aria-labelledby="tier-identity-panel-heading"
      className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) shadow-sm"
    >
      <h3 id="tier-identity-panel-heading" className="sr-only">
        Browser-reported identity
      </h3>

      {/* Location hero — map + coords + caption. */}
      <div className="p-5 md:p-6">
        <dl>
          <LocationField />
        </dl>
      </div>

      <Separator />

      {/* Facts at a glance — one compact horizontal row. */}
      <div className="p-5 md:p-6">
        <FactsStrip />
      </div>

      <Separator />

      {/* Observed values — the full accordion with every probed surface. */}
      <div className="p-5 md:p-6">
        <ObservedValuesPanel />
      </div>
    </section>
  )
}
