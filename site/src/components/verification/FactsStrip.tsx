import * as React from "react"

import { BrowserCapabilitiesSection } from "./BrowserCapabilitiesSection"
import { StatusPill } from "./StatusPill"
import { Skeleton } from "@/components/ui/skeleton"
import { useIdentity } from "@/lib/verification/identity-context"
import { formatOffset } from "@/lib/verification/format"

/**
 * Compact "browser facts at a glance" row.
 *
 * Renders timezone, local time, language, platform, and APIs-available
 * as five stacked fields in a horizontal grid on lg, collapsing to two
 * columns on md and one column on mobile.
 *
 * Each field shows one primary value and one muted secondary caption.
 * The full detail for every surface lives in the Observed Values
 * accordion below — this strip is for the "90% of what a visitor needs
 * to see at-a-glance" subset.
 */
export function FactsStrip() {
  const { snapshot } = useIdentity()
  const { timezone, language, platform, features } = snapshot

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
      <Cell label="Timezone">
        {!features.intlDateTimeFormat || timezone.identifier === "" ? (
          <Primary>Unavailable</Primary>
        ) : (
          <>
            <Primary>{timezone.identifier}</Primary>
            <Caption>
              UTC{formatOffset(timezone.offsetMinutes)}
              {timezone.dstActive ? (
                <>
                  {" · "}
                  <StatusPill tone="info" className="ml-0.5 align-middle">
                    DST
                  </StatusPill>
                </>
              ) : null}
            </Caption>
          </>
        )}
      </Cell>

      <Cell label="Local time">
        <LiveClock fallbackHidden={!features.intlDateTimeFormat} />
      </Cell>

      <Cell label="Language">
        <Primary>{language.primary || "—"}</Primary>
        {language.intlLocale ? (
          <Caption>Intl locale: {language.intlLocale}</Caption>
        ) : null}
      </Cell>

      <Cell label="Platform">
        {platform.status === "pending" || !platform.value ? (
          <Skeleton className="mt-1 h-5 w-36" />
        ) : (
          <>
            <Primary className="text-sm sm:text-base">
              {platform.value.label}
            </Primary>
            {platform.value.hardwareConcurrency != null ? (
              <Caption>
                {platform.value.hardwareConcurrency} logical cores
              </Caption>
            ) : null}
          </>
        )}
      </Cell>

      <Cell label="APIs available">
        <BrowserCapabilitiesSection />
      </Cell>
    </dl>
  )
}

/**
 * Single vertical cell within the facts strip. Renders a consistent
 * uppercase label and a children slot for the value(s).
 */
function Cell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const id = `facts-${label.replace(/\s+/g, "-").toLowerCase()}`
  return (
    <div role="group" aria-labelledby={id} className="min-w-0">
      <dt
        id={id}
        className="mb-1.5 text-[11px] font-medium tracking-wide text-(--color-canvas-muted) uppercase"
      >
        {label}
      </dt>
      {children}
    </div>
  )
}

function Primary({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <dd
      className={
        "font-mono text-base text-(--color-canvas-foreground)" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </dd>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <dd className="mt-1 text-xs text-(--color-canvas-muted)">{children}</dd>
  )
}

/**
 * Ticking clock. Owns its own interval so only this cell re-renders
 * every second — the rest of the facts strip stays still.
 */
function LiveClock({ fallbackHidden }: { fallbackHidden: boolean }) {
  const [mounted, setMounted] = React.useState(false)
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    setMounted(true)
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  if (fallbackHidden) {
    return <Primary>Unavailable</Primary>
  }

  if (!mounted) {
    return (
      <>
        <Skeleton className="h-5 w-24" />
        <dd className="mt-1">
          <Skeleton className="h-3.5 w-32" />
        </dd>
      </>
    )
  }

  const now = new Date()
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  })
  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  return (
    <>
      <Primary>{time}</Primary>
      <Caption>{date}</Caption>
    </>
  )
}
