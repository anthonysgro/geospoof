import * as React from "react"
import { motion } from "motion/react"
import {
  MapPinIcon,
  ClockIcon,
  ShieldIcon,
  RefreshCwIcon,
  GlobeIcon,
  WifiOffIcon,
  BarChart2Icon,
  MegaphoneOffIcon,
} from "lucide-react"
import { Section } from "./Section"
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

const gridItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}
const gridContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

interface Feature {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  colSpan?: 1 | 2
  visual?: React.ReactNode
}

// ── City marquee ──────────────────────────────────────────────────────────────

const CITY_ROWS = [
  [
    "🇫🇷 Paris",
    "🇯🇵 Tokyo",
    "🇺🇸 New York",
    "🇬🇧 London",
    "🇦🇺 Sydney",
    "🇧🇷 São Paulo",
    "🇪🇸 Madrid",
    "🇨🇳 Shanghai",
    "🇷🇺 Moscow",
    "🇹🇭 Bangkok",
  ],
  [
    "🇩🇪 Berlin",
    "🇨🇦 Toronto",
    "🇸🇬 Singapore",
    "🇦🇪 Dubai",
    "🇲🇽 Mexico City",
    "🇰🇷 Seoul",
    "🇵🇹 Lisbon",
    "🇨🇭 Zurich",
    "🇳🇴 Oslo",
    "🇵🇱 Warsaw",
  ],
  [
    "🇮🇹 Rome",
    "🇮🇳 Mumbai",
    "🇿🇦 Cape Town",
    "🇳🇱 Amsterdam",
    "🇦🇷 Buenos Aires",
    "🇸🇪 Stockholm",
    "🇬🇷 Athens",
    "🇹🇷 Istanbul",
    "🇵🇭 Manila",
    "🇨🇴 Bogotá",
  ],
]

function CityRow({
  cities,
  direction,
  duration,
  isPaused,
}: {
  cities: string[]
  direction: "left" | "right"
  duration: number
  isPaused: boolean
}) {
  const doubled = [...cities, ...cities]
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div
        className={cn(
          "flex gap-2 py-1",
          direction === "left" ? "animate-scroll-left" : "animate-scroll-right"
        )}
        style={{
          animationDuration: `${duration}s`,
          animationPlayState: isPaused ? "paused" : "running",
        }}
      >
        {doubled.map((city, i) => (
          <span
            key={i}
            className="rounded-full border border-(--color-canvas-border) bg-(--color-canvas) px-3 py-1.5 text-xs whitespace-nowrap text-(--color-canvas-muted)"
          >
            {city}
          </span>
        ))}
      </div>
    </div>
  )
}

function CoordsVisual() {
  const [isPaused, setIsPaused] = React.useState(false)
  return (
    <div
      className="mt-4 flex flex-col gap-1 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <CityRow
        cities={CITY_ROWS[0]}
        direction="left"
        duration={30}
        isPaused={isPaused}
      />
      <CityRow
        cities={CITY_ROWS[1]}
        direction="right"
        duration={35}
        isPaused={isPaused}
      />
      <CityRow
        cities={CITY_ROWS[2]}
        direction="left"
        duration={28}
        isPaused={isPaused}
      />
    </div>
  )
}

// ── Other visuals ─────────────────────────────────────────────────────────────

