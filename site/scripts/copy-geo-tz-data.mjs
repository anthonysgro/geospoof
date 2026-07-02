// Copies the geo-tz boundary data into public/geo-tz/<version>/ so it's served
// as a same-origin static asset (see src/lib/verification/geo-timezone.ts and
// the extension's src/background/timezone.ts for why).
//
// Runs before `vite build`. Sourced from the pinned `geo-tz` npm package rather
// than downloaded, so the data version is locked by package.json and the build
// has no network dependency. The files are large (~30 MB) and reproducible, so
// public/geo-tz/ is gitignored — this script regenerates them on every build.
//
// We copy the full `timezones.geojson` dataset (not the -1970 variant) to match
// the extension's resolution, which avoids the 1970 variant's Etc/GMT coastal
// fallbacks.
//
// VERSIONED PATHS — why this matters:
//   The `.index.json` (a table of contents: "region X lives at bytes A..B")
//   and the `.dat` it indexes are fetched separately by browser-geo-tz and
//   cached `immutable` for a year. If we ever ship new geo-tz data under a
//   stable URL, a returning client could pair a STALE cached index with FRESH
//   `.dat` byte ranges from the new file — the offsets no longer line up, and
//   the lookup silently returns garbage or null with no error. Serving the data
//   under a version-scoped path (/geo-tz/<version>/) guarantees new data lands
//   at a new URL, so a cached index and the `.dat` it indexes can never
//   disagree.
//
//   To make that guarantee real, this script is the single enforcement point:
//   it refuses to build unless the installed `geo-tz` package version, the
//   canonical version in the extension's src/shared/geo-tz-data.json, and the
//   site's own literal in src/lib/verification/geo-timezone.ts ALL match. That
//   turns "someone bumped geo-tz and forgot to version the path" from a silent,
//   user-facing data-corruption bug into a loud, local build failure.

import {
  copyFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(siteRoot, "..")
const srcDir = path.join(siteRoot, "node_modules", "geo-tz", "data")

const FILES = ["timezones.geojson.geo.dat", "timezones.geojson.index.json"]

function fail(msg) {
  console.error(`[geo-tz] ${msg}`)
  process.exit(1)
}

// ── Resolve the version every consumer must agree on ────────────────────────

// 1. The version actually installed in node_modules (what we're about to copy).
const installedVersion = JSON.parse(
  readFileSync(
    path.join(siteRoot, "node_modules", "geo-tz", "package.json"),
    "utf-8"
  )
).version

// 2. The literal the SITE's verify page builds its URL from.
const geoTimezoneSource = readFileSync(
  path.join(siteRoot, "src", "lib", "verification", "geo-timezone.ts"),
  "utf-8"
)
const siteMatch = geoTimezoneSource.match(/GEO_TZ_DATA_VERSION\s*=\s*"([^"]+)"/)
const siteVersion = siteMatch ? siteMatch[1] : null

// 3. The canonical version the EXTENSION builds its CDN URL from. This lives in
//    the extension source ABOVE the site dir, so it's only present when the full
//    repo is checked out (local dev, full-repo CI) — NOT in Vercel's site-rooted
//    build context. Check it opportunistically; never require it.
const extensionDataPath = path.join(
  repoRoot,
  "src",
  "shared",
  "geo-tz-data.json"
)
const canonicalVersion = existsSync(extensionDataPath)
  ? JSON.parse(readFileSync(extensionDataPath, "utf-8")).version
  : null

// ── Guard: versions MUST agree, or the path-versioning guarantee is void ─────
//
// The site build can always see (1) and (2); those drive what data we serve and
// what URL the verify page requests, so they must match. (3) is included when
// present so a drift between the extension and the data is caught locally.
const mismatch =
  installedVersion !== siteVersion ||
  (canonicalVersion !== null && installedVersion !== canonicalVersion)

if (mismatch) {
  fail(
    "geo-tz data version mismatch — refusing to build.\n" +
      `  installed geo-tz package : ${installedVersion}\n` +
      `  site geo-timezone.ts literal : ${siteVersion ?? "<not found>"}\n` +
      `  src/shared/geo-tz-data.json (extension) : ${canonicalVersion ?? "<not in build context>"}\n` +
      "\n" +
      "  These drive the VERSIONED data URL (/geo-tz/<version>/). If they\n" +
      "  disagree, clients can pair a stale cached index with new .dat bytes\n" +
      "  and get silently corrupt timezone lookups. To bump the data:\n" +
      "    1. set geo-tz to the exact new version in site/package.json + lockfile\n" +
      "    2. update GEO_TZ_DATA_VERSION in site/src/lib/verification/geo-timezone.ts\n" +
      "    3. update the version in src/shared/geo-tz-data.json\n" +
      "    4. ship a new extension build so installed clients request the new path"
  )
}

const version = installedVersion

// ── Copy ─────────────────────────────────────────────────────────────────────
//
// Primary, version-scoped location — what current/future builds point at.
const versionedOutDir = path.join(siteRoot, "public", "geo-tz", version)
//
// Legacy unversioned location — TRANSITIONAL. Extension <= 1.21.6 was shipped
// pointing at the unversioned /geo-tz/ path before path-versioning existed. We
// keep emitting it so those already-installed clients keep working while they
// roll over to a versioned build. Safe to delete once 1.21.6 is no longer in
// the field. It stays byte-correct because the version guard above pins the
// data to exactly 8.1.6 — the version 1.21.6 was built against.
const legacyOutDir = path.join(siteRoot, "public", "geo-tz")

for (const dir of [versionedOutDir, legacyOutDir]) {
  mkdirSync(dir, { recursive: true })
}

for (const file of FILES) {
  const src = path.join(srcDir, file)
  if (!existsSync(src)) {
    fail(
      `missing source file: ${src}\n` +
        `  Is the "geo-tz" dependency installed? Run \`npm install\` in site/.`
    )
  }
  for (const outDir of [versionedOutDir, legacyOutDir]) {
    const dest = path.join(outDir, file)
    copyFileSync(src, dest)
    const mb = (statSync(dest).size / 1024 / 1024).toFixed(1)
    console.log(
      `[geo-tz] copied ${file} (${mb} MB) → ${path.relative(siteRoot, dest)}`
    )
  }
}

console.log(`[geo-tz] data version ${version} verified across extension + site`)
