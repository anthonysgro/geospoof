import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const PROJECT = join(ROOT, "safari", "GeoSpoof.xcodeproj", "project.pbxproj");

describe("iOS deployment target", () => {
  it("requires iOS 18 across every iOS build configuration", () => {
    const project = readFileSync(PROJECT, "utf8");
    const targets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map(
      (match) => match[1]
    );

    // App, Safari extension, widget, and the GeoSpoofTests bundle each have Debug + Release.
    //
    // The count is pinned on purpose: it is the canary for a *new* iOS target landing without
    // an iOS 18 floor, which the set assertion below cannot catch on its own — a target with
    // no IPHONEOS_DEPLOYMENT_TARGET at all contributes no match and would pass silently.
    //
    // So if this number moved, do not just bump it. Confirm the new configuration declares
    // 18.0, then bump it and name the target above.
    expect(
      targets,
      `expected 8 iOS build configurations (4 targets x Debug/Release), found ${targets.length}. ` +
        `If you added an iOS target, check it declares IPHONEOS_DEPLOYMENT_TARGET = 18.0, ` +
        `then update this count and the comment above.`
    ).toHaveLength(8);
    expect(new Set(targets)).toEqual(new Set(["18.0"]));
  });
});
