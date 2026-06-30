/**
 * Locale configuration for the marketing site.
 *
 * Strategy (see Google's multilingual SEO guidance): each locale gets its own
 * crawlable URL under the same domain. English is the *default* and lives at
 * the bare path (`/`, `/about`, …) with NO prefix, so existing rankings are
 * undisturbed. Every other locale is served under a subdirectory prefix
 * (`/fr`, `/fr/about`, …). We never serve different languages off the same URL
 * via `Accept-Language`, and we never hard-redirect crawlers by header — the
 * user picks via a visible switcher.
 */

/** Every locale the site can render. The first entry is the default. */
export const locales = ["en", "fr"] as const

export type Locale = (typeof locales)[number]

/** Default locale — served at the bare path with no URL prefix. */
export const defaultLocale: Locale = "en"

/** Human-readable names for each locale, shown in the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  fr: "Français",
}

/** Short labels (uppercased ISO code) for compact switcher UI. */
export const localeShortLabels: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
}

/** Type guard: is this string one of our supported locales? */
export function isLocale(value: string | undefined): value is Locale {
  return (
    value !== undefined && (locales as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Derive the active locale from a pathname.
 *
 * `/`            -> "en"  (default, no prefix)
 * `/about`       -> "en"
 * `/fr`          -> "fr"
 * `/fr/about`    -> "fr"
 *
 * Anything that isn't a known prefix falls back to the default locale, so
 * English pages need no per-route wiring — the hook just works.
 */
export function localeFromPathname(pathname: string): Locale {
  const firstSegment = pathname.split("/").filter(Boolean)[0]
  return isLocale(firstSegment) && firstSegment !== defaultLocale
    ? firstSegment
    : defaultLocale
}

/**
 * Build the URL for a given locale's copy of a path.
 *
 * `localizedPath("/", "fr")`      -> "/fr"
 * `localizedPath("/", "en")`      -> "/"
 * `localizedPath("/about", "fr")` -> "/fr/about"
 *
 * `path` must be the *unprefixed* (English) path. The default locale returns
 * the path unchanged; prefixed locales get the `/{locale}` prefix.
 */
export function localizedPath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`
  if (locale === defaultLocale) return clean
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`
}

/**
 * Remove the locale prefix from a pathname, returning the unprefixed
 * (English) base path.
 *
 * `/fr`        -> "/"
 * `/fr/about`  -> "/about"
 * `/about`     -> "/about"
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  if (
    segments.length > 0 &&
    isLocale(segments[0]) &&
    segments[0] !== defaultLocale
  ) {
    segments.shift()
  }
  return `/${segments.join("/")}`
}

/**
 * Unprefixed base paths that currently have translations for every non-default
 * locale. The language switcher only appears on these, so it never links to a
 * page that hasn't been localized yet. Add paths here as they're translated.
 */
export const localizedBasePaths: ReadonlyArray<string> = ["/"]

/** Does the given pathname's base route have localized variants? */
export function hasLocalizedVariants(pathname: string): boolean {
  return localizedBasePaths.includes(stripLocalePrefix(pathname))
}
