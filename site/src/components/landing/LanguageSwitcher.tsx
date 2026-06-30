import { Link, useRouterState } from "@tanstack/react-router"
import { CheckIcon, GlobeIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  hasLocalizedVariants,
  localeFromPathname,
  localeNames,
  localeShortLabels,
  locales,
  localizedPath,
  stripLocalePrefix,
} from "@/lib/i18n"
import { useTranslations } from "@/hooks/use-i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Language picker (globe trigger + dropdown of languages).
 *
 * Built on the shadcn DropdownMenu so it scales past two languages. Per
 * multilingual-SEO guidance we never auto-redirect by `Accept-Language`; the
 * user chooses here, and each option is a real `<Link>` (crawlable anchor when
 * open, with an `hreflang` hint). The switcher hides itself on routes that
 * don't yet have translations so it never links to a 404.
 *
 * Note: because the dropdown content is portaled (not in the DOM until opened),
 * localized routes are enumerated under `pages` in `vite.config.ts` so the
 * prerender step doesn't depend on a static anchor being present.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { t } = useTranslations()
  const activeLocale = localeFromPathname(pathname)
  const basePath = stripLocalePrefix(pathname)

  // Only show where every locale has a translated page.
  if (!hasLocalizedVariants(pathname)) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.languageSwitcher.label}
        className={cn(
          "inline-flex items-center gap-1.5",
          "h-10 min-h-[44px] rounded-[var(--radius-brand)] px-2.5",
          "text-sm font-medium text-(--color-canvas-muted)",
          "hover:bg-(--color-canvas-muted)/10 hover:text-(--color-canvas-foreground)",
          "transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
          "data-[state=open]:text-(--color-canvas-foreground)",
          className
        )}
      >
        <GlobeIcon className="h-5 w-5" aria-hidden="true" />
        <span>{localeShortLabels[activeLocale]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t.languageSwitcher.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((locale) => {
          const isActive = locale === activeLocale
          return (
            <DropdownMenuItem key={locale} asChild>
              <Link
                to={localizedPath(basePath, locale) as "/"}
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
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
