import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import appCss from "../styles.css?url"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/react"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GeoSpoof — Spoof your browser location & timezone" },
      {
        name: "description",
        content:
          "GeoSpoof overrides your browser geolocation, timezone, and WebRTC APIs. Available for Firefox, Chrome, Brave, Edge, and Safari.",
      },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geospoof.com" },
      {
        property: "og:title",
        content: "GeoSpoof — Spoof your browser location & timezone",
      },
      {
        property: "og:description",
        content:
          "GeoSpoof overrides your browser geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to.",
      },
      {
        property: "og:image",
        content: "https://geospoof.com/images/social-og.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:url", content: "https://geospoof.com" },
      {
        name: "twitter:title",
        content: "GeoSpoof — Spoof your browser location & timezone",
      },
      {
        name: "twitter:description",
        content:
          "GeoSpoof overrides your browser geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to.",
      },
      {
        name: "twitter:image",
        content: "https://geospoof.com/images/social-og.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      // Only preload the above-the-fold hero images (light + dark variants)
      // Use 640w versions — matches the displayed size on most viewports
      { rel: "preload", href: "/images/hero-ios-1-640.webp", as: "image", type: "image/webp" },
      { rel: "preload", href: "/images/hero-ios-2-640.webp", as: "image", type: "image/webp" },
      { rel: "preload", href: "/images/hero-ios-1-dark-640.webp", as: "image", type: "image/webp" },
      { rel: "preload", href: "/images/hero-ios-2-dark-640.webp", as: "image", type: "image/webp" },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="mb-2 text-2xl font-bold">404</h1>
      <p className="text-(--color-canvas-muted)">Page not found.</p>
    </main>
  ),
  component: () => <Outlet />,
  shellComponent: RootDocument,
})

// Inline script — runs before React hydrates to apply the correct theme class
// and prevent a flash of the wrong theme.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('geospoof-theme');
    var theme = stored;
    if (!stored || stored === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }
})();
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider defaultTheme="system" storageKey="geospoof-theme">
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  )
}
