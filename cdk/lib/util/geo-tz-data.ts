import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface GeoTzDataSource {
  /** The geo-tz data version, e.g. "8.1.6". Drives the versioned S3 key prefix. */
  readonly version: string;
  /** Absolute path to the directory holding the boundary data files. */
  readonly dataDir: string;
  /** The two full-dataset files we upload (and nothing else). */
  readonly files: readonly [string, string];
}

// We ship the FULL `timezones.geojson` dataset (not the -1970 / -now variants),
// matching the extension's resolver — the variants land coastal points in
// fingerprintable Etc/GMT buckets.
const FILES: [string, string] = ["timezones.geojson.geo.dat", "timezones.geojson.index.json"];

/**
 * Resolve the geo-tz data version + on-disk location, enforcing the SAME
 * cross-file version invariant as site/scripts/copy-geo-tz-data.mjs:
 *
 *   the installed `geo-tz` npm package version (what we upload)
 *   MUST equal the canonical version in src/shared/geo-tz-data.json
 *   (what the extension builds its data URL from).
 *
 * A mismatch becomes a loud synth-time failure instead of a silent,
 * user-facing data-corruption bug — a returning client pairing a stale cached
 * index with new .dat byte offsets gets garbage/null lookups and a real-zone
 * leak. Version-scoped paths (/geo-tz/<version>/) prevent that, but only if the
 * version actually agrees across the extension and the uploaded data.
 */
export function resolveGeoTzData(): GeoTzDataSource {
  // cdk/lib/util -> repo root is three levels up.
  const repoRoot = resolve(__dirname, "../../..");
  const pkgPath = resolve(repoRoot, "site/node_modules/geo-tz/package.json");
  const dataDir = resolve(repoRoot, "site/node_modules/geo-tz/data");
  const canonicalPath = resolve(repoRoot, "src/shared/geo-tz-data.json");

  if (!existsSync(pkgPath)) {
    throw new Error(
      `geo-tz is not installed at ${pkgPath}.\n` + "Run `npm install` in site/ before synthesizing."
    );
  }

  const installedVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;
  const canonicalVersion = JSON.parse(readFileSync(canonicalPath, "utf-8")).version as string;

  if (installedVersion !== canonicalVersion) {
    throw new Error(
      "geo-tz data version mismatch — refusing to synth.\n" +
        `  installed geo-tz package    : ${installedVersion}\n` +
        `  src/shared/geo-tz-data.json : ${canonicalVersion}\n\n` +
        "These drive the versioned data URL (/geo-tz/<version>/). If they disagree, " +
        "clients can pair a stale cached index with new .dat byte offsets and get " +
        "silently corrupt timezone lookups. Align both versions, then re-run."
    );
  }

  for (const f of FILES) {
    const p = resolve(dataDir, f);
    if (!existsSync(p)) {
      throw new Error(`missing geo-tz data file: ${p}`);
    }
  }

  return { version: installedVersion, dataDir, files: FILES };
}
