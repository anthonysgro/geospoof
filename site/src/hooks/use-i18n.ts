import * as React from "react"
import { useRouterState } from "@tanstack/react-router"
import type { Dictionary, Locale } from "@/lib/i18n"
import {
  detectPreferredLocale,
  getDictionary,
  localeFromPathname,
} from "@/lib/i18n"

/**
 * The active locale, derived from the current URL pathname.
 *
 * English pages (no `/fr` prefix) resolve to "en" automatically, so components
 * shared across the site — Navigation, Footer — get the right locale without
 * any per-route wiring. Works identically on the server (SSR/prerender) and
 * the client because it reads from router state, not `window`.
 */
export function useLocale(): Locale {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })
  return localeFromPathname(pathname)
}

/**
 * Convenience hook returning the active locale and its message dictionary.
 *
 * ```tsx
 * const { locale, t } = useTranslations()
 * <button>{t.nav.download}</button>
 * ```
 */
export function useTranslations(): { locale: Locale; t: Dictionary } {
  const locale = useLocale()
  return { locale, t: getDictionary(locale) }
}

/**
 * The locale the visitor likely prefers (from `navigator.languages`) when it
 * differs from what they're currently viewing AND we support it — otherwise
 * `null`. Used to offer a non-intrusive "switch language" nudge.
 *
 * Resolves to `null` on the server and first client render (no `navigator`),
 * then updates after mount, so it never causes a hydration mismatch and only
 * ever *adds* an optional hint.
 */
export function useSuggestedLocale(): Locale | null {
  const activeLocale = useLocale()
  const [suggested, setSuggested] = React.useState<Locale | null>(null)

  React.useEffect(() => {
    if (typeof navigator === "undefined") return
    const languages =
      navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
    const preferred = detectPreferredLocale(languages)
    setSuggested(preferred && preferred !== activeLocale ? preferred : null)
  }, [activeLocale])

  return suggested
}
