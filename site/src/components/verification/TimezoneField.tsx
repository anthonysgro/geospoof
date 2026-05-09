import { StatusPill } from "./StatusPill"
import { useIdentity } from "@/lib/verification/identity-context"
import { formatOffset } from "@/lib/verification/format"

/**
 * Timezone field of the Identity Panel.
 *
 * All values come from the shared identity snapshot resolved synchronously
 * by the identity provider — nothing here reads `Intl` or `Date` directly.
 */
export function TimezoneField() {
  const { snapshot } = useIdentity()
  const { timezone, features } = snapshot

  return (
    <div role="group" aria-labelledby="id-tz-label">
      <dt
        id="id-tz-label"
        className="text-sm font-medium text-(--color-canvas-foreground)"
      >
        Timezone
      </dt>

      {!features.intlDateTimeFormat ? (
        <dd className="mt-2 text-sm text-(--color-canvas-foreground)">
          Intl API unavailable
        </dd>
      ) : timezone.identifier === "" ? (
        <dd className="mt-2 text-sm text-(--color-canvas-foreground)">
          Timezone not reported by browser
        </dd>
      ) : (
        <>
          <dd className="mt-2 font-mono text-base text-(--color-canvas-foreground)">
            {timezone.identifier}
          </dd>
          <dd className="mt-1 text-xs text-(--color-canvas-muted)">
            UTC{formatOffset(timezone.offsetMinutes)}
            {timezone.longName ? ` · ${timezone.longName}` : null}
          </dd>
          <dd className="mt-2">
            <StatusPill tone={timezone.dstActive ? "info" : "muted"}>
              DST {timezone.dstActive ? "active" : "not active"}
            </StatusPill>
          </dd>
        </>
      )}
    </div>
  )
}
