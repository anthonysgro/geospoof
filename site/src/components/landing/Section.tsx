import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionProps extends React.ComponentProps<"section"> {
  narrow?: boolean
}

export function Section({
  className,
  narrow = false,
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
          narrow ? "max-w-[720px]" : "max-w-[1200px]"
        )}
      >
        {children}
      </div>
    </section>
  )
}
