import { Info } from "lucide-react"

import { LeafletMap } from "./LeafletMap"
import { Button } from "@/components/ui/button"
import { useIdentity } from "@/lib/verification/identity-context"
import {
  formatSignedLat,
  formatSignedLon,
  osmUrl,
} from "@/lib/verification/format"

/**
 * The exact string the provider emits when `navigator.geolocation` is
 * undefined. Rendering the literal here keeps the parse path simple —
 * we don't try to map an imaginary numeric code to it.
 */
const GEOLOCATION_UNAVAILABLE = "Geolocation API unavailable"

interface ParsedError {
  /** One of the `PositionError.code` values, or null when not prefixed. */
  code: 1 | 2 | 3 | null
  /** Tail message after the `"<code>: "` prefix, or the original string. */
  message: string
}

/**
 * The identity provider wraps geolocation errors as `"<code>: <message>"`.
 * Split the leading numeric code out so the UI can pick the right copy
 * and decide whether to show a retry button.
 */
function parseLocationError(raw: string): ParsedError {
  const match = /^(\d+):\s*(.*)$/.exec(raw)
  if (!match) {
    return { code: null, message: raw }
  }
  const codeNum = Number(match[1])
  if (codeNum === 1 || codeNum === 2 || codeNum === 3) {
    return { code: codeNum, message: match[2] }
  }
  return { code: null, message: match[2] || raw }
}

/**
 * Describe the error situation in user-facing terms and decide whether a
 * retry button should be rendered.
 */
function describeError(raw: string): {
  headline: string
  body: string
  retryLabel: string | null
} {
  if (raw === GEOLOCATION_UNAVAILABLE) {
    return {
      headline: GEOLOCATION_UNAVAILABLE,
      body: "This browser does not expose the geolocation API, so the dashboard cannot read a location.",
      retryLabel: null,
    }
  }

  const { code, message } = parseLocationError(raw)

  if (code === 1) {
    return {
      headline: "Permission denied — browser blocked location access",
      body:
        message ||
        "The browser blocked the permission request before GeoSpoof could answer.",
      retryLabel: "Request permission again",
    }
  }
  if (code === 2) {
    return {
      headline: "Location unavailable",
      body:
        message ||
        "The browser could not determine a position (POSITION_UNAVAILABLE).",
      retryLabel: "Try again",
    }
  }
  if (code === 3) {
    return {
      headline: "Location request timed out",
      body:
        message ||
        "The geolocation request did not return within the allowed time (TIMEOUT).",
      retryLabel: "Try again",
    }
  }
  return {
    headline: "Location unavailable",
    body: message || raw,
    retryLabel: "Try again",
  }
}

/**
 * Skeleton rendered while `location.status === "pending"`. Matches the
 * rough height of the hydrated content so cumulative layout shift on
 * resolution stays close to zero.
 */
function LocationSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-[340px] w-full animate-pulse rounded-lg bg-(--color-canvas-border) sm:h-[400px] lg:h-[460px]" />
      <div className="h-5 w-64 animate-pulse rounded bg-(--color-canvas-border)" />
      <div className="h-4 w-40 animate-pulse rounded bg-(--color-canvas-border)" />
    </div>
  )
}

/**
 * Location field of the Identity Panel.
 *
 * Reads the shared identity snapshot and renders the pending/error/ready
 * state without issuing its own geolocation calls — the provider is the
 * single source of truth for `navigator.geolocation.getCurrentPosition`.
 */
export function LocationField() {
  const { snapshot, refresh } = useIdentity()
  const { location } = snapshot

  return (
    <div role="group" aria-labelledby="id-location-label">
      <dt
        id="id-location-label"
        className="mb-3 text-xs font-medium tracking-wide text-(--color-canvas-muted) uppercase"
      >
        Location
      </dt>

      {location.status === "pending" ? (
        <dd className="mt-2">
          <LocationSkeleton />
        </dd>
      ) : null}

      {location.status === "error" ? (
        <LocationError error={location.error ?? ""} onRetry={refresh} />
      ) : null}

      {location.status === "ready" && location.value ? (
        <LocationReady
          latitude={location.value.latitude}
          longitude={location.value.longitude}
          accuracy={location.value.accuracy}
        />
      ) : null}
    </div>
  )
}

interface LocationErrorProps {
  error: string
  onRetry: () => void
}

function LocationError({ error, onRetry }: LocationErrorProps) {
  const { headline, body, retryLabel } = describeError(error)

  return (
    <>
      <dd className="mt-2 flex items-start gap-2 text-sm text-(--color-canvas-foreground)">
        <Info
          className="mt-0.5 size-4 shrink-0 text-(--color-canvas-muted)"
          aria-hidden="true"
        />
        <span>{headline}</span>
      </dd>
      <dd className="mt-1 text-xs text-(--color-canvas-muted)">{body}</dd>
      {retryLabel ? (
        <dd className="mt-3">
          <Button type="button" variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </dd>
      ) : null}
    </>
  )
}

interface LocationReadyProps {
  latitude: number
  longitude: number
  accuracy: number | null
}

function LocationReady({ latitude, longitude, accuracy }: LocationReadyProps) {
  return (
    <>
      {/* Map leads as the hero visual. */}
      <dd>
        <LeafletMap lat={latitude} lon={longitude} />
      </dd>

      {/* Coordinate strip beneath the map. */}
      <dd className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xl text-(--color-canvas-foreground)">
          {formatSignedLat(latitude)} {formatSignedLon(longitude)}
        </span>
        <a
          href={osmUrl(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-(--color-brand) underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          View on OpenStreetMap →
        </a>
      </dd>

      {/* Supporting meta row — accuracy + tile privacy note on one line. */}
      <dd className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-canvas-muted)">
        {accuracy != null ? (
          <>
            <span>Accuracy {Math.round(accuracy)} m</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>
          Map tiles load from openstreetmap.org. Your coordinates are sent to
          that service as part of the tile request.
        </span>
      </dd>
    </>
  )
}