function TimezoneVisual() {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {[
        { label: "Intl.DateTimeFormat", value: "Europe/Paris" },
        { label: "getTimezoneOffset()", value: "-60" },
        { label: "Date.toString()", value: "GMT+0100 (CET)" },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-lg bg-(--color-canvas-border)/40 px-3 py-2"
        >
          <span className="font-mono text-xs text-(--color-canvas-muted)">
            {label}
          </span>
          <span className="font-mono text-xs font-semibold text-(--color-brand)">
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

function PrivacyVisual() {
  const items = [
    { icon: <WifiOffIcon className="h-4 w-4" />, label: "No IP leak" },
    { icon: <BarChart2Icon className="h-4 w-4" />, label: "No tracking" },
    { icon: <MegaphoneOffIcon className="h-4 w-4" />, label: "No telemetry" },
  ]
  return (
    <div className="mt-4 flex justify-around">
      {items.map(({ icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-brand)/10 text-(--color-brand)">
            {icon}
          </div>
          <span className="text-xs text-(--color-canvas-muted)">{label}</span>
        </div>
      ))}
    </div>
  )
}

function VpnSyncVisual() {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <div className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas-border)/30 px-4 py-3 text-center">
        <div className="mb-1 text-xs text-(--color-canvas-muted)">VPN exit</div>
        <div className="text-sm font-semibold text-(--color-canvas-foreground)">
          🇩🇪 Frankfurt
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <RefreshCwIcon className="h-4 w-4 text-(--color-brand)" />
        <span className="text-[10px] text-(--color-canvas-muted)">synced</span>
      </div>
      <div className="rounded-xl border border-(--color-brand)/40 bg-(--color-brand)/10 px-4 py-3 text-center">
        <div className="mb-1 text-xs text-(--color-canvas-muted)">Spoofed</div>
        <div className="text-sm font-semibold text-(--color-brand)">
          🇩🇪 Frankfurt
        </div>
      </div>
    </div>
  )
}

function ApiPillsVisual() {
  const apis = [
    "navigator.geolocation",
    "Date.prototype",
    "Intl.DateTimeFormat",
    "Temporal.Now",
    "WebRTC",
  ]
  return (
    <div className="flex flex-wrap gap-2 pt-4 pb-2">
      {apis.map((api) => (
        <span
          key={api}
          className="rounded-full bg-(--color-brand)/10 px-3 py-1 font-mono text-xs font-medium text-(--color-brand)"
        >
          {api}
        </span>
      ))}
      <span className="rounded-full border border-(--color-canvas-border) px-3 py-1 text-xs text-(--color-canvas-muted)">
        & more
      </span>
    </div>
  )
}

// ── Feature data ──────────────────────────────────────────────────────────────

const features: Array<Feature> = [
  {
    id: "geolocation",
    icon: <MapPinIcon className="h-5 w-5" />,
    title: "Location spoofing",
    description:
      "Override navigator.geolocation so websites see your chosen coordinates. Search by city, enter coordinates manually, or sync with your VPN.",
    colSpan: 2,
    visual: <CoordsVisual />,
  },
  {
    id: "timezone",
    icon: <ClockIcon className="h-5 w-5" />,
    title: "Timezone spoofing",
    description:
      "Spoof Date, Intl.DateTimeFormat, and the Temporal API so your timezone matches your chosen location.",
    visual: <TimezoneVisual />,
  },
  {
    id: "webrtc",
    icon: <ShieldIcon className="h-5 w-5" />,
    title: "WebRTC protection",
    description:
      "Prevent IP leaks through WebRTC on Firefox and Chromium using the browser privacy API.",
    visual: <PrivacyVisual />,
  },
  {
    id: "vpn-sync",
    icon: <RefreshCwIcon className="h-5 w-5" />,
    title: "VPN sync",
    description:
      "Detect your VPN exit region automatically and set your spoofed location to match — one click.",
    visual: <VpnSyncVisual />,
  },
  {
    id: "apis",
    icon: <GlobeIcon className="h-5 w-5" />,
    title: "Full API coverage",
    description:
      "Every browser API that leaks your location is covered — injected at document_start before any page script runs.",
    visual: <ApiPillsVisual />,
  },
]

// ── Section ───────────────────────────────────────────────────────────────────

export function FeaturesSection({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = prefersReducedMotion ? "div" : motion.div

  return (
    <Section id="features" className={cn("py-16! md:py-24!", className)}>
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          Features
        </p>
        <h2 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
          Every signal, covered
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-(--color-canvas-muted)">
          Websites use multiple browser APIs to detect your location. GeoSpoof
          overrides all of them — consistently, before any page script runs.
        </p>
      </div>

      <MotionDiv
        {...(!prefersReducedMotion && {
          initial: "hidden",
          whileInView: "visible",
          viewport: { once: true, margin: "-50px" },
          variants: gridContainerVariants,
        })}
      >
        <BentoGrid columns={3}>
          {features.map((feature) => (
            <BentoGridItem key={feature.id} colSpan={feature.colSpan ?? 1}>
              <MotionDiv
                className="h-full"
                {...(!prefersReducedMotion && { variants: gridItemVariants })}
              >
                <Card
                  className={cn(
                    "h-full border border-(--color-canvas-border) bg-(--color-canvas) shadow-none",
                    "transition-all duration-200 hover:border-(--color-brand)/40 hover:shadow-md"
                  )}
                >
                  <CardHeader>
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--color-brand)/10 text-(--color-brand)">
                      {feature.icon}
                    </div>
                    <CardTitle className="text-base font-semibold text-(--color-canvas-foreground)">
                      {feature.title}
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed text-(--color-canvas-muted)">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  {feature.visual && (
                    <CardContent>{feature.visual}</CardContent>
                  )}
                </Card>
              </MotionDiv>
            </BentoGridItem>
          ))}
        </BentoGrid>
      </MotionDiv>
    </Section>
  )
}
