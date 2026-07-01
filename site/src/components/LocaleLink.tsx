import { Link } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import type { Locale } from "@/lib/i18n"
import { localizedHref } from "@/lib/i18n"
import { useLocale } from "@/hooks/use-i18n"

type LinkProps = ComponentProps<typeof Link>
/**
 * A TanStack `<Link>` that keeps the visitor's language. Pass the unprefixed
 * (English) path in `to`; it's rewritten to the active locale when that target
 * has a translation, and left unchanged otherwise (untranslated pages, hash
 * anchors, external URLs). Use this for internal navigation instead of `<Link>`
 * so clicking around doesn't drop a French visitor back to English.
 *
 * The computed href is a concrete string, so it also sidesteps the strict
 * literal typing of `Link`'s `to` under the `{-$locale}` optional-param routes
 * (the target is resolved at runtime, not matched against a route id).
 *
 * Pass `locale` to build a link for a *specific* language regardless of the
 * active one — the language switcher uses this for each option's URL.
 */
export function LocaleLink({
  to,
  locale: localeOverride,
  ...props
}: LinkProps & { locale?: Locale }) {
  const activeLocale = useLocale()
  const locale = localeOverride ?? activeLocale
  const href = typeof to === "string" ? localizedHref(to, locale) : to
  return <Link to={href} {...props} />
}
