import { ShieldCheck } from "lucide-react"

/**
 * Privacy notice rendered directly above the Identity Panel.
 *
 * Reassures visitors that everything shown on the dashboard is computed
 * client-side and that no identity data leaves the device during the
 * verification run (Req 17.2).
 *
 * This is a purely static component — no browser-global access, no
 * effects — so it is safe to render during SSR.
 */
export function PrivacyNotice() {
  return (
    <aside
      aria-label="Privacy notice"
      className="flex items-start gap-3 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 text-sm text-(--color-canvas-foreground) shadow-sm"
    >
      <ShieldCheck
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-(--color-brand)"
      />
      <div className="space-y-1">
        <p className="font-medium">
          Everything on this page is computed in your browser.
        </p>
        <p className="text-(--color-canvas-muted)">
          No identity values, test results, or diagnostics leave your device
          during the verification run. External requests are limited to the
          OpenStreetMap map tiles disclosed beneath the location map.
        </p>
      </div>
    </aside>
  )
}
