// Generates a static sitemap.xml from the static routes + blog post sources.
//
// Runs before `vite build` (see package.json) and writes to `public/sitemap.xml`,
// which Vite copies to the build output and serves at /sitemap.xml — a static
// CDN asset, no serverless function involved.
//
// Posts are read straight from `content/blog/*.mdx` frontmatter so the script
// has no dependency on the Content Collections generated output or on build
// ordering.

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SITE_URL = "https://geospoof.com"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(__dirname, "..")
const blogDir = path.join(siteRoot, "content/blog")
const outFile = path.join(siteRoot, "public/sitemap.xml")
const llmsFile = path.join(siteRoot, "public/llms.txt")

/**
 * Static, indexable routes. `/test` is intentionally excluded — it runs live
 * browser probes and isn't useful in search results. `/verify` is included: it
 * targets "browser location test" style queries and has indexable copy/FAQ.
 */
const staticRoutes = [
  "/",
  "/verify",
  "/spoof-timezone",
  "/spoof-location",
  "/spoof-location/chrome",
  "/spoof-location/edge",
  "/spoof-location/firefox",
  "/spoof-location/safari",
  "/vpn",
  "/blog",
  "/privacy",
  "/terms",
  "/support",
]

/**
 * One-line descriptions for the key static routes, surfaced in llms.txt so AI
 * crawlers know what each page is for. Routes without an entry (e.g. legal
 * pages) are still in the sitemap but omitted from the llms.txt highlights.
 */
const staticPageMeta = {
  "/": {
    title: "GeoSpoof — Spoof Geolocation & Timezone (Free Extension)",
    description:
      "Free, open-source browser extension that spoofs geolocation and timezone, auto-syncs your spoofed location to your VPN exit region, and blocks WebRTC IP leaks. Works on Firefox, Chrome, Brave, Edge, and Safari.",
  },
  "/verify": {
    title: "Browser Location Test",
    description:
      "Free tool that shows the geolocation, timezone, and IP address websites can read about you right now, and flags real-vs-reported location leaks.",
  },
  "/spoof-timezone": {
    title: "Spoof Your Browser Timezone",
    description:
      "How to change or spoof your browser's timezone to match any location. GeoSpoof overrides Date, Intl, and Temporal without touching your system clock. Free.",
  },
  "/spoof-location": {
    title: "Spoof Your Browser Location",
    description:
      "Spoof your browser location in Chrome, Edge, Firefox, or Safari. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose.",
  },
  "/spoof-location/chrome": {
    title: "Spoof Your Location in Chrome",
    description:
      "How to spoof your location in Chrome (and Brave, Edge, and other Chromium browsers) with the free GeoSpoof extension.",
  },
  "/spoof-location/edge": {
    title: "Spoof Your Location in Edge",
    description:
      "How to spoof your location in Microsoft Edge on Windows and macOS with the free GeoSpoof extension.",
  },
  "/spoof-location/firefox": {
    title: "Spoof Your Location in Firefox",
    description:
      "How to spoof your location in Firefox on desktop and Android with the free, open-source GeoSpoof add-on.",
  },
  "/spoof-location/safari": {
    title: "Spoof Your Location in Safari",
    description:
      "How to spoof your location in Safari on iOS, iPadOS, and macOS with the free GeoSpoof extension from the App Store.",
  },
  "/vpn": {
    title: "The No-Log VPN We Recommend for GeoSpoof",
    description:
      "GeoSpoof hides your browser's location, timezone, and WebRTC; a no-log VPN hides your real IP. Why we recommend Proton VPN to complete a location-privacy setup, and which plan to pick.",
  },
  "/blog": {
    title: "GeoSpoof Blog",
    description:
      "Guides on browser location spoofing, timezone privacy, and WebRTC leaks.",
  },
}

/** Pull a single scalar frontmatter value (e.g. `date: "2026-06-11"`). */
function readFrontmatterField(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  if (!match) return undefined
  return match[1].trim().replace(/^["']|["']$/g, "")
}

function readPosts() {
  let files = []
  try {
    files = readdirSync(blogDir).filter((f) => f.endsWith(".mdx"))
  } catch {
    return []
  }

  const posts = []
  for (const file of files) {
    const raw = readFileSync(path.join(blogDir, file), "utf8")
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    const frontmatter = fmMatch ? fmMatch[1] : ""

    const draft = readFrontmatterField(frontmatter, "draft") === "true"
    if (draft) continue

    const slug = file.replace(/\.mdx$/, "")
    const date = readFrontmatterField(frontmatter, "date")
    const updated = readFrontmatterField(frontmatter, "updated")
    const title = readFrontmatterField(frontmatter, "title")
    const description = readFrontmatterField(frontmatter, "description")

    posts.push({ slug, lastmod: updated ?? date, date, title, description })
  }
  // Newest first, matching the on-site blog ordering.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1))
  return posts
}

function urlEntry(loc, lastmod) {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""
  return `  <url>\n    <loc>${SITE_URL}${loc}</loc>${lastmodTag}\n  </url>`
}

function buildSitemap() {
  const posts = readPosts()
  const entries = [
    ...staticRoutes.map((route) => urlEntry(route)),
    ...posts.map((post) => urlEntry(`/blog/${post.slug}`, post.lastmod)),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`
}

const xml = buildSitemap()
writeFileSync(outFile, xml, "utf8")
const count = xml.match(/<url>/g)?.length ?? 0
console.log(`[sitemap] wrote ${count} URLs to public/sitemap.xml`)

/**
 * Build llms.txt — the emerging convention for telling AI crawlers what a site
 * is about and which pages matter. Generated from the same routes + blog
 * frontmatter as the sitemap so the two never drift apart.
 * Format reference: https://llmstxt.org/
 */
function buildLlmsTxt(posts) {
  const lines = [
    "# GeoSpoof",
    "",
    "> Free, open-source browser extension that spoofs your geolocation, timezone, and WebRTC APIs so websites see a location you choose instead of your real one. It can automatically sync your spoofed location to your VPN's exit region and keep it matched as you switch servers. Works on Firefox, Chrome, Brave, Edge, and Safari.",
    "",
    "GeoSpoof overrides browser location APIs at the page level. It does not change your IP address and is not a VPN; it complements one. The site includes a free in-browser location test and guides on location privacy.",
    "",
    "## Pages",
    "",
  ]

  for (const route of staticRoutes) {
    const meta = staticPageMeta[route]
    if (!meta) continue
    lines.push(`- [${meta.title}](${SITE_URL}${route}): ${meta.description}`)
  }

  lines.push("", "## Blog", "")
  for (const post of posts) {
    const desc = post.description ? `: ${post.description}` : ""
    lines.push(`- [${post.title ?? post.slug}](${SITE_URL}/blog/${post.slug})${desc}`)
  }

  return lines.join("\n") + "\n"
}

const llms = buildLlmsTxt(readPosts())
writeFileSync(llmsFile, llms, "utf8")
const llmsCount = (llms.match(/^- \[/gm) ?? []).length
console.log(`[llms] wrote ${llmsCount} links to public/llms.txt`)
