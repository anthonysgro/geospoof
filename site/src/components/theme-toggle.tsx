import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTranslations } from "@/hooks/use-i18n"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const prefersReducedMotion = useReducedMotion()
  const { t } = useTranslations()
  const [announcement, setAnnouncement] = React.useState("")
  const isDark = resolvedTheme === "dark"

  const handleToggle = React.useCallback(() => {
    const newTheme = isDark ? "light" : "dark"
    setTheme(newTheme)
    setAnnouncement(
      newTheme === "dark"
        ? t.themeToggle.changedToDark
        : t.themeToggle.changedToLight
    )
    setTimeout(() => setAnnouncement(""), 1000)
  }, [isDark, setTheme, t])

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "inline-flex items-center justify-center",
          "h-11 min-h-[44px] w-11 min-w-[44px]",
          "rounded-[var(--radius-brand)]",
          "text-(--color-canvas-muted)",
          "hover:bg-(--color-canvas-muted)/10 hover:text-(--color-canvas-foreground)",
          "cursor-pointer transition-all duration-200",
          prefersReducedMotion && "transition-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
          className
        )}
        aria-label={isDark ? t.themeToggle.switchToLight : t.themeToggle.switchToDark}
      >
        {isDark ? (
          <Sun className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Moon className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </>
  )
}
