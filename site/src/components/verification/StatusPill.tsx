import * as React from "react"
import { CheckCircle2, Info, MinusCircle, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Visual tone of the pill. The Identity Panel, the Verification
 * Summary headline, and any other dashboard surface that needs an
 * inline status indicator share this tone language.
 */
export type StatusPillTone = "pass" | "fail" | "muted" | "info"

interface StatusPillProps {
  tone: StatusPillTone
  children: React.ReactNode
  /** Optional override icon. When omitted a sensible default per tone is used. */
  icon?: React.ReactNode
  className?: string
}

const TONE_CLASSES: Record<StatusPillTone, string> = {
  pass: "bg-(--color-brand)/10 text-(--color-brand) border-(--color-brand)/20",
  fail: "bg-destructive/10 text-destructive border-destructive/20",
  muted:
    "bg-(--color-canvas-border) text-(--color-canvas-muted) border-(--color-canvas-border)",
  info: "bg-(--color-canvas-border)/50 text-(--color-canvas-foreground) border-(--color-canvas-border)",
}

/**
 * Default icon per tone. Every pill renders an icon alongside its text so
 * the status is never conveyed by colour alone (Req 18.7). The text
 * itself carries the meaning for assistive tech, so the icon is marked
 * `aria-hidden="true"`.
 */
const DEFAULT_ICONS: Record<StatusPillTone, React.ReactNode> = {
  pass: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  fail: <XCircle className="size-3.5" aria-hidden="true" />,
  muted: <MinusCircle className="size-3.5" aria-hidden="true" />,
  info: <Info className="size-3.5" aria-hidden="true" />,
}

/**
 * Small status pill used by the Identity Panel's Feature Availability,
 * Timezone (DST), and any other field that needs to surface an inline
 * status indicator.
 */
export function StatusPill({
  tone,
  children,
  icon,
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon ?? DEFAULT_ICONS[tone]}
      <span>{children}</span>
    </span>
  )
}
