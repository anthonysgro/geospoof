import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/react"
import appCss from "../styles.css?url"
import { localeFromPathname } from "@/lib/i18n"
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
      { title: "GeoSpoof — Spoof Geolocation & Timezone (Free Extension)" },
      {
        name: "description",
        content:
          "Spoof your browser's geolocation, timezone, and WebRTC in one free extension. No account required. Works on Chrome, Firefox, Edge, Brave, and Safari.",
      },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geospoof.com" },
      {
        property: "og:title",
        content: "Your VPN hides your IP. GeoSpoof hides your location.",
      },
      {
        property: "og:description",
        content:
          "GeoSpoof overrides your browser's geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to. Free, open-source, and available on every major browser.",
      },
      {
        property: "og:image",
        content: "https://geospoof.com/images/social-og-home.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "626" },
      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:url", content: "https://geospoof.com" },
      {
        name: "twitter:title",
        content: "Your VPN hides your IP. GeoSpoof hides your location.",
      },
      {
        name: "twitter:description",
        content:
          "GeoSpoof overrides your browser's geolocation, timezone, and WebRTC APIs so websites see exactly where you want them to. Free, open-source, and available on every major browser.",
      },
      {
        name: "twitter:image",
        content: "https://geospoof.com/images/social-og-home.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      // Preload the above-the-fold hero phone images (light theme only —
      // dark variants load on demand after theme detection).
      {
        rel: "preload",
        href: "/images/hero/ios-1-640.webp",
        as: "image",
        type: "image/webp",
      },
      {
        rel: "preload",
        href: "/images/hero/ios-2-640.webp",
        as: "image",
        type: "image/webp",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col bg-(--color-canvas)">
      <Navigation />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          404
        </p>
        <h1 className="text-3xl font-bold text-(--color-canvas-foreground)">
          Page not found
        </h1>
        <p className="text-(--color-canvas-muted)">
          This page doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-brand bg-(--color-brand) px-6 text-sm font-semibold text-white transition-all hover:bg-(--color-brand-dark)"
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

// Inline script — runs before the app bundle to guarantee a usable
// `window.performance`. Some engines/contexts expose `performance` as `null`
// (observed on Firefox for Android and other mobile/hardened contexts), so a
// dependency calling `performance.now()` throws "performance is null" during
// hydration and freezes the whole page. This shim is a no-op on normal browsers
// (where `performance.now` already exists) and only fills in the missing API
// otherwise, using Date.now() as the clock.
const performanceShim = `
(function () {
  try {
    var origin = Date.now();
    var p = window.performance;
    if (!p || typeof p.now !== 'function') {
      var shim = (p && typeof p === 'object') ? p : {};
      if (typeof shim.now !== 'function') {
        shim.now = function () { return Date.now() - origin; };
      }
      if (typeof shim.timeOrigin !== 'number') {
        try { shim.timeOrigin = origin; } catch (e) {}
      }
      var noop = function () {};
      ['mark','measure','clearMarks','clearMeasures','clearResourceTimings','setResourceTimingBufferSize'].forEach(function (m) {
        if (typeof shim[m] !== 'function') shim[m] = noop;
      });
      ['getEntries','getEntriesByName','getEntriesByType'].forEach(function (m) {
        if (typeof shim[m] !== 'function') shim[m] = function () { return []; };
      });
      try {
        Object.defineProperty(window, 'performance', { value: shim, configurable: true, writable: true });
      } catch (e) {
        try { window.performance = shim; } catch (e2) {}
      }
    }
  } catch (e) {}
})();
`

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
  // Reflect the active locale on <html lang> for accessibility + SEO. Derived
  // from the URL (e.g. "/fr" -> "fr") so it stays correct under SSR/prerender.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const locale = localeFromPathname(pathname)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: performanceShim }} />
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
