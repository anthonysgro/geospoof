#!/usr/bin/env node
//
// build-cities.mjs
//
// Generates the bundled offline city database for the native app's
// "Set Location" search. Downloads the GeoNames `cities15000` dataset
// (~33k cities with population ≥ 15,000) plus the country-code table, and
// writes a compact array-of-arrays JSON to:
//
//     safari/Shared (App)/Resources/cities.json
//
// Row format (compact to keep the bundle small and parsing fast):
//     [name, country, latitude, longitude, timezoneId, population, countryCode, continent]
//
// Usage:  node safari/scripts/build-cities.mjs
//
// Swap the THRESHOLD constant to "cities5000" / "cities1000" for an even
// larger set (≈50k / ≈150k cities) at the cost of bundle size.
//

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THRESHOLD = "cities15000";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "Shared (App)", "Resources", "cities.json");

const work = mkdtempSync(join(tmpdir(), "geospoof-cities-"));
console.log(`Working dir: ${work}`);

function run(cmd) {
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], cwd: work });
}

// 1. Download + unzip the datasets.
console.log(`Downloading ${THRESHOLD}.zip …`);
run(`curl -sSL --max-time 120 -o cities.zip "https://download.geonames.org/export/dump/${THRESHOLD}.zip"`);
run(`unzip -o cities.zip`);
console.log("Downloading countryInfo.txt …");
run(`curl -sSL --max-time 120 -o countryInfo.txt "https://download.geonames.org/export/dump/countryInfo.txt"`);

// 2. ISO country code -> country name + continent.
const countryName = {};
const continentOf = {};
for (const line of readFileSync(join(work, "countryInfo.txt"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const f = line.split("\t");
  if (f[0] && f[4]) countryName[f[0]] = f[4];
  if (f[0] && f[8]) continentOf[f[0]] = f[8]; // EU, AS, NA, SA, AF, OC, AN
}

// 3. Parse cities. GeoNames columns:
//    1=name 4=lat 5=lon 8=countryCode 14=population 17=timezone
const rows = [];
for (const line of readFileSync(join(work, `${THRESHOLD}.txt`), "utf8").split("\n")) {
  if (!line) continue;
  const f = line.split("\t");
  const name = f[1];
  const lat = parseFloat(f[4]);
  const lon = parseFloat(f[5]);
  const cc = f[8] ?? "";
  const country = countryName[cc] ?? cc ?? "";
  const continent = continentOf[cc] ?? "";
  const pop = parseInt(f[14], 10) || 0;
  const tz = f[17] ?? "";
  if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;
  rows.push([name, country, Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, tz, pop, cc, continent]);
}

// 4. Sort by population descending so "Popular Cities" and search ranking are
//    sensible out of the box.
rows.sort((a, b) => b[5] - a[5]);

writeFileSync(outFile, JSON.stringify(rows));
const mb = (Buffer.byteLength(JSON.stringify(rows)) / 1024 / 1024).toFixed(2);
console.log(`Wrote ${rows.length} cities to ${outFile} (${mb} MB)`);
