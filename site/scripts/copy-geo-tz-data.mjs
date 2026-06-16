// Copies the geo-tz boundary data into public/geo-tz/ so it's served as a
// same-origin static asset (see src/lib/verification/geo-timezone.ts for why).
//
// Runs before `vite build`. Sourced from the pinned `geo-tz` npm package rather
// than downloaded, so the data version is locked by package.json and the build
// has no network dependency. The files are large (~30 MB) and reproducible, so
// public/geo-tz/ is gitignored — this script regenerates them on every build.
//
// We copy the full `timezones.geojson` dataset (not the -1970 variant) to match
// the extension's resolution, which avoids the 1970 variant's Etc/GMT coastal
// fallbacks.

import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(__dirname, "..")
const srcDir = path.join(siteRoot, "node_modules", "geo-tz", "data")
const outDir = path.join(siteRoot, "public", "geo-tz")

const FILES = ["timezones.geojson.geo.dat", "timezones.geojson.index.json"]

mkdirSync(outDir, { recursive: true })

for (const file of FILES) {
  const src = path.join(srcDir, file)
  if (!existsSync(src)) {
    console.error(
      `[geo-tz] missing source file: ${src}\n` +
        `  Is the "geo-tz" dependency installed? Run \`npm install\` in site/.`
    )
    process.exit(1)
  }
  const dest = path.join(outDir, file)
  copyFileSync(src, dest)
  const mb = (statSync(dest).size / 1024 / 1024).toFixed(1)
  console.log(`[geo-tz] copied ${file} (${mb} MB) → public/geo-tz/`)
}
