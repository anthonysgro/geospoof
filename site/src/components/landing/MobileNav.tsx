import * as React from "react"
import { CoffeeIcon, GithubIcon, MenuIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

export interface NavItem {
  label: string
  href: string
}

interface MobileNavProps {
  items: Array<NavItem>
  className?: string
}

export function MobileNav({ items, className }: MobileNavProps) {
  const [open, setOpen] = React.useState(false)

  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    setOpen(false)
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("min-h-12 min-w-12", className)}
          aria-label="Open navigation menu"
        >
          <MenuIcon className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-full",
          "bg-(--color-canvas)",
          "flex flex-col"
        )}
      >
        <SheetHeader className="border-b border-(--color-canvas-border) pb-4">
          <SheetTitle className="text-left text-xl font-semibold text-(--color-brand)">
            GeoSpoof
          </SheetTitle>
        </SheetHeader>
        <nav
          className="flex flex-1 flex-col gap-2 py-6"
          aria-label="Mobile navigation"
        >
          {items.map((item) => (
            <SheetClose asChild key={item.href}>
              <a
                href={item.href}
                onClick={(e) => handleLinkClick(e, item.href)}
                className={cn(
                  "flex min-h-12 items-center px-4 py-3",
                  "text-lg font-medium text-(--color-canvas-foreground)",
                  "rounded-[var(--radius-brand)]",
                  "transition-colors duration-200",
                  "hover:bg-(--color-canvas-border)",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                )}
              >
                {item.label}
              </a>
            </SheetClose>
          ))}
        </nav>

        {/* Footer links */}
        <div className="flex items-center gap-2 border-t border-(--color-canvas-border) px-4 py-4">
          <a
            href="https://buymeacoffee.com/sgro"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2",
              "text-sm text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
              "transition-colors duration-200"
            )}
          >
            <CoffeeIcon className="h-4 w-4" />
            Buy me a coffee
          </a>
          <a
            href="https://github.com/anthonysgro/geospoof"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2",
              "text-sm text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
              "transition-colors duration-200"
            )}
          >
            <GithubIcon className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
