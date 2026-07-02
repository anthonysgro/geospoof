import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import contentCollections from "@content-collections/vite"
import {
  localizedBasePaths,
  noPrerenderBasePaths,
  nonDefaultLocaleCodes,
} from "./src/lib/i18n/locale-data.mjs"

/**
 * Resolve the mkcert-generated HTTPS cert pair for the dev server if it
 * exists on this machine.
 *
 * Why we need HTTPS in dev:
 * - Firefox (150+) refuses to gather WebRTC ICE candidates on
 *   `http://localhost`: the ICE agent jumps straight to `failed`
 *   without emitting a single candidate. That silently broke our
 *   WebRTC leak test locally even though production is fine.
 * - Several other browser APIs (clipboard, some permissions, service
 *   workers with production-style scope rules) behave identically
 *   across localhost-HTTPS and production HTTPS, but differ on plain
 *   HTTP — matching transport layers eliminates a whole class of
 *   "works in prod, broken locally" surprises.
 *
 * Setup (one-time, per machine):
 *   brew install mkcert nss    # nss is required for Firefox trust
 *   mkcert -install             # installs a local trusted root CA
 *   cd site
 *   mkcert -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem \
 *          localhost 127.0.0.1 ::1
 *
 * The `certs/` directory is gitignored — each developer generates
 * their own pair. If the cert pair isn't present the dev server
 * silently falls back to HTTP (so the repo still works for anyone
 * who hasn't run the setup yet).
 */
function resolveDevHttpsOptions(): { cert: Buffer; key: Buffer } | undefined {
  try {
    const certPath = path.resolve(__dirname, "certs/dev-cert.pem")
    const keyPath = path.resolve(__dirname, "certs/dev-key.pem")
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      return undefined
    }
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }
  } catch {
    return undefined
  }
}

const devHttps = resolveDevHttpsOptions()

/**
 * Localized pages to prerender, derived from the locale config so it never
 * drifts: every non-default locale × every localized base path, minus the
 * paths that must render live (e.g. /verify runs browser probes). English
 * (bare-path) pages are discovered by the link crawler.
 *
 *   fr × ["/", "/about", …]  ->  [{ path: "/fr" }, { path: "/fr/about" }, …]
 */
const localizedPrerenderPages = nonDefaultLocaleCodes.flatMap((code) =>
  localizedBasePaths
    .filter((base) => !noPrerenderBasePaths.includes(base))
    .map((base) => ({ path: base === "/" ? `/${code}` : `/${code}${base}` }))
)

const config = defineConfig({
  base: "/",
  server: {
    // Only set `https` when the cert pair exists; `undefined` is
    // interpreted by Vite as "plain HTTP", matching the previous
    // default behaviour.
    https: devHttps,
  },
  plugins: [
    contentCollections(),
    devtools(),
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      // Localized routes that the link crawler can't discover from a static
      // anchor (the language switcher is a portaled dropdown, so its links
      // aren't in the closed-menu DOM). Enumerated from the locale config
      // (see `localizedPrerenderPages`) so new locales/pages are covered with
      // no edit here.
      pages: localizedPrerenderPages,
      // Prerender all static routes at build time so Vercel serves them
      // as static assets from the CDN edge — eliminates SSR cold-start
      // latency and improves FCP/TTFB for the landing page and docs.
      //
      // /test and /verify are excluded: they run live browser API probes
      // that only make sense in a real browser context, not a prerender
      // environment.
      //
      // /go/* is excluded: those are outbound affiliate redirects defined in
      // vercel.json and only exist at Vercel's edge at runtime. The crawler
      // discovers them via on-page CTA links, but there's no buildable page to
      // prerender, so fetching them during build 404s. Skip them.
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: ({ path: routePath }: { path: string }) =>
          !routePath.endsWith("/test") &&
          !routePath.endsWith("/verify") &&
          !routePath.startsWith("/go/"),
      },
    }),
    viteReact(),
  ],
})

export default config
