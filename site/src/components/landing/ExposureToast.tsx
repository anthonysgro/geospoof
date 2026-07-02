import * as React from "react"
import { toast } from "sonner"
import { ClockIcon, MapPinIcon, RadioIcon, XIcon } from "lucide-react"
import { usePlatform } from "@/hooks/use-platform"
import { getStoreLink } from "@/lib/store-links"
import {
  resolveNetworkIdentity,
  timezoneContinent,
} from "@/lib/verification/network-identity"
import { readWorkerTimezone } from "@/lib/verification/worker-probe"
import { probeWebrtc } from "@/lib/verification/webrtc-probe"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/hooks/use-i18n"
import { LocaleLink } from "@/components/LocaleLink"

const STORAGE_KEY = "gs-exposure-toast-shown"
const REVEAL_DELAY_MS = 1400

type WebRtcState = "leak" | "clean" | "unsupported"

interface Exposure {
  city: string | null
  country: string | null
  ip: string | null
  timezone: string
  /** IANA timezone the visitor's IP geolocates to, when known. */
  ipTimezone: string | null
  /** WebRTC public-IP leak status. */
  webrtc: WebRtcState
}

/**
 * Mask an IP for display — enough to prove "we can see it" without showing the
 * full address (less invasive, safe to screenshot). IPv4 keeps the first two
 * octets; IPv6 keeps the first two groups.
 */
function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean)
    return `${groups.slice(0, 2).join(":")}:•:•`
  }
  const octets = ip.split(".")
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.•.•`
  return ip
}

/**
 * Does the system timezone agree with where the IP says the visitor is?
 *  - "leak"       → they disagree (a real location inconsistency)
 *  - "consistent" → they agree
 *  - "unknown"    → not enough data to tell (no IP timezone)
 */
function consistencyStatus(
  systemTz: string,
  ipTz: string | null
): "leak" | "consistent" | "unknown" {
  if (!ipTz) return "unknown"
  if (ipTz === systemTz) return "consistent"
  return timezoneContinent(ipTz) === timezoneContinent(systemTz)
    ? "consistent"
    : "leak"
}

function Row({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex h-6 items-center gap-2.5 sm:h-7">
      <span className="flex w-4 justify-center text-(--color-canvas-muted)">
        {icon}
      </span>
      <span className="text-xs text-(--color-canvas-muted)">{label}</span>
      <span
        className={cn(
          "ml-auto font-mono text-xs font-semibold text-(--color-canvas-foreground)",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ExposureCard({
  data,
  toastId,
}: {
  data: Exposure
  toastId: string | number
}) {
  const platform = usePlatform()
  const store = getStoreLink(platform, "exposure-toast")
  const { t } = useTranslations()

  const place =
    data.city && data.country
      ? `${data.city}, ${data.country}`
      : (data.country ?? t.exposureToast.yourArea)

  const status = consistencyStatus(data.timezone, data.ipTimezone)
  const webrtcLeak = data.webrtc === "leak"
  const flagged = status === "leak" || webrtcLeak

  const pill = flagged
    ? {
        label: t.exposureToast.exposed,
        dot: "bg-amber-500",
        text: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-500/12",
      }
    : {
        label: t.exposureToast.visibleToSites,
        dot: "bg-rose-500",
        text: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-500/12",
      }

  return (
    <div
      className={cn(
        "relative mx-auto w-90 max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-lg sm:p-4",
        "border-(--color-canvas-border) bg-(--color-canvas)"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-(--color-canvas-muted) uppercase">
          {t.exposureToast.header}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              pill.bg,
              pill.text
            )}
          >
            <span className={cn("size-1.5 rounded-full", pill.dot)} />
            {pill.label}
          </span>
          <button
            type="button"
            aria-label={t.exposureToast.dismiss}
            onClick={() => toast.dismiss(toastId)}
            className="text-(--color-canvas-muted) transition-colors hover:text-(--color-canvas-foreground)"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col sm:mt-3">
        <Row
          icon={<MapPinIcon className="size-3.5" />}
          label={t.exposureToast.location}
          value={place}
        />
        <Row
          icon={<ClockIcon className="size-3.5" />}
          label={t.exposureToast.timezone}
          value={data.timezone}
        />
        {data.ip ? (
          <div className="hidden sm:contents">
            <Row
              icon={<span className="font-mono text-[11px]">IP</span>}
              label={t.exposureToast.address}
              value={maskIp(data.ip)}
            />
          </div>
        ) : null}
        {data.webrtc !== "unsupported" ? (
          <Row
            icon={<RadioIcon className="size-3.5" />}
            label={t.exposureToast.webrtc}
            value={
              webrtcLeak
                ? t.exposureToast.publicIpLeaking
                : t.exposureToast.noLeak
            }
            valueClassName={
              webrtcLeak ? "text-amber-600 dark:text-amber-400" : undefined
            }
          />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3 sm:mt-3.5">
        <a
          href={store ? store.href : "#download"}
          target={store ? "_blank" : undefined}
          rel={store ? "noopener noreferrer" : undefined}
          onClick={() => toast.dismiss(toastId)}
          className={cn(
            "inline-flex min-h-9 flex-1 items-center justify-center rounded-lg px-4",
            "bg-(--color-brand) text-sm font-semibold text-white",
            "transition-colors hover:bg-(--color-brand-dark)"
          )}
        >
          {store ? t.exposureToast.hideMyLocation : t.exposureToast.getGeospoof}
        </a>
        <LocaleLink
          to="/verify"
          onClick={() => toast.dismiss(toastId)}
          className="text-xs font-medium text-(--color-canvas-muted) underline-offset-4 hover:text-(--color-canvas-foreground) hover:underline"
        >
          {t.exposureToast.fullReport} →
        </LocaleLink>
      </div>
    </div>
  )
}

/**
 * Experimental "lead with the threat" widget. On the homepage, after a short
 * beat, it reveals what the page can passively detect about the visitor
 * (IP geo, ISP, timezone, language — no permission prompt) as a bottom-right
 * sonner toast, then nudges to install. Renders nothing itself.
 */
export function ExposureToast() {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    // Show at most once per browser (persists across sessions).
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch {
      /* storage unavailable — fall through and show once */
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      // Read the timezone from a Blob-URL Worker — survives naive main-thread
      // spoofers — falling back to the main-thread reading if workers fail.
      const mainTz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown"

      // Run the network lookup, worker-tz probe and the full WebRTC leak probe
      // (SDP candidates + getStats() + iframe realm) together.
      const webrtcSupported = typeof RTCPeerConnection !== "undefined"
      const [net, workerTz, webrtcResult] = await Promise.all([
        resolveNetworkIdentity().catch(() => null),
        readWorkerTimezone(),
        webrtcSupported
          ? probeWebrtc().catch(() => null)
          : Promise.resolve(null),
      ])
      if (cancelled) return

      const webrtc: WebRtcState = !webrtcSupported
        ? "unsupported"
        : webrtcResult && webrtcResult.publicIps.length > 0
          ? "leak"
          : "clean"

      const data: Exposure = {
        city: net?.city || null,
        country: net?.countryName || null,
        ip: net?.ip || null,
        timezone: workerTz ?? mainTz,
        ipTimezone: net?.timezone || null,
        webrtc,
      }

      try {
        localStorage.setItem(STORAGE_KEY, "1")
      } catch {
        /* ignore */
      }
      toast.custom((id) => <ExposureCard data={data} toastId={id} />, {
        duration: Infinity,
      })
    }, REVEAL_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return null
}
