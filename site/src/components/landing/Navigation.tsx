import { CoffeeIcon, GithubIcon } from "lucide-react"
import { NavLink } from "./NavLink"
import { MobileNav } from "./MobileNav"
import { LanguageSwitcher } from "./LanguageSwitcher"
import type { NavItem } from "./MobileNav"
import type { Dictionary, Locale } from "@/lib/i18n"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/hooks/use-i18n"
import { localizedHref, localizedPath } from "@/lib/i18n"

/** Build the nav items from the active dictionary (labels are localized). */
function getNavItems(t: Dictionary, locale: Locale): Array<NavItem> {
  return [
    { label: t.nav.home, href: "#" },
    { label: t.nav.features, href: "#features" },
    { label: t.nav.blog, href: localizedHref("/blog", locale) },
    { label: t.nav.support, href: localizedHref("/support", locale) },
  ]
}

/**
 * Smooth-scroll handler for in-page anchors. `homePath` is the current
 * locale's home (e.g. "/" or "/fr"), so "Home" and the brand mark return a
 * French visitor to the French homepage rather than the English one.
 */
function handleSmoothScroll(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  homePath: string
) {
  if (!href.startsWith("#")) return
  e.preventDefault()
  if (href === "#") {
    if (window.location.pathname !== homePath) {
      window.location.href = homePath
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    return
  }
  if (window.location.pathname !== homePath) {
    window.location.href = homePath === "/" ? "/" + href : homePath + "/" + href
    return
  }
  const el = document.getElementById(href.slice(1))
  el?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function BrandMark({
  homePath,
  ariaLabel,
}: {
  homePath: string
  ariaLabel: string
}) {
  return (
    <a
      href={homePath}
      className={cn(
        "flex items-center gap-2 justify-self-start",
        "text-2xl font-bold md:text-3xl lg:text-[2rem]",
        "transition-opacity duration-200 hover:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
        "rounded-sm-brand"
      )}
      aria-label={ariaLabel}
    >
      <picture className="hidden md:block">
        <source srcSet="/icon.webp" type="image/webp" />
        <img
          src="/icon.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9"
          aria-hidden="true"
        />
      </picture>
      <span className="whitespace-nowrap text-(--color-brand)">GeoSpoof</span>
    </a>
  )
}

function CenterNavLinks({
  items,
  homePath,
  ariaLabel,
}: {
  items: Array<NavItem>
  homePath: string
  ariaLabel: string
}) {
  return (
    <nav
      className="hidden items-center gap-6 lg:flex xl:gap-12"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          onClick={(e) => handleSmoothScroll(e, item.href, homePath)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

const iconBtnClass = cn(
  // Deferred to `xl`: at `lg` the bar is already tight with the nav links,
  // language picker, theme toggle, and CTA, so these secondary icons only
  // appear once there's room. Below `lg` they live in the mobile menu.
  "hidden items-center justify-center xl:inline-flex",
  "h-10 min-h-[44px] w-10 min-w-[44px]",
  "rounded-[var(--radius-brand)]",
  "text-(--color-canvas-muted)",
  "hover:bg-(--color-canvas-muted)/10 hover:text-(--color-canvas-foreground)",
  "transition-all duration-200",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

function RightActions({
  t,
  items,
  homePath,
}: {
  t: Dictionary
  items: Array<NavItem>
  homePath: string
}) {
  return (
    <>
      <LanguageSwitcher />

      <ThemeToggle />

      {/* Buy me a coffee — desktop only */}
      <a
        href="https://buymeacoffee.com/sgro"
        target="_blank"
        rel="noopener noreferrer"
        className={iconBtnClass}
        aria-label={t.nav.buyMeACoffee}
      >
        <CoffeeIcon className="h-5 w-5" />
      </a>

      {/* GitHub — desktop only */}
      <a
        href="https://github.com/anthonysgro/geospoof"
        target="_blank"
        rel="noopener noreferrer"
        className={iconBtnClass}
        aria-label={t.nav.github}
      >
        <GithubIcon className="h-5 w-5" />
      </a>

      {/* Download CTA — desktop only */}
      <a
        href="#download"
        onClick={(e) => handleSmoothScroll(e, "#download", homePath)}
        className={cn(
          "hidden items-center justify-center lg:inline-flex",
          "bg-(--color-brand) text-white",
          "transition-all hover:bg-(--color-brand-dark)",
          "h-auto rounded-(--radius-brand) px-6 py-2.5",
          "text-base font-semibold shadow-md hover:shadow-lg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        {t.nav.download}
      </a>

      {/* Mobile hamburger */}
      <MobileNav items={items} homePath={homePath} className="lg:hidden" />
    </>
  )
}

export function Navigation({ className }: { className?: string }) {
  const { locale, t } = useTranslations()
  const homePath = localizedPath("/", locale)
  const items = getNavItems(t, locale)

  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-50",
        "bg-canvas/80 backdrop-blur-md",
        "pt-2 md:pt-3",
        className
      )}
    >
      <nav
        className={cn(
          "mx-auto w-full",
          "px-6 md:px-10 xl:px-16",
          "flex items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-x-6",
          "h-18 md:h-20"
        )}
      >
        <BrandMark homePath={homePath} ariaLabel={t.nav.brandAria} />
        <CenterNavLinks
          items={items}
          homePath={homePath}
          ariaLabel={t.nav.mainNavAria}
        />
        <div className="flex items-center gap-3 justify-self-end">
          <RightActions t={t} items={items} homePath={homePath} />
        </div>
      </nav>
    </header>
  )
}
