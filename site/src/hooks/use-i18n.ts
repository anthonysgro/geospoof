import { useRouterState } from "@tanstack/react-router"
import type { Dictionary, Locale } from "@/lib/i18n"
import { getDictionary, localeFromPathname } from "@/lib/i18n"

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
