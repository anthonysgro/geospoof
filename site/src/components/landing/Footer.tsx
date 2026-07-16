import * as React from "react"
import type { Dictionary } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/hooks/use-i18n"
import { format } from "@/lib/i18n"
import { LocaleLink } from "@/components/LocaleLink"

interface FooterLink {
  label: string
  href: string
  /** Internal links use the router; external links open in a new tab. */
  external?: boolean
}

interface FooterGroup {
  title: string
  links: Array<FooterLink>
}

// Grouped so every SEO page — including the per-browser spoof-location pages,
// /vpn, and /verify — gets a sitewide internal link. These were near-orphans
// (reachable mainly via the sitemap), which is a top reason crawlers leave
// templated pages unindexed; linking them from every page is a real discovery
// signal.
//
// Labels come from the active dictionary; hrefs stay on the (English) canonical
// pages until those routes are localized too.
function getFooterGroups(t: Dictionary): Array<FooterGroup> {
  return [
    {
      title: t.footer.groups.guides,
      links: [
        { label: t.footer.links.spoofAllBrowsers, href: "/spoof-location" },
        { label: t.footer.links.spoofChrome, href: "/spoof-location/chrome" },
        { label: t.footer.links.spoofFirefox, href: "/spoof-location/firefox" },
        { label: t.footer.links.spoofEdge, href: "/spoof-location/edge" },
        { label: t.footer.links.spoofSafari, href: "/spoof-location/safari" },
        { label: t.footer.links.spoofTimezone, href: "/spoof-timezone" },
        { label: t.footer.links.gps, href: "/gps" },
        { label: t.footer.links.pro, href: "/pro" },
      ],
    },
    {
      title: t.footer.groups.learn,
      links: [
        { label: t.footer.links.needVpn, href: "/vpn" },
        { label: t.footer.links.testProtection, href: "/verify" },
        { label: t.footer.links.engineLevel, href: "/engine-level-spoofing" },
        { label: t.footer.links.blog, href: "/blog" },
        { label: t.footer.links.support, href: "/support" },
      ],
    },
    {
      title: t.footer.groups.company,
      links: [
        { label: t.footer.links.about, href: "/about" },
        { label: t.footer.links.feedback, href: "/feedback" },
        { label: t.footer.links.privacy, href: "/privacy" },
        { label: t.footer.links.terms, href: "/terms" },
        {
          label: t.footer.links.github,
          href: "https://github.com/anthonysgro/geospoof",
          external: true,
        },
        {
          label: t.nav.buyMeACoffee,
          href: "https://buymeacoffee.com/sgro",
          external: true,
        },
      ],
    },
  ]
}

const linkClass = cn(
  "text-body-base text-(--color-canvas-muted)",
  "hover:text-(--color-canvas-foreground)",
  "transition-colors duration-200",
  "inline-flex min-h-12 items-center px-2 md:min-h-0 md:px-0",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
)

interface FooterProps extends React.ComponentProps<"footer"> {
  className?: string
}

export function Footer({ className, ...props }: FooterProps) {
  const { t } = useTranslations()
  const currentYear = new Date().getFullYear()
  const footerGroups = getFooterGroups(t)

  return (
    <footer
      className={cn(
        "bg-(--color-canvas)",
        "border-t border-(--color-canvas-border)",
        "py-12",
        "px-6 md:px-12 lg:px-16",
        className
      )}
      {...props}
    >
      <div className="mx-auto max-w-300">
        <nav
          aria-label={t.footer.footerNavAria}
          className="grid grid-cols-2 gap-8 md:grid-cols-3"
        >
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-small mb-3 font-semibold tracking-wide text-(--color-canvas-foreground) uppercase">
                {group.title}
              </h2>
              <ul className="flex flex-col gap-1">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <LocaleLink to={link.href as "/"} className={linkClass}>
                        {link.label}
                      </LocaleLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Copyright */}
        <p className="text-small mt-10 border-t border-(--color-canvas-border) pt-6 text-(--color-canvas-muted)">
          {format(t.footer.copyright, { year: currentYear })}
        </p>
        {/*
          Trademark attribution. Intentionally hardcoded (not localized): a
          trademark notice is a fixed legal/brand statement and the mark name
          does not translate. Uses ™ (unregistered) — switch to ® only once the
          USPTO registration issues.
        */}
        <p className="text-small mt-2 text-(--color-canvas-muted)">
          GeoSpoof™ is a trademark of Anthony Sgro.
        </p>
      </div>
    </footer>
  )
}
