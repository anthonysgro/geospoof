import * as React from "react"
import type { Map as LeafletMapInstance } from "leaflet"

interface LeafletMapProps {
  lat: number
  lon: number
}

/**
 * Client-only Leaflet map.
 *
 * Leaflet touches `window`, `document`, and `navigator` at module top
 * level, so both the `leaflet` module and its stylesheet are dynamically
 * imported inside `useEffect`. Vite code-splits them into a separate
 * chunk that is never pulled into the SSR bundle.
 */
export function LeafletMap({ lat, lon }: LeafletMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<LeafletMapInstance | null>(null)

  React.useEffect(() => {
    // Use an object wrapper so both the async `mount()` closure and the
    // cleanup callback read and write through the same reference. A
    // plain `let` would get narrowed away by TypeScript and hide the
    // dispose-after-mount race check from the compiler.
    const disposal = { disposed: false }
    const container = containerRef.current
    if (!container) return

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    async function mount() {
      // Dynamic imports keep leaflet and its CSS out of the SSR bundle.
      const L = await import("leaflet")
      await import("leaflet/dist/leaflet.css")
      // Guard against a dispose-after-mount race: the consumer may have
      // unmounted while we were awaiting the dynamic imports.
      if (disposal.disposed || !container) return

      const map = L.map(container, {
        center: [lat, lon],
        zoom: 12,
        scrollWheelZoom: false,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion,
        attributionControl: true,
      })

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      L.circleMarker([lat, lon], {
        radius: 8,
        weight: 2,
      }).addTo(map)

      mapRef.current = map
    }

    void mount()

    return () => {
      disposal.disposed = true
      const map = mapRef.current
      if (map) {
        map.remove()
        mapRef.current = null
      }
    }
  }, [lat, lon])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map of coordinates ${lat.toFixed(4)}, ${lon.toFixed(4)}`}
      // `isolation: isolate` creates a new stacking context so Leaflet's
      // internal pane + control z-indexes (some as high as 1000) stay
      // constrained to the map container. Without this the tile pane
      // punches through the sticky Navigation (z-50) and the sticky
      // verdict bar (z-40) when the user scrolls.
      className="isolate h-[340px] w-full overflow-hidden rounded-lg border border-(--color-canvas-border) sm:h-[400px] lg:h-[460px]"
    />
  )
}
