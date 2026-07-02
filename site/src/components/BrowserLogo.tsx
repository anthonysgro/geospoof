import chrome from "@/assets/browser-logos/chrome.svg?raw"
import firefox from "@/assets/browser-logos/firefox.svg?raw"
import safari from "@/assets/browser-logos/safari.svg?raw"
import edge from "@/assets/browser-logos/edge.svg?raw"
import brave from "@/assets/browser-logos/brave.svg?raw"
import github from "@/assets/browser-logos/github.svg?raw"
import { cn } from "@/lib/utils"

// Raw SVG markup inlined at build time (`?raw`), so the logos ship inside the
// JS bundle instead of as separate files — no extra network request per view.
// The SVGs were run through svgo with `removeDimensions`, so each has a
// `viewBox` but no width/height; sizing is controlled entirely via `className`.
// The `github` mark uses `fill="currentColor"` so it follows the text color
// (dark in light mode, white in dark mode).
const logos = { chrome, firefox, safari, edge, brave, github } as const

export type BrowserLogoName = keyof typeof logos

export function BrowserLogo({
  name,
  className,
}: {
  name: BrowserLogoName
  /** Sizing utilities, e.g. "h-5 w-5". The inner <svg> is stretched to fill. */
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full",
        className
      )}
      dangerouslySetInnerHTML={{ __html: logos[name] }}
    />
  )
}
