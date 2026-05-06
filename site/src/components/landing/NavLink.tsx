import * as React from "react"
import { cn } from "@/lib/utils"

export interface NavLinkProps {
  href: string
  children: React.ReactNode
  isActive?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  className?: string
}

export function NavLink({
  href,
  children,
  isActive = false,
  onClick,
  className,
}: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "text-body-base font-medium",
        isActive
          ? "text-(--color-canvas-foreground)"
          : "text-(--color-canvas-muted)",
        "transition-all duration-200",
        "hover:text-(--color-canvas-foreground)",
        "relative",
        "after:absolute after:bottom-0 after:left-0 after:h-px",
        "after:bg-(--color-canvas-foreground)",
        "after:transition-all after:duration-200",
        isActive ? "after:w-full" : "after:w-0 hover:after:w-full",
        "focus:outline-none focus-visible:text-(--color-canvas-foreground) focus-visible:after:w-full",
        "py-2",
        className
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </a>
  )
}
