import * as React from "react"
import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

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
const footerGroups: Array<FooterGroup> = [
  {
    title: "Guides",
    links: [
      { label: "Spoof location: all browsers", href: "/spoof-location" },
      { label: "Spoof location in Chrome", href: "/spoof-location/chrome" },
      { label: "Spoof location in Firefox", href: "/spoof-location/firefox" },
      { label: "Spoof location in Edge", href: "/spoof-location/edge" },
      { label: "Spoof location in Safari", href: "/spoof-location/safari" },
      { label: "Spoof timezone", href: "/spoof-timezone" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Do you need a VPN?", href: "/vpn" },
      { label: "Test your protection", href: "/verify" },
      { label: "Blog", href: "/blog" },
      { label: "Support", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      {
        label: "GitHub",
        href: "https://github.com/anthonysgro/geospoof",
        external: true,
      },
    ],
  },
]

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
  const currentYear = new Date().getFullYear()

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
      <div className="mx-auto max-w-[1200px]">
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-8 md:grid-cols-3"
        >
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="mb-3 text-small font-semibold tracking-wide text-(--color-canvas-foreground) uppercase">
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
                      <Link to={link.href as "/"} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Copyright */}
        <p className="mt-10 border-t border-(--color-canvas-border) pt-6 text-small text-(--color-canvas-muted)">
          © {currentYear} GeoSpoof. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
