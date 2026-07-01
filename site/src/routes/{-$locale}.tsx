import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from "@tanstack/react-router"
import { defaultLocale, isLocale } from "@/lib/i18n"
// Layout + guard for the optional locale segment. A single `{-$locale}` route
// tree serves every locale, so we don't duplicate a file per language:
//
//   /about       -> params.locale === undefined  (default locale, bare path)
//   /fr/about    -> params.locale === "fr"
//
// The child routes read the locale from the URL (via `useLocale()` /
// `localeFromPathname`), so their components and `head` builders localize
// automatically. This guard enforces the two SEO invariants:
//
//   - The default locale is only reachable at the bare path. An explicit
//     `/en/...` prefix would duplicate the canonical URL, so we 301 it back to
//     the unprefixed path (consolidating any stray links onto the indexed one).
//   - Unknown prefixes (`/xx/...`) 404 rather than rendering default content.
export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: ({ params, location }) => {
    const { locale } = params
    if (locale === undefined) return // bare path — default locale, nothing to do
    if (locale === defaultLocale) {
      const stripped = location.pathname.slice(defaultLocale.length + 1) || "/"
      throw redirect({ href: stripped, statusCode: 301 })
    }
    if (!isLocale(locale)) throw notFound()
  },
  component: () => <Outlet />,
})
