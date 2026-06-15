/**
 * sync-xcode-version.mjs
 *
 * Reads the version from package.json and updates MARKETING_VERSION in the
 * Xcode project file. Runs automatically via the npm "version" lifecycle hook
 * (triggered by `npm version patch/minor/major`).
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
const updated = original.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);

if (original === updated) {
  console.log(`[sync-xcode-version] MARKETING_VERSION already ${version}, no change.`);
} else {
  writeFileSync(pbxprojPath, updated, "utf8");
  console.log(`[sync-xcode-version] Updated MARKETING_VERSION → ${version}`);
}
