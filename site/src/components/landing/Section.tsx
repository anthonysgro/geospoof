import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionProps extends React.ComponentProps<"section"> {
  narrow?: boolean
  /**
   * Extra classes for the inner width-constraining track. `className` lands on
   * the outer `<section>`, so this is the only way to change the content width.
   *
   * Body sections should not need it — 1200px (`max-w-300` at the 100% root) is
   * the reading measure for the whole site. It exists for display content like
   * the hero, which is not prose and can run wider on large canvases.
   */
  innerClassName?: string
}

export function Section({
  className,
  narrow = false,
  innerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn("py-24", "px-6 md:px-12 lg:px-16", className)}
      {...props}
    >
      <div
        className={cn(
          "mx-auto w-full",
          narrow ? "max-w-180" : "max-w-300",
          innerClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
