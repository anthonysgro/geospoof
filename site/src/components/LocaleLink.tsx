import { Link } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { localizedHref } from "@/lib/i18n"
import { useLocale } from "@/hooks/use-i18n"

type LinkProps = ComponentProps<typeof Link>

/**
 * A TanStack `<Link>` that keeps the visitor's language. Pass the unprefixed
 * (English) path in `to`; it's rewritten to the active locale when that target
 * has a translation, and left unchanged otherwise (untranslated pages, hash
 * anchors, external URLs). Use this for internal navigation instead of `<Link>`
 * so clicking around doesn't drop a French visitor back to English.
 */
export function LocaleLink({ to, ...props }: LinkProps) {
  const locale = useLocale()
  const href =
    typeof to === "string" ? localizedHref(to, locale) : to
  return <Link to={href as LinkProps["to"]} {...props} />
}
