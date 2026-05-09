import { useIdentity } from "@/lib/verification/identity-context"

/**
 * Platform field of the Identity Panel.
 *
 * The primary label comes from the provider synchronously (even for the
 * `uaDataAvailable: false` case, via `parseUserAgentSummary`). Secondary
 * high-entropy lines stream in when `getHighEntropyValues` resolves. On
 * high-entropy failure the provider keeps `status: "ready"` and sets
 * `error` to a message — we surface that as "High-entropy values
 * unavailable" without unmounting the field (Req 20.2).
 */
export function PlatformField() {
  const { snapshot } = useIdentity()
  const { platform } = snapshot

  const isPending = platform.status === "pending"
  const value = platform.value
  const highEntropyFailed =
    platform.status === "ready" && platform.error !== null

  return (
    <div role="group" aria-labelledby="id-platform-label">
      <dt
        id="id-platform-label"
        className="text-sm font-medium text-(--color-canvas-foreground)"
      >
        Platform
      </dt>

      {isPending || !value ? (
        <dd
          className="mt-2 h-5 w-48 animate-pulse rounded bg-(--color-canvas-border)"
          aria-hidden="true"
        />
      ) : (
        <dd className="mt-2 text-base text-(--color-canvas-foreground)">
          {value.label}
        </dd>
      )}

      {value && highEntropyFailed ? (
        <dd className="mt-1 text-xs text-(--color-canvas-muted)">
          High-entropy values unavailable
        </dd>
      ) : null}

      {value && !highEntropyFailed ? (
        <>
          {value.platform ? (
            <dd className="mt-1 text-xs text-(--color-canvas-muted)">
              Platform:{" "}
              <span className="font-mono text-(--color-canvas-foreground)">
                {value.platform}
              </span>
            </dd>
          ) : null}
          {value.platformVersion ? (
            <dd className="mt-1 text-xs text-(--color-canvas-muted)">
              Version:{" "}
              <span className="font-mono text-(--color-canvas-foreground)">
                {value.platformVersion}
              </span>
            </dd>
          ) : null}
          {value.architecture ? (
            <dd className="mt-1 text-xs text-(--color-canvas-muted)">
              Architecture:{" "}
              <span className="font-mono text-(--color-canvas-foreground)">
                {value.architecture}
              </span>
            </dd>
          ) : null}
        </>
      ) : null}

      {value && value.hardwareConcurrency != null ? (
        <dd className="mt-1 text-xs text-(--color-canvas-muted)">
          Logical CPU cores:{" "}
          <span className="font-mono text-(--color-canvas-foreground)">
            {value.hardwareConcurrency}
          </span>
        </dd>
      ) : null}
    </div>
  )
}
