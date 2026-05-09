import * as React from "react"

/**
 * Local-time field of the Identity Panel.
 *
 * Owns a local `tick` state and a 1-second interval so only this field
 * re-renders every second — the rest of the panel stays still. All
 * `Date` access is gated behind a `mounted` flag so SSR emits a blank
 * placeholder and the first render after hydration matches.
 */
export function LocalTimeField() {
  const [mounted, setMounted] = React.useState(false)
  // Used only to force a re-render every second. The value itself is
  // never read by the renderer — the computed strings below are derived
  // from `new Date()` at render time.
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    setMounted(true)
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  let timeStr = ""
  let dateStr = ""
  let epoch = 0
  if (mounted) {
    const now = new Date()
    timeStr = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    })
    dateStr = now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    epoch = Date.now()
  }

  return (
    <div role="group" aria-labelledby="id-localtime-label">
      <dt
        id="id-localtime-label"
        className="text-sm font-medium text-(--color-canvas-foreground)"
      >
        Local time
      </dt>
      <dd className="mt-2 font-mono text-base text-(--color-canvas-foreground)">
        {mounted ? timeStr : "\u00a0"}
      </dd>
      <dd className="mt-1 text-xs text-(--color-canvas-muted)">
        {mounted ? dateStr : "\u00a0"}
      </dd>
      <dd className="mt-2 font-mono text-xs break-all text-(--color-canvas-muted)">
        Epoch (ms): {mounted ? epoch : "\u00a0"}
      </dd>
    </div>
  )
}
