import * as React from "react"
import { useRouterState } from "@tanstack/react-router"
import { CheckIcon, GlobeIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDictionary,
  hasLocalizedVariants,
  localeFromPathname,
  localeNames,
  localeShortLabels,
  locales,
  stripLocalePrefix,
} from "@/lib/i18n"
import { useSuggestedLocale, useTranslations } from "@/hooks/use-i18n"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { LocaleLink } from "@/components/LocaleLink"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Show the "you might prefer X" nudge at most once per browser. */
const SUGGESTION_DISMISSED_KEY = "gs-lang-suggestion-dismissed"

function readDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(SUGGESTION_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Language picker (globe trigger + dropdown of languages).
 *
 * Built on the shadcn DropdownMenu so it scales past two languages. Per
 * multilingual-SEO guidance we never auto-redirect by `Accept-Language`; the
 * user chooses here, and each option is a real `<Link>` (crawlable anchor when
 * open, with an `hreflang` hint). The switcher hides itself on routes that
 * don't yet have translations so it never links to a 404.
 *
 * Language nudge: if the visitor's browser prefers a language we support that
 * differs from what they're viewing, the globe gets a one-time highlight + a
 * small hint bubble (phrased in the offered language). It's fully generic —
 * driven by `useSuggestedLocale`, no per-language code — and never
 * auto-redirects. Dismissed on first interaction and remembered per browser.
 *
 * Note: the dropdown content is portaled (not in the DOM until opened), so
 * localized routes are enumerated under `pages` in `vite.config.ts` to keep
 * them prerenderable without relying on a static anchor.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { t } = useTranslations()
  const suggestedLocale = useSuggestedLocale()
  const prefersReducedMotion = useReducedMotion()
  const [dismissed, setDismissed] = React.useState(readDismissed)

  const activeLocale = localeFromPathname(pathname)
  const basePath = stripLocalePrefix(pathname)

  // Only show where every locale has a translated page.
  if (!hasLocalizedVariants(pathname)) return null

  const showNudge = suggestedLocale !== null && !dismissed
  // When nudging, this is the locale to offer (narrowed for the bubble below).
  const nudgeLocale = showNudge ? suggestedLocale : null

  const dismissNudge = () => {
    setDismissed(true)
    try {
      localStorage.setItem(SUGGESTION_DISMISSED_KEY, "1")
    } catch {
      /* storage unavailable — dismiss for this session only */
    }
  }

  return (
    <div className={cn("relative", className)}>
      <DropdownMenu
        onOpenChange={(open) => {
          // Opening the picker counts as acknowledging the nudge.
          if (open && showNudge) dismissNudge()
        }}
      >
        <DropdownMenuTrigger
          aria-label={t.languageSwitcher.label}
          className={cn(
            "relative inline-flex items-center gap-1.5",
            "h-10 min-h-[44px] rounded-(--radius-brand) px-2.5",
            "text-sm font-medium transition-all duration-200",
            "hover:bg-canvas-muted/10 hover:text-(--color-canvas-foreground)",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
            "data-[state=open]:text-(--color-canvas-foreground)",
            showNudge ? "text-(--color-brand)" : "text-(--color-canvas-muted)"
          )}
        >
          <GlobeIcon className="h-5 w-5" aria-hidden="true" />
          <span>{localeShortLabels[activeLocale]}</span>

          {/* Attention dot — pings unless reduced motion is requested. */}
          {showNudge ? (
            <span
              className="absolute -top-0.5 -right-0.5 flex size-2.5"
              aria-hidden="true"
            >
              {!prefersReducedMotion ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-brand) opacity-75" />
              ) : null}
              <span className="relative inline-flex size-2.5 rounded-full bg-(--color-brand)" />
            </span>
          ) : null}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>{t.languageSwitcher.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {locales.map((locale) => {
            const isActive = locale === activeLocale
            return (
              <DropdownMenuItem key={locale} asChild>
                <LocaleLink
                  to={basePath}
                  locale={locale}
                  hrefLang={locale}
                  aria-current={isActive ? "true" : undefined}
                  className="flex items-center justify-between gap-6"
                >
                  <span
                    className={cn(
                      isActive && "font-medium text-(--color-canvas-foreground)"
                    )}
                  >
                    {localeNames[locale]}
                  </span>
                  {isActive ? (
                    <CheckIcon
                      className="h-4 w-4 text-(--color-brand)"
                      aria-hidden="true"
                    />
                  ) : null}
                </LocaleLink>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* One-time language suggestion bubble, anchored under the trigger. */}
      {nudgeLocale ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "absolute top-full right-0 z-50 mt-2 w-64",
            "rounded-md border border-(--color-canvas-border) bg-popover p-3",
            "text-popover-foreground shadow-md ring-1 ring-foreground/10"
          )}
        >
          {(() => {
            // Copy is phrased in the offered language.
            const d = getDictionary(nudgeLocale)
            return (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-(--color-canvas-foreground)">
                    {d.languageSwitcher.suggestion}
                  </p>
                  <button
                    type="button"
                    onClick={dismissNudge}
                    aria-label={d.languageSwitcher.dismiss}
                    className="shrink-0 text-(--color-canvas-muted) transition-colors hover:text-(--color-canvas-foreground)"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
                <LocaleLink
                  to={basePath}
                  locale={nudgeLocale}
                  hrefLang={nudgeLocale}
                  onClick={dismissNudge}
                  className={cn(
                    "mt-2.5 inline-flex min-h-9 w-full items-center justify-center rounded-lg px-3",
                    "bg-(--color-brand) text-sm font-semibold text-white",
                    "transition-colors hover:bg-(--color-brand-dark)"
                  )}
                >
                  {d.languageSwitcher.switchAction}
                </LocaleLink>
              </>
            )
          })()}
        </div>
      ) : null}
    </div>
  )
}
