import * as React from "react"
import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

interface FooterLink {
  label: string
  href: string
  internal?: boolean
}

const footerLinks: Array<FooterLink> = [
  { label: "Privacy Policy", href: "/privacy", internal: true },
  { label: "Terms of Service", href: "/terms", internal: true },
  { label: "Support", href: "/support", internal: true },
  { label: "GitHub", href: "https://github.com/anthonysgro/geospoof" },
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
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          {/* Links */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-2 md:gap-6">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  {link.internal ? (
                    <Link to={link.href as "/"} className={linkClass}>
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Copyright */}
          <p className="text-small text-(--color-canvas-muted)">
            © {currentYear} GeoSpoof. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
