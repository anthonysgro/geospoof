/**
 * Pure helper functions for the dual-channel release pipeline.
 * Extracted for testability via property-based tests.
 */

const GECKO_ID = "{a8f7e9c2-4d3b-4a1e-9f8c-7b6d5e4a3c2b}";

/** Strips `v` prefix and `-amo` suffix from a tag string. */
export function extractBaseVersion(tag: string): string {
  return tag.replace(/^v/, "").replace(/-amo$/, "");
}

/** Constructs a nightly version string: `{base}.{runNumber}` (4-segment, AMO-compatible). */
export function buildNightlyVersion(base: string, runNumber: number): string {
  return `${base}.${runNumber}`;
}

/**
 * Returns true if the clean version is newer than the nightly version
 * according to Firefox's dot-separated numeric version comparison.
 *
 * Firefox compares version segments left to right numerically, with missing
 * segments treated as 0. For example: 1.18.0 > 1.17.3.15 because 18 > 17.
 *
 * In the dual-channel model, the AMO listed version should always have a
 * higher base version than any nightly, ensuring users auto-upgrade.
 */
export function isNewerVersion(clean: string, nightly: string): boolean {
  const cleanParts = clean.split(".").map(Number);
  const nightlyParts = nightly.split(".").map(Number);
  const len = Math.max(cleanParts.length, nightlyParts.length);

  for (let i = 0; i < len; i++) {
    const c = cleanParts[i] ?? 0;
    const n = nightlyParts[i] ?? 0;
    if (c > n) return true;
    if (c < n) return false;
  }

  return false;
}

/** Strict equality check between tag-derived version and package.json version. */
export function versionsMatch(tagVersion: string, packageVersion: string): boolean {
  return tagVersion === packageVersion;
}

/** Returns the update manifest JSON structure for Firefox self-hosted updates. */
export function generateUpdateManifest(version: string, url: string): object {
  return {
    addons: {
      [GECKO_ID]: {
        updates: [{ version, update_link: url }],
      },
    },
  };
}

/** Returns the canonical signed XPI filename. */
export function formatSignedXpiName(baseVersion: string): string {
  return `geospoof-${baseVersion}-signed.xpi`;
}
