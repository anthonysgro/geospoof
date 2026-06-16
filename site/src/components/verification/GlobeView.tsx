/**
 * GlobeView — GitHub-inspired 3-D globe for the /verify hero.
 *
 * Design reference: github.blog/engineering/how-we-built-the-github-globe
 *
 * Key techniques from the GitHub globe:
 *   - No photo texture — navy/dark-blue base sphere lit by 4 point lights
 *   - ~12,000 pentagon dots rendering country land masses (via hexPolygons)
 *   - Strong backside atmosphere glow (blue-purple) done via a larger
 *     sphere with atmosphereAltitude + custom color
 *   - Globe bleeds off the bottom-right edge — not fully contained — for drama
 *   - Thin, bright arc with colored endpoints
 *   - Animated rings at both points as "activity" indicators
 *
 * Palette: navy bg, blue-white dots, purple-blue atmosphere, white+green arc
 */

import * as React from "react"
import type { MapPoint } from "./LeafletMap"

interface GlobeViewProps {
  primary: MapPoint | null
  secondary?: MapPoint
  browserTimezone?: string
  ipTimezone?: string
  className?: string
}

interface CountryFeature {
  type: string
  properties: Record<string, unknown>
  geometry: unknown
}

const GREEN  = "#4caf50"   // brand green — browser location + atmosphere
const AMBER  = "#fb923c"   // IP location
const DOT    = "rgba(74,222,128,0.55)"   // brighter green land dots
const ATMOS  = "#4caf50"   // brand green atmosphere glow — not indigo!
const ARC_START = "#4caf50"
const ARC_END   = "#fb923c"

const COUNTRIES_URL =
  "https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson"

// ---------------------------------------------------------------------------
// Spherical midpoint
// ---------------------------------------------------------------------------
function gcMidpoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): { lat: number; lng: number } {
  const r = Math.PI / 180, d = 180 / Math.PI
  const lat1 = a.lat * r, lon1 = a.lon * r
  const lat2 = b.lat * r, lon2 = b.lon * r
  const Bx = Math.cos(lat2) * Math.cos(lon2 - lon1)
  const By = Math.cos(lat2) * Math.sin(lon2 - lon1)
  return {
    lat: Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + Bx) ** 2 + By ** 2)) * d,
    lng: (lon1 + Math.atan2(By, Math.cos(lat1) + Bx)) * d,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GlobeView({ primary, secondary, browserTimezone, ipTimezone, className }: GlobeViewProps) {
  const mountRef = React.useRef<HTMLDivElement>(null)
  const [Globe, setGlobe] = React.useState<React.ElementType | null>(null)
  const [dims, setDims] = React.useState({ width: 0, height: 0 })
  const [countries, setCountries] = React.useState<Array<CountryFeature>>([])

  React.useEffect(() => {
    import("react-globe.gl").then((m) => setGlobe(() => m.default as React.ElementType))
  }, [])

  React.useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setDims({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    fetch(COUNTRIES_URL)
      .then((r) => r.json())
      .then((d: { features: Array<CountryFeature> }) => setCountries(d.features))
      .catch(() => {})
  }, [])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const points = [
    primary   && { lat: primary.lat,   lng: primary.lon,   label: primary.label,   color: GREEN, radius: 0.5 },
    secondary && { lat: secondary.lat, lng: secondary.lon, label: secondary.label, color: AMBER, radius: 0.45 },
  ].filter(Boolean)

  const arcs = primary && secondary ? [{
    startLat: primary.lat, startLng: primary.lon,
    endLat: secondary.lat, endLng: secondary.lon,
  }] : []

  // Sonar rings: green at browser location, amber at IP location
  const rings = [
    (primary  && browserTimezone) && {
      lat: primary.lat,   lng: primary.lon,
      color: (t: number) => `rgba(74,222,128,${Math.max(0, 0.8 - t)})`,
      maxR: 5, propagationSpeed: 2, repeatPeriod: 1000,
    },
    (secondary && ipTimezone) && {
      lat: secondary.lat, lng: secondary.lon,
      color: (t: number) => `rgba(251,146,60,${Math.max(0, 0.8 - t)})`,
      maxR: 5, propagationSpeed: 2, repeatPeriod: 1200,
    },
  ].filter(Boolean)

  // Camera — center between the two points, pull back enough to see both
  const pov = (() => {
    if (primary && secondary) {
      const m = gcMidpoint(primary, secondary)
      return { lat: m.lat, lng: m.lng, altitude: 1.6 }
    }
    if (primary) return { lat: primary.lat, lng: primary.lon, altitude: 1.5 }
    return { lat: 20, lng: 0, altitude: 1.8 }
  })()

  return (
    <div
      ref={mountRef}
      className={className}
      // Deep navy background matching the GitHub globe palette
      style={{ background: "#0d1117", overflow: "hidden" }}
    >
      {Globe && dims.width > 0 ? (
        <Globe
          width={dims.width}
          height={dims.height}
          backgroundColor="rgba(0,0,0,0)"
          // No texture — dark navy sphere; the lighting does the work
          globeImageUrl={null}
          // Strong blue-purple atmosphere glow (the defining GitHub look)
          atmosphereColor={ATMOS}
          atmosphereAltitude={0.45}
          // Country land dots — bright blue-white, high contrast
          hexPolygonsData={countries}
          hexPolygonResolution={3}
          hexPolygonMargin={0.65}
          hexPolygonUseDots={true}
          hexPolygonColor={() => DOT}
          hexPolygonAltitude={0.002}
          // Sonar rings at each timezone location
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
          ringAltitude={0.005}
          // Location points — raised spikes (altitude > 0) like GitHub's spires
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="radius"
          pointAltitude={0.06}
          pointResolution={8}
          // Labels
          labelsData={points}
          labelLat="lat"
          labelLng="lng"
          labelText="label"
          labelColor="color"
          labelSize={1.2}
          labelDotRadius={0.4}
          labelAltitude={0.08}
          // Arc — thin, bright, animated dash
          arcsData={arcs}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor={() => [ARC_START, ARC_END]}
          arcAltitude={0.4}
          arcStroke={0.45}
          arcDashLength={0.3}
          arcDashGap={0.12}
          arcDashAnimateTime={1600}
          // Camera
          pointOfView={pov}
          enablePointerInteraction={true}
          onGlobeReady={function (
            this: { controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean } }
          ) {
            const c = this.controls()
            c.autoRotate = true
            c.autoRotateSpeed = 0.6
            c.enableZoom = false
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-2 border-blue-900 border-t-blue-400" />
        </div>
      )}
    </div>
  )
}
