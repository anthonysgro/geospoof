import * as React from "react"
import type { Map as LeafletMapInstance, CircleMarker, Polyline } from "leaflet"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"

export interface MapPoint {
  lat: number
  lon: number
  label: string
  kind: "browser" | "network"
}

type LeafletMapProps =
  | {
      /** Simple single-point usage (lat/lon directly). */
      lat: number
      lon: number
      zoom?: number
      primary?: never
      secondary?: never
      className?: string
    }
  | {
      /** Two-point usage with labels and arc. */
      primary: MapPoint
      secondary?: MapPoint
      zoom?: never
      lat?: never
      lon?: never
      className?: string
    }

/**
 * Build an approximated great-circle arc as N intermediate lat/lon points.
 * For distances < ~5000km a linear interpolation is visually indistinguishable;
 * for longer distances we use spherical interpolation (slerp) so the arc
 * visibly curves over the globe.
 */
function greatCirclePoints(
  a: [number, number],
  b: [number, number],
  n = 80
): Array<[number, number]> {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const lat1 = toRad(a[0])
  const lon1 = toRad(a[1])
  const lat2 = toRad(b[0])
  const lon2 = toRad(b[1])

  const points: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // Slerp in 3-D Cartesian coordinates.
    const x1 = Math.cos(lat1) * Math.cos(lon1)
    const y1 = Math.cos(lat1) * Math.sin(lon1)
    const z1 = Math.sin(lat1)
    const x2 = Math.cos(lat2) * Math.cos(lon2)
    const y2 = Math.cos(lat2) * Math.sin(lon2)
    const z2 = Math.sin(lat2)

    const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2))
    const omega = Math.acos(dot)

    let x: number, y: number, z: number
    if (Math.abs(omega) < 1e-6) {
      x = x1 + (x2 - x1) * t
      y = y1 + (y2 - y1) * t
      z = z1 + (z2 - z1) * t
    } else {
      const s = Math.sin(omega)
      x = (Math.sin((1 - t) * omega) / s) * x1 + (Math.sin(t * omega) / s) * x2
      y = (Math.sin((1 - t) * omega) / s) * y1 + (Math.sin(t * omega) / s) * y2
      z = (Math.sin((1 - t) * omega) / s) * z1 + (Math.sin(t * omega) / s) * z2
    }

    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))
    const lon = toDeg(Math.atan2(y, x))
    points.push([lat, lon])
  }
  return points
}

const COLORS = {
  browser: { fill: "#4ade80", stroke: "#ffffff" },  // green
  network: { fill: "#fb923c", stroke: "#ffffff" },  // amber
}

