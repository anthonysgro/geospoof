#!/usr/bin/env node
/**
 * Generator for the locale-spoofing offline mapping data.
 *
 * Produces two committed data modules consumed ONLY by `match` mode of the
 * Reported Language feature (see .kiro/specs/locale-spoofing):
 *
 *   src/shared/locale/zone-country.ts    IANA timezone id  -> ISO 3166-1 alpha-2
 *   src/shared/locale/country-locale.ts  ISO 3166-1 alpha-2 -> dominant BCP47 tag
 *
 * Both outputs are committed to the repo so the extension needs no network and
 * no build-time data fetch. Re-run this script to refresh them:
 *
 *   node scripts/generate-locale-data.mjs
 *
 * ── Sources (both authoritative, both local) ──────────────────────────────
 *
 * 1. Zone -> country comes from the system tzdata `zone.tab`, which is the
 *    upstream IANA mapping. Every canonical zone belongs to exactly one
 *    country, so this needs no heuristics.
 *
 * 2. Alias coverage: tzdata ships backward-compatibility names (e.g.
 *    `Asia/Calcutta` for `Asia/Kolkata`) that do NOT appear in zone.tab, but
 *    third-party geo APIs still return them, so `match` mode should understand
 *    them. On macOS these aliases are byte-identical COPIES of their target
 *    (not sym/hard links, verified), so they are recovered by grouping every
 *    zone file by content hash and inheriting the country of the canonical
 *    zone.tab members of its group.
 *
 *    Safety rule: several genuinely distinct zones are byte-identical (many
 *    Caribbean zones share one rule set), so an alias whose hash group spans
 *    MORE THAN ONE country is skipped rather than guessed. Correctness beats
 *    coverage here — an unmapped zone makes the resolver return null and report
 *    the real locale, which is the safe direction.
 *
 * 3. Country -> dominant language comes from ICU/CLDR "likely subtags" via
 *    `new Intl.Locale('und-XX').maximize()`. That is the same data browsers
 *    use, so the derived tag is what the engine itself considers the likely
 *    language for the region. Baking the result into a static table (rather
 *    than calling maximize() at runtime) keeps the Reported_Locale deterministic
 *    across engines with differing ICU versions.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const ZONEINFO_DIR = "/usr/share/zoneinfo";
const ZONE_TAB = join(ZONEINFO_DIR, "zone.tab");
// Resolved from this file's own location via node:path/node:url rather than the
// `URL` global, which the repo's eslint config does not expose to scripts.
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "shared", "locale");

/** Top-level entries in the zoneinfo tree that are not zones. */
const NON_ZONE_ENTRIES = new Set([
  "zone.tab",
  "zone1970.tab",
  "zonenow.tab",
  "iso3166.tab",
  "leapseconds",
  "leap-seconds.list",
  "tzdata.zi",
  "posixrules",
  "localtime",
  "Factory",
  "+VERSION",
]);

/** Directories whose contents are not real geographic zones. */
const NON_ZONE_DIRS = new Set(["right", "posix", "SystemV", "Etc"]);

// ── 1. Parse zone.tab: canonical zone -> country ──────────────────────────

/** @type {Map<string, string>} */
const canonicalZoneCountry = new Map();

for (const rawLine of readFileSync(ZONE_TAB, "utf8").split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const [country, , zone] = line.split("\t");
  if (!country || !zone) continue;
  canonicalZoneCountry.set(zone, country);
}

if (canonicalZoneCountry.size === 0) {
  throw new Error(`Parsed no zones from ${ZONE_TAB}`);
}

// ── 2. Recover aliases by content hash ────────────────────────────────────

/**
 * Recursively collect every zone file path (relative to ZONEINFO_DIR).
 * @param {string} dir
 * @param {string[]} acc
 * @returns {string[]}
 */
function collectZoneFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (NON_ZONE_ENTRIES.has(entry) || NON_ZONE_DIRS.has(entry)) continue;
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // dangling link / unreadable
    }
    if (st.isDirectory()) {
      collectZoneFiles(full, acc);
    } else if (st.isFile()) {
      acc.push(relative(ZONEINFO_DIR, full));
    }
  }
  return acc;
}

/** @type {Map<string, string[]>} hash -> zone ids */
const byHash = new Map();

for (const zone of collectZoneFiles(ZONEINFO_DIR)) {
  let buf;
  try {
    buf = readFileSync(join(ZONEINFO_DIR, zone));
  } catch {
    continue;
  }
  // Only real TZif files.
  if (buf.length < 4 || buf.subarray(0, 4).toString("ascii") !== "TZif") continue;
  const hash = createHash("sha1").update(buf).digest("hex");
  const group = byHash.get(hash);
  if (group) group.push(zone);
  else byHash.set(hash, [zone]);
}

/** @type {Map<string, string>} final zone -> country, canonical + unambiguous aliases */
const zoneCountry = new Map(canonicalZoneCountry);

let aliasCount = 0;
const skipped = [];

for (const group of byHash.values()) {
  // Countries claimed by the canonical (zone.tab) members of this hash group.
  const countries = new Set();
  for (const zone of group) {
    const c = canonicalZoneCountry.get(zone);
    if (c) countries.add(c);
  }
  // No canonical anchor, or the group spans multiple countries -> cannot
  // attribute the aliases safely. Skip (resolver will return null).
  if (countries.size !== 1) {
    for (const zone of group) {
      if (!canonicalZoneCountry.has(zone)) skipped.push(zone);
    }
    continue;
  }
  const [country] = [...countries];
  for (const zone of group) {
    if (!zoneCountry.has(zone)) {
      zoneCountry.set(zone, country);
      aliasCount++;
    }
  }
}

