import { CoffeeIcon, GithubIcon } from "lucide-react"
import { NavLink } from "./NavLink"
import { MobileNav } from "./MobileNav"
import type { NavItem } from "./MobileNav"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const navItems: Array<NavItem> = [
  { label: "Home", href: "#" },
  { label: "Features", href: "#features" },
  { label: "Support", href: "/support" },
]

function handleSmoothScroll(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  if (!href.startsWith("#")) return
  e.preventDefault()
  if (href === "#") {
    if (window.location.pathname !== "/") {
      window.location.href = "/"
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    return
  }
  if (window.location.pathname !== "/") {
    window.location.href = "/" + href
    return
  }
  const el = document.getElementById(href.slice(1))
  el?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function BrandMark() {
  return (
    <a
      href="/"
      className={cn(
        "flex items-center gap-2 justify-self-start",
        "text-2xl font-bold md:text-3xl lg:text-[2rem]",
        "transition-opacity duration-200 hover:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
        "rounded-[var(--radius-sm-brand)]"
      )}
      aria-label="GeoSpoof - Home"
    >
      <img
        src="/icon.png"
        alt=""
        className="hidden h-9 w-9 md:block"
        aria-hidden="true"
      />
      <span className="whitespace-nowrap text-(--color-brand)">GeoSpoof</span>
    </a>
  )
}

function CenterNavLinks() {
  return (
    <nav
      className="hidden items-center gap-12 lg:flex"
      aria-label="Main navigation"
    >
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          onClick={(e) => handleSmoothScroll(e, item.href)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

const iconBtnClass = cn(
  "hidden items-center justify-center lg:inline-flex",
  "h-10 min-h-[44px] w-10 min-w-[44px]",
  "rounded-[var(--radius-brand)]",
  "text-(--color-canvas-muted)",
  "hover:bg-(--color-canvas-muted)/10 hover:text-(--color-canvas-foreground)",
  "transition-all duration-200",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

function RightActions() {
  return (
    <>
      <ThemeToggle />

      {/* Buy me a coffee — desktop only */}
      <a
        href="https://buymeacoffee.com/sgro"
        target="_blank"
        rel="noopener noreferrer"
        className={iconBtnClass}
        aria-label="Buy me a coffee"
      >
        <CoffeeIcon className="h-5 w-5" />
      </a>

      {/* GitHub — desktop only */}
      <a
        href="https://github.com/anthonysgro/geospoof"
        target="_blank"
        rel="noopener noreferrer"
        className={iconBtnClass}
        aria-label="GeoSpoof on GitHub"
      >
        <GithubIcon className="h-5 w-5" />
      </a>

      {/* Download CTA — desktop only */}
      <a
        href="#download"
        onClick={(e) => handleSmoothScroll(e, "#download")}
        className={cn(
          "hidden items-center justify-center lg:inline-flex",
          "bg-(--color-brand) text-white",
          "transition-all hover:bg-(--color-brand-dark)",
          "h-auto rounded-[var(--radius-brand)] px-6 py-2.5",
          "text-base font-semibold shadow-md hover:shadow-lg",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        )}
      >
        Download
      </a>

      {/* Mobile hamburger */}
      <MobileNav items={navItems} className="lg:hidden" />
    </>
  )
}

export function Navigation({ className }: { className?: string }) {
  return (
    <header
      role="banner"
      className={cn(
        "sticky top-0 z-50",
        "bg-(--color-canvas)/80 backdrop-blur-md",
        "pt-2 md:pt-3",
        className
      )}
    >
      <nav
        className={cn(
          "mx-auto w-full",
          "px-6 md:px-10 lg:px-16",
          "flex items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]",
          "h-18 md:h-20"
        )}
      >
        <BrandMark />
        <CenterNavLinks />
        <div className="flex items-center gap-3 justify-self-end">
          <RightActions />
        </div>
      </nav>
    </header>
  )
}