export function LeafletMap(props: LeafletMapProps) {
  // Normalise both call signatures to primary/secondary.
  const primary: MapPoint =
    "lat" in props && props.lat !== undefined
      ? { lat: props.lat, lon: props.lon, label: "", kind: "browser" }
      : (props.primary as MapPoint)
  const secondary = "secondary" in props ? props.secondary : undefined
  const initialZoom = "zoom" in props && props.zoom !== undefined ? props.zoom : 6
  const { className } = props

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<LeafletMapInstance | null>(null)
  const tileLayerRef = React.useRef<ReturnType<typeof import("leaflet")["tileLayer"]> | null>(null)
  const animFrameRef = React.useRef<number | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

  // Stable key — remount when coordinates change.
  const coordKey = `${primary.lat},${primary.lon},${secondary?.lat ?? ""},${secondary?.lon ?? ""}`

  React.useEffect(() => {
    const disposal = { disposed: false }
    const container = containerRef.current
    if (!container) return

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    async function mount() {
      const L = await import("leaflet")
      await import("leaflet/dist/leaflet.css")
      if (disposal.disposed || !container) return

      // Fit bounds to include both points when secondary is present.
      const bounds =
        secondary
          ? L.latLngBounds(
              [primary.lat, primary.lon],
              [secondary.lat, secondary.lon]
            ).pad(0.3)
          : undefined

      const map = L.map(container, {
        center: bounds ? bounds.getCenter() : [primary.lat, primary.lon],
        zoom: bounds ? undefined : initialZoom,
        scrollWheelZoom: false,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion,
        attributionControl: true,
      })
      if (bounds) map.fitBounds(bounds)

      const layer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution,
        subdomains: "abcd",
      })
      layer.addTo(map)
      tileLayerRef.current = layer

      // Helper: labeled circle marker with a tooltip.
      // Browser-kind markers get a pulsing sonar ring via a DivIcon.
      const addMarker = (pt: MapPoint): CircleMarker | ReturnType<typeof L.marker> => {
        const c = COLORS[pt.kind]

        if (pt.kind === "browser" && !reducedMotion) {
          const icon = L.divIcon({
            className: "",
            html: `<div class="gs-sonar-wrap">
                     <span class="gs-sonar-ring"></span>
                     <span class="gs-sonar-dot"></span>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            tooltipAnchor: [0, -18],
          })
          const m = L.marker([pt.lat, pt.lon], { icon })
          m.addTo(map)
          if (pt.label) {
            m.bindTooltip(pt.label, {
              permanent: true,
              direction: "top",
              offset: [0, -14],
              className: "leaflet-geospoof-label",
            }).openTooltip()
          }
          return m as unknown as CircleMarker
        }

        const marker = L.circleMarker([pt.lat, pt.lon], {
          radius: 9,
          color: c.stroke,
          weight: 3,
          fillColor: c.fill,
          fillOpacity: 1,
        }).addTo(map)
        if (pt.label) {
          marker
            .bindTooltip(pt.label, {
              permanent: true,
              direction: "top",
              offset: [0, -14],
              className: "leaflet-geospoof-label",
            })
            .openTooltip()
        }
        return marker
      }

      addMarker(primary)

      if (secondary) {
        addMarker(secondary)

        const arcPoints = greatCirclePoints(
          [primary.lat, primary.lon],
          [secondary.lat, secondary.lon]
        )

        // Static dashed line — full arc.
        const arcLine = L.polyline(arcPoints, {
          color: "#ffffff",
          weight: 1.5,
          opacity: 0.25,
          dashArray: "6 6",
          interactive: false,
        }).addTo(map)
        void arcLine // used for the visual; no ref needed

        if (!reducedMotion) {
          // Animated travelling dot along the arc.
          const dot = L.circleMarker(arcPoints[0], {
            radius: 5,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ffffff",
            fillOpacity: 0.9,
            interactive: false,
          }).addTo(map)

          // Distance label along the arc midpoint.
          const DURATION = 2400 // ms for one pass
          let start: number | null = null
          let animLine: Polyline | null = null

          const animate = (ts: number) => {
            if (disposal.disposed) return
            if (start === null) start = ts
            const elapsed = ts - start
            const t = Math.min((elapsed % DURATION) / DURATION, 1)
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // ease in-out

            const idx = Math.min(
              Math.floor(eased * (arcPoints.length - 1)),
              arcPoints.length - 1
            )
            dot.setLatLng(arcPoints[idx])

            // Draw the "travelled" portion of the arc in bright white.
            const travelledPts = arcPoints.slice(0, idx + 1)
            if (animLine) {
              animLine.setLatLngs(travelledPts)
            } else if (travelledPts.length > 1) {
              animLine = L.polyline(travelledPts, {
                color: "#ffffff",
                weight: 2.5,
                opacity: 0.7,
                interactive: false,
              }).addTo(map)
            }

            if (elapsed >= DURATION) start = ts
            animFrameRef.current = requestAnimationFrame(animate)
          }

          animFrameRef.current = requestAnimationFrame(animate)
        }
      }

      mapRef.current = map
    }

    void mount()

    return () => {
      disposal.disposed = true
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      const map = mapRef.current
      if (map) {
        map.remove()
        mapRef.current = null
        tileLayerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordKey])

  // Swap tile layer on theme change without remounting the map.
  React.useEffect(() => {
    const map = mapRef.current
    const oldLayer = tileLayerRef.current
    if (!map || !oldLayer) return
    import("leaflet").then((L) => {
      if (!mapRef.current) return
      oldLayer.remove()
      const newLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution,
        subdomains: "abcd",
      })
      newLayer.addTo(map)
      tileLayerRef.current = newLayer
    })
  }, [tileUrl, attribution])

  return (
    <>
      {/* Tooltip label style — injected once */}
      <style>{`
        .leaflet-geospoof-label {
          background: rgba(0,0,0,0.72) !important;
          border: 1px solid rgba(255,255,255,0.18) !important;
          color: #fff !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.04em !important;
          padding: 3px 8px !important;
          border-radius: 6px !important;
          box-shadow: none !important;
          white-space: nowrap !important;
        }
        .leaflet-geospoof-label::before { display: none !important; }
        .gs-sonar-wrap {
          position: relative;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gs-sonar-dot {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4ade80;
          border: 2.5px solid #fff;
          box-shadow: 0 0 0 1px rgba(74,222,128,0.4);
          z-index: 1;
        }
        .gs-sonar-ring {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: transparent;
          border: 2px solid #4ade80;
          animation: gs-sonar-pulse 2s ease-out infinite;
        }
        @keyframes gs-sonar-pulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(3.2); opacity: 0; }
        }
      `}</style>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Map showing ${primary.label}${secondary ? ` and ${secondary.label}` : ""}`}
        className={cn(
          "isolate h-[320px] w-full overflow-hidden rounded-lg border border-(--color-canvas-border) sm:h-[420px] lg:h-[500px]",
          className
        )}
      />
    </>
  )
}
