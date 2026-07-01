// @ts-check
/**
 * Single runtime source of truth for locale codes + localized route paths.
 *
 * Shared by three consumers that otherwise couldn't import each other:
 *   - the app config (`config.ts`, TypeScript)
 *   - the Vite prerender config (`vite.config.ts`)
 *   - the sitemap generator (`scripts/generate-sitemap.mjs`, plain Node)
 *
 * Keeping the data here (plain ESM, importable from both TS and Node) means the
 * locale list and localized-path list can never drift between the app, the
 * prerender enumeration, and the sitemap/hreflang cluster.
 *
 * To ADD A LOCALE:
 *   1. Add an entry to `localeList` below.
 *   2. Add its code to the `Locale` union in `config.ts` (the one type edit).
 *   3. Register its dictionary in `lib/i18n/index.ts`.
 * No new route files are needed — the `{-$locale}` routes serve every locale.
 */

/**
 * @typedef {Object} LocaleMeta
 * @property {string} code       BCP-47 primary subtag, used as the URL prefix.
 * @property {string} name       Human-readable name for the language switcher.
 * @property {string} shortLabel Compact uppercased label for the switcher.
 * @property {string} ogLocale   Open Graph `language_TERRITORY` code.
 */

/** The default locale — served at the bare path with no URL prefix. */
export const defaultLocale = "en"

/**
 * Every locale the site renders. The first entry is the default.
 * @type {ReadonlyArray<LocaleMeta>}
 */
export const localeList = [
  { code: "en", name: "English", shortLabel: "EN", ogLocale: "en_US" },
  { code: "de", name: "Deutsch", shortLabel: "DE", ogLocale: "de_DE" },
  { code: "es", name: "Español", shortLabel: "ES", ogLocale: "es_ES" },
  { code: "fr", name: "Français", shortLabel: "FR", ogLocale: "fr_FR" },
  { code: "pt-BR", name: "Português (BR)", shortLabel: "PT", ogLocale: "pt_BR" },
  { code: "ru", name: "Русский", shortLabel: "RU", ogLocale: "ru_RU" },
  { code: "zh-CN", name: "简体中文", shortLabel: "中文", ogLocale: "zh_CN" },
]

/** All locale codes, default first. */
export const localeCodes = localeList.map((l) => l.code)

/** Non-default locale codes — the ones served under a `/<code>` URL prefix. */
export const nonDefaultLocaleCodes = localeCodes.filter(
  (c) => c !== defaultLocale
)

/**
 * Unprefixed base paths that have a translated variant for every non-default
 * locale. Drives the language switcher, the prerender enumeration, and the
 * sitemap hreflang cluster. Add paths here as they're translated.
 */
export const localizedBasePaths = [
  "/",
  "/about",
  "/support",
  "/verify",
  "/privacy",
  "/terms",
  "/engine-level-spoofing",
  "/vpn",
  "/spoof-timezone",
  "/spoof-location",
  "/spoof-location/chrome",
  "/spoof-location/edge",
  "/spoof-location/firefox",
  "/spoof-location/safari",
  "/blog",
]

/**
 * Base paths whose entire subtree is localized, including dynamic children
 * (e.g. blog posts at `/blog/<slug>`) that can't be enumerated above.
 */
export const localizedSubtrees = ["/blog"]

/**
 * Base paths that are localized but must NOT be prerendered — they run live
 * browser API probes that only make sense at runtime. Excluded from the Vite
 * `pages` enumeration (they're still rendered on demand and listed in the
 * sitemap).
 */
export const noPrerenderBasePaths = ["/verify"]
