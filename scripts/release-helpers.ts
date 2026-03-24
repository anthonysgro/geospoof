/**
 * Pure helper functions for the dual-channel release pipeline.
 * Extracted for testability via property-based tests.
 */

const GECKO_ID = "{a8f7e9c2-4d3b-4a1e-9f8c-7b6d5e4a3c2b}";

/** Strips `v` prefix and `-amo` suffix from a tag string. */
export function extractBaseVersion(tag: string): string {
  return tag.replace(/^v/, "").replace(/-amo$/, "");
}

/** Constructs a nightly version string: `{base}-nightly.{runNumber}`. */
export function buildNightlyVersion(base: string, runNumber: number): string {
  return `${base}-nightly.${runNumber}`;
}

/**
 * Returns true if the clean version is newer than the nightly version
 * according to Firefox/semver pre-release ordering.
 *
 * In semver, a version without a pre-release tag (e.g. 1.18.0) is always
 * newer than the same version with a pre-release tag (e.g. 1.18.0-nightly.42).
 */
export function isNewerVersion(clean: string, nightly: string): boolean {
  // Split into [version, prerelease?]
  const [cleanBase] = clean.split("-", 2);
  const [nightlyBase, nightlyPre] = nightly.split("-", 2);

  // Compare base version segments numerically
  const cleanParts = cleanBase.split(".").map(Number);
  const nightlyParts = nightlyBase.split(".").map(Number);
  const len = Math.max(cleanParts.length, nightlyParts.length);

  for (let i = 0; i < len; i++) {
    const c = cleanParts[i] ?? 0;
    const n = nightlyParts[i] ?? 0;
    if (c > n) return true;
    if (c < n) return false;
  }

  // Same base: version without pre-release is newer than one with pre-release
  const cleanHasPre = clean.includes("-");
  const nightlyHasPre = !!nightlyPre;

  if (!cleanHasPre && nightlyHasPre) return true;
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
