/**
 * Pings IndexNow (Bing + Yandex) with every public URL from sitemap.xml.
 *
 * Run AFTER a successful production deploy so crawlers see the live version.
 * Usage:
 *   npm run indexnow            # submits all URLs from the generated sitemap
 *   npm run indexnow -- --dry   # prints what would be sent without pinging
 *
 * The key file (public/<key>.txt) must already be deployed and reachable at
 * https://geospoof.com/<key>.txt for the ping to be accepted. Bing and Yandex
 * both accept IndexNow; a single submission is shared between them.
 *
 * Docs: https://www.indexnow.org/documentation
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SITE_URL = "https://geospoof.com"
const KEY = "337846bb18e4c40978988ba1f88bda0c"
const KEY_LOCATION = `${SITE_URL}/${KEY}.txt`
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sitemapPath = path.resolve(__dirname, "..", "public/sitemap.xml")

const dry = process.argv.includes("--dry")

/** Extract all <loc> URLs from the sitemap. */
function extractUrls() {
  const xml = readFileSync(sitemapPath, "utf8")
  const urls = []
  const re = /<loc>([^<]+)<\/loc>/g
  let match
  while ((match = re.exec(xml)) !== null) {
    urls.push(match[1])
  }
  return urls
}

async function ping(urls) {
  const body = {
    host: "geospoof.com",
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  }

  if (dry) {
    console.log("[indexnow] DRY RUN — would submit:")
    console.log(JSON.stringify(body, null, 2))
    return
  }

  console.log(`[indexnow] submitting ${urls.length} URLs to ${INDEXNOW_ENDPOINT}`)

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  })

  // IndexNow returns 200 (OK) or 202 (Accepted) on success.
  if (res.ok) {
    console.log(`[indexnow] ✓ accepted (${res.status})`)
  } else {
    const text = await res.text().catch(() => "")
    console.error(`[indexnow] ✗ rejected (${res.status}): ${text}`)
    process.exitCode = 1
  }
}

const urls = extractUrls()
if (urls.length === 0) {
  console.error("[indexnow] no URLs found in sitemap.xml — run `npm run sitemap` first")
  process.exitCode = 1
} else {
  await ping(urls)
}
