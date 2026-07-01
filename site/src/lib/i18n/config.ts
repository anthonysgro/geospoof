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

import {
  defaultLocale as defaultLocaleCode,
  localeList,
  localizedBasePaths as localizedBasePathList,
  localizedSubtrees as localizedSubtreeList,
} from "./locale-data.mjs"

/**
 * Every locale the site can render. To add one: add an entry to `localeList`
 * in `locale-data.mjs`, then add its code to this union (the single type edit)
 * and register its dictionary in `index.ts`.
 */
export type Locale = "en" | "de" | "es" | "fr" | "ru" | "zh-CN"

/** All locale codes at runtime (default first), sourced from `locale-data`. */
export const locales = localeList.map((l) => l.code) as ReadonlyArray<Locale>

/** Default locale — served at the bare path with no URL prefix. */
export const defaultLocale = defaultLocaleCode as Locale

/** Human-readable names for each locale, shown in the language switcher. */
export const localeNames = Object.fromEntries(
  localeList.map((l) => [l.code, l.name] as const)
) as Record<Locale, string>

/** Short labels (uppercased ISO code) for compact switcher UI. */
export const localeShortLabels = Object.fromEntries(
  localeList.map((l) => [l.code, l.shortLabel] as const)
) as Record<Locale, string>

/**
 * Open Graph locale codes (`language_TERRITORY`) for each locale, used in the
 * `og:locale` / `og:locale:alternate` tags so social and messaging previews
 * render in the right language. Keep in sync with `locales`.
 */
export const ogLocales = Object.fromEntries(
  localeList.map((l) => [l.code, l.ogLocale] as const)
) as Record<Locale, string>

/**
 * Build the Open Graph locale meta tags for a page: `og:locale` for the active
 * locale, plus one `og:locale:alternate` for every other supported locale, as
 * the OG protocol recommends. Spread into a head builder's `meta` array.
 */
export function buildOgLocaleMeta(
  locale: Locale
): Array<{ property: string; content: string }> {
  return [
    { property: "og:locale", content: ogLocales[locale] },
    ...locales
      .filter((l) => l !== locale)
      .map((l) => ({
        property: "og:locale:alternate",
        content: ogLocales[l],
      })),
  ]
}

/** Type guard: is this string one of our supported locales? */
export function isLocale(value: string | undefined): value is Locale {
  return (
    value !== undefined && (locales as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Coerce an optional path-param locale (from the `{-$locale}` routes) to a
 * concrete `Locale`. An absent param means the bare path, i.e. the default
 * locale; the default-locale code itself and any unknown value also fall back
 * to the default. Callers reach `head` only after the `{-$locale}` layout's
 * guard has validated the segment, so the fallback is just belt-and-braces.
 */
export function toLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale
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
 * Build the `hreflang` alternate `<link>`s for a page: one per locale, plus an
 * `x-default` pointing at the default-locale (bare) URL. Generated from
 * `locales`, so a new language appears in every page's cluster automatically —
 * no per-head-builder edits. Spread into a head builder's `links` array.
 *
 *   ...buildAlternateLinks("/about", SITE_URL)
 */
export function buildAlternateLinks(
  basePath: string,
  siteUrl: string
): Array<{ rel: "alternate"; hrefLang: string; href: string }> {
  const alternates: Array<{
    rel: "alternate"
    hrefLang: string
    href: string
  }> = locales.map((locale) => ({
    rel: "alternate" as const,
    hrefLang: locale,
    href: `${siteUrl}${localizedPath(basePath, locale)}`,
  }))
  alternates.push({
    rel: "alternate" as const,
    hrefLang: "x-default",
    href: `${siteUrl}${localizedPath(basePath, defaultLocale)}`,
  })
  return alternates
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
export const localizedBasePaths: ReadonlyArray<string> = localizedBasePathList

/**
 * Base paths whose *entire subtree* is localized, including dynamic children.
 * The blog index lives at `/blog` (an exact `localizedBasePaths` entry) but its
 * posts live at `/blog/<slug>`, which can't be enumerated here — so we treat
 * anything under `/blog/` as localized too. Article bodies stay English, but
 * the surrounding chrome is translated and the URL keeps the visitor's locale.
 */
export const localizedSubtrees: ReadonlyArray<string> = localizedSubtreeList

/**
 * Does this unprefixed base path have localized variants? True when it's an
 * exact localized page or falls under a localized subtree (e.g. a blog post).
 */
function isLocalizedBase(base: string): boolean {
  if (localizedBasePaths.includes(base)) return true
  return localizedSubtrees.some(
    (root) => base === root || base.startsWith(`${root}/`)
  )
}

/** Does the given pathname's base route have localized variants? */
export function hasLocalizedVariants(pathname: string): boolean {
  return isLocalizedBase(stripLocalePrefix(pathname))
}

/**
 * Locale-aware href for an internal link. Given an (unprefixed) English target
 * path, returns the URL for the active locale:
 *   - target has a translation  -> prefixed (`/about` -> `/fr/about`)
 *   - target has no translation  -> unchanged (`/blog` stays `/blog`)
 *   - hash anchors / external    -> unchanged (`#features`, `https://…`)
 *
 * Use this for every internal link so navigation keeps the visitor's language
 * instead of dropping them back to English.
 */
export function localizedHref(path: string, locale: Locale): string {
  // Leave anchors, query-only, and absolute/external URLs untouched.
  if (!path.startsWith("/")) return path
  const base = stripLocalePrefix(path)
  return isLocalizedBase(base) ? localizedPath(base, locale) : path
}

/**
 * Pick the visitor's preferred locale from their ordered browser languages
 * (`navigator.languages`), matched against the locales we actually support.
 *
 * Matching is by primary subtag, so "fr-CA" and "fr" both map to "fr". Returns
 * the first supported match in preference order, or `null` if none of their
 * languages are available. Fully generic — add a locale to `locales` and it's
 * considered automatically, no per-language code.
 */
export function detectPreferredLocale(
  languages: ReadonlyArray<string>
): Locale | null {
  for (const lang of languages) {
    const primary = lang.toLowerCase().split("-")[0]
    // Match on primary subtag on both sides so a regional locale code (e.g.
    // "zh-CN") still matches a browser language of "zh", "zh-CN", or
    // "zh-Hans-CN". Plain codes like "en"/"fr" are unaffected.
    const match = locales.find((l) => l.toLowerCase().split("-")[0] === primary)
    if (match) return match
  }
  return null
}
