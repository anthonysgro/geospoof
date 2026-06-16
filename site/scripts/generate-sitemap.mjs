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

/**
 * Static, indexable routes. `/test` is intentionally excluded — it runs live
 * browser probes and isn't useful in search results. `/verify` is included: it
 * targets "browser location test" style queries and has indexable copy/FAQ.
 */
const staticRoutes = ["/", "/verify", "/blog", "/privacy", "/terms", "/support"]

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

    posts.push({ slug, lastmod: updated ?? date })
  }
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
