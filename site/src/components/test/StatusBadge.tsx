import { cn } from "@/lib/utils"
import type { TestStatus } from "@/lib/test-suite/types"

const STATUS_META: Record<
  TestStatus,
  { label: string; className: string }
> = {
  pass: {
    label: "Pass",
    className:
      "bg-(--color-brand)/10 text-(--color-brand) border-(--color-brand)/20",
  },
  fail: {
    label: "Fail",
    className:
      "bg-destructive/10 text-destructive border-destructive/20",
  },
  "known-limitation": {
    label: "Known limitation",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  error: {
    label: "Error",
    className:
      "bg-destructive/10 text-destructive border-destructive/20",
  },
  pending: {
    label: "Running…",
    className:
      "bg-(--color-canvas-border) text-(--color-canvas-muted) border-(--color-canvas-border)",
  },
}

export function StatusBadge({
  status,
  className,
}: {
  status: TestStatus
  className?: string
}) {
  const { label, className: statusClassName } = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        statusClassName,
        className
      )}
    >
      {label}
    </span>
  )
}
