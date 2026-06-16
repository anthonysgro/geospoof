/**
 * sync-xcode-version.mjs
 *
 * Reads the version from package.json and updates MARKETING_VERSION in the
 * Xcode project file. Also bumps CURRENT_PROJECT_VERSION (the build number)
 * by 1 across all targets, keeping every entry in sync. Runs automatically
 * via the npm "version" lifecycle hook (triggered by `npm version
 * patch/minor/major`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

const pbxprojPath = path.join(root, "safari/GeoSpoof.xcodeproj/project.pbxproj");

const original = readFileSync(pbxprojPath, "utf8");

// Update marketing version (the human-facing version string).
let updated = original.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);

// Bump the build number (CURRENT_PROJECT_VERSION). Apple requires this to be a
// monotonically increasing integer for each upload. We take the highest value
// currently present and increment it by 1, then apply it to every target so
// they stay in sync.
const buildMatches = [...original.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)];

if (buildMatches.length === 0) {
  console.warn(
    "[sync-xcode-version] No CURRENT_PROJECT_VERSION entries found; build number not bumped."
  );
} else {
  const currentBuild = Math.max(...buildMatches.map((m) => Number(m[1])));
  const nextBuild = currentBuild + 1;
  updated = updated.replace(
    /CURRENT_PROJECT_VERSION = \d+;/g,
    `CURRENT_PROJECT_VERSION = ${nextBuild};`
  );
  console.log(`[sync-xcode-version] Bumped CURRENT_PROJECT_VERSION ${currentBuild} → ${nextBuild}`);
}

if (original === updated) {
  console.log(`[sync-xcode-version] No changes needed (MARKETING_VERSION already ${version}).`);
} else {
  writeFileSync(pbxprojPath, updated, "utf8");
  console.log(`[sync-xcode-version] Updated MARKETING_VERSION → ${version}`);
}