// ── 3. Country -> dominant BCP47 tag via ICU likely-subtags ───────────────

/** @type {Map<string, string>} */
const countryLocale = new Map();
const unresolvedCountries = [];

// NOTE: deliberately NOT filtered by this generator's `supportedLocalesOf`.
// The tags are consumed by BROWSERS, whose ICU builds differ from Node's, so
// filtering on Node's data would drop tags Chrome/Firefox handle fine (Haiti,
// Paraguay, and the Maldives were all lost that way). The data stays pure CLDR
// and the RESOLVER performs the engine-capability check at runtime against the
// actual host engine, falling back to reporting the real locale when the tag is
// unsupported there.
for (const country of [...new Set(zoneCountry.values())].sort()) {
  let tag = null;
  try {
    const language = new Intl.Locale(`und-${country}`).maximize().language;
    // `und` means CLDR has no likely language for the region.
    if (language && language !== "und") tag = `${language}-${country}`;
  } catch {
    tag = null;
  }
  if (tag) countryLocale.set(country, tag);
  else unresolvedCountries.push(country);
}

// ── 4. Emit ───────────────────────────────────────────────────────────────

const GENERATED_BANNER = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Regenerate with:  node scripts/generate-locale-data.mjs
 *
 * See that script for the data sources and the alias-attribution safety rule.
 */`;

/**
 * @param {Map<string, string>} map
 * @returns {string}
 */
function emitEntries(map) {
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
}

const zoneCountrySrc = `${GENERATED_BANNER}

/**
 * IANA timezone identifier -> ISO 3166-1 alpha-2 country code.
 *
 * Includes the canonical zones from tzdata \`zone.tab\` plus every
 * backward-compatibility alias that could be attributed to exactly one country.
 * Aliases whose tzdata rules are shared across multiple countries are
 * deliberately absent: \`match\` mode treats an unmapped zone as "cannot
 * resolve" and reports the user's real locale instead of guessing.
 *
 * Generated from tzdata ${canonicalZoneCountry.size} canonical zones + ${aliasCount} aliases.
 */
export const ZONE_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
${emitEntries(zoneCountry)}
});

/**
 * Look up the ISO 3166-1 alpha-2 country for an IANA timezone identifier.
 * Returns \`null\` for an unknown or unattributable zone.
 */
export function countryForTimezone(identifier: string): string | null {
  if (!identifier) return null;
  return ZONE_COUNTRY[identifier] ?? null;
}
`;

const countryLocaleSrc = `${GENERATED_BANNER}

/**
 * ISO 3166-1 alpha-2 country code -> dominant region-qualified BCP47 tag.
 *
 * Derived from ICU/CLDR likely-subtags (\`new Intl.Locale('und-XX').maximize()\`)
 * — the same data browsers use. Region-qualified on purpose (\`FR\` -> \`fr-FR\`,
 * not bare \`fr\`) so \`Intl\` derives region-correct formats, separators, and
 * hour cycle.
 *
 * NOT filtered by any engine's locale-data availability: these tags run in
 * browsers whose ICU builds differ from the generator's, so the capability check
 * belongs at runtime. \`resolveLocale\` performs it against the host engine and
 * reports the user's real locale when a tag is unsupported there.
 *
 * This is a "likely language", not a statement about a country's official or
 * only languages; multilingual countries necessarily collapse to one tag.
 *
 * Generated for ${countryLocale.size} countries.${
   unresolvedCountries.length > 0
     ? `\n * Unresolved (no likely-subtag data, omitted): ${unresolvedCountries.join(", ")}.`
     : ""
 }
 */
export const COUNTRY_LOCALE: Readonly<Record<string, string>> = Object.freeze({
${emitEntries(countryLocale)}
});

/**
 * Look up the dominant BCP47 tag for an ISO 3166-1 alpha-2 country code.
 * Returns \`null\` when the country has no mapping.
 */
export function localeForCountry(country: string): string | null {
  if (!country) return null;
  return COUNTRY_LOCALE[country] ?? null;
}
`;

/**
 * Write a generated module, formatted with the repo's own Prettier config.
 *
 * Formatting here (rather than relying on a follow-up `npm run format`) keeps
 * regeneration idempotent: `npm run validate` runs `format:check` over these
 * committed files, so a generator that emitted almost-but-not-quite formatted
 * output would turn every data refresh into a spurious CI failure.
 *
 * @param {string} filename
 * @param {string} source
 */
async function writeFormatted(filename, source) {
  const target = join(OUT_DIR, filename);
  const config = (await prettier.resolveConfig(target)) ?? {};
  const formatted = await prettier.format(source, { ...config, parser: "typescript" });
  writeFileSync(target, formatted);
}

await writeFormatted("zone-country.ts", zoneCountrySrc);
await writeFormatted("country-locale.ts", countryLocaleSrc);

console.log(
  `zone-country.ts   ${zoneCountry.size} zones (${canonicalZoneCountry.size} canonical + ${aliasCount} aliases)`
);
console.log(`country-locale.ts ${countryLocale.size} countries`);
if (skipped.length > 0) {
  console.log(
    `skipped ${skipped.length} ambiguous alias(es): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? ", ..." : ""}`
  );
}
if (unresolvedCountries.length > 0) {
  console.log(`no likely-subtag data for: ${unresolvedCountries.join(", ")}`);
}
console.log(`node ${process.version}, ICU ${process.versions.icu}`);
