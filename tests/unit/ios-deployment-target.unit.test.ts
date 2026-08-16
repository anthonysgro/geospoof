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

    // App, Safari extension, and widget each have Debug + Release settings.
    expect(targets).toHaveLength(6);
    expect(new Set(targets)).toEqual(new Set(["18.0"]));
  });
});
