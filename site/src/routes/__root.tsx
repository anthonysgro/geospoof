import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/react"
import appCss from "../styles.css?url"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GeoSpoof — Free Browser Geolocation Spoofer" },
      {
        name: "description",
        content:
          "Spoof your browser's geolocation, timezone, and WebRTC in one extension. Open source, privacy-first, no account required. Works on Chrome, Firefox, Edge, Brave, and Safari.",
      },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geospoof.com" },
      {
        property: "og:title",
        content: "GeoSpoof — Free Browser Geolocation Spoofer",
      },
      {
        property: "og:description",
        content:
          "GeoSpoof overrides your browser's geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to. Free, open-source, and available on every major browser.",
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
        content: "GeoSpoof — Free Browser Geolocation Spoofer",
      },
      {
        name: "twitter:description",
        content:
          "GeoSpoof overrides your browser's geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to. Free, open-source, and available on every major browser.",
      },
      {
        name: "twitter:image",
        content: "https://geospoof.com/images/social-og.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      // Preload the above-the-fold hero phone images (light theme only —
      // dark variants load on demand after theme detection).
      {
        rel: "preload",
        href: "/images/hero-ios-1-640.webp",
        as: "image",
        type: "image/webp",
      },
      {
        rel: "preload",
        href: "/images/hero-ios-2-640.webp",
        as: "image",
        type: "image/webp",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col bg-(--color-canvas)">
      <Navigation />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold tracking-widest text-(--color-brand) uppercase">404</p>
        <h1 className="text-3xl font-bold text-(--color-canvas-foreground)">Page not found</h1>
        <p className="text-(--color-canvas-muted)">
          This page doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-brand px-6 bg-(--color-brand) text-sm font-semibold text-white transition-all hover:bg-(--color-brand-dark)"
        >
          Back to home
        </Link>
      </main>
      <Footer />
    </div>
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
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  )
}
