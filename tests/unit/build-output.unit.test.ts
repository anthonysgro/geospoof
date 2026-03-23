/**
 * Unit tests for build output validation.
 *
 * Validates Firefox and Chromium manifest structures, shared field preservation,
 * and resolveBrowserTarget behavior.
 *
 * Requirements: 1.4, 2.5, 2.6, 9.1, 9.2, 9.3, 9.4
 */

import { generateManifest, resolveBrowserTarget } from "../../src/build/manifest";

const TEST_VERSION = "1.0.0";

function firefoxManifest(): Record<string, unknown> {
  return generateManifest("firefox", TEST_VERSION);
}

function chromiumManifest(): Record<string, unknown> {
  return generateManifest("chromium", TEST_VERSION);
}

// ---------------------------------------------------------------------------
// Firefox manifest structure
// ---------------------------------------------------------------------------
describe("Firefox manifest structure", () => {
  test("has background.scripts array with background/background.js", () => {
    const m = firefoxManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.scripts).toEqual(["background/background.js"]);
  });

  test('has background.type set to "module"', () => {
    const m = firefoxManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.type).toBe("module");
  });

  test("has browser_specific_settings with gecko section", () => {
    const m = firefoxManifest();
    expect(m.browser_specific_settings).toBeDefined();
    const bss = m.browser_specific_settings as Record<string, unknown>;
    expect(bss.gecko).toBeDefined();
  });

  test("has web_accessible_resources with injected.js", () => {
    const m = firefoxManifest();
    expect(m.web_accessible_resources).toBeDefined();
    const war = m.web_accessible_resources as Array<Record<string, unknown>>;
    const resources = war.flatMap((entry) => entry.resources as string[]);
    expect(resources).toContain("content/injected.js");
  });

  test("does NOT have background.service_worker", () => {
    const m = firefoxManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.service_worker).toBeUndefined();
  });

  test('does NOT have any content_scripts entry with world: "MAIN"', () => {
    const m = firefoxManifest();
    const cs = m.content_scripts as Array<Record<string, unknown>>;
    for (const entry of cs) {
      expect(entry.world).toBeUndefined();
    }
  });

  test("preserves all shared fields", () => {
    const m = firefoxManifest();
    expect(m.permissions).toBeDefined();
    expect(m.host_permissions).toBeDefined();
    expect(m.content_scripts).toBeDefined();
    expect(m.action).toBeDefined();
    expect(m.icons).toBeDefined();
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBe("GeoSpoof");
    expect(m.description).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Chromium manifest structure
// ---------------------------------------------------------------------------
describe("Chromium manifest structure", () => {
  test('has background.service_worker set to "background/background.js"', () => {
    const m = chromiumManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.service_worker).toBe("background/background.js");
  });

  test('has background.type set to "module"', () => {
    const m = chromiumManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.type).toBe("module");
  });

  test("does NOT have browser_specific_settings", () => {
    const m = chromiumManifest();
    expect(m.browser_specific_settings).toBeUndefined();
  });

  test("does NOT have background.scripts", () => {
    const m = chromiumManifest();
    const bg = m.background as Record<string, unknown>;
    expect(bg.scripts).toBeUndefined();
  });

  test("has TWO content_scripts entries", () => {
    const m = chromiumManifest();
    const cs = m.content_scripts as Array<Record<string, unknown>>;
    expect(cs).toHaveLength(2);
  });

  test('second content_scripts entry has world: "MAIN", run_at: "document_start", and includes injected.js', () => {
    const m = chromiumManifest();
    const cs = m.content_scripts as Array<Record<string, unknown>>;
    const injectedEntry = cs[1];
    expect(injectedEntry.world).toBe("MAIN");
    expect(injectedEntry.run_at).toBe("document_start");
    expect(injectedEntry.js).toContain("content/injected.js");
  });

  test("does NOT have web_accessible_resources", () => {
    const m = chromiumManifest();
    expect(m.web_accessible_resources).toBeUndefined();
  });

  test("preserves all shared fields", () => {
    const m = chromiumManifest();
    expect(m.permissions).toBeDefined();
    expect(m.host_permissions).toBeDefined();
    expect(m.content_scripts).toBeDefined();
    expect(m.action).toBeDefined();
    expect(m.icons).toBeDefined();
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBe("GeoSpoof");
    expect(m.description).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Shared fields preservation (Firefox vs Chromium)
// ---------------------------------------------------------------------------
describe("Shared fields preservation", () => {
  const sharedKeys = [
    "permissions",
    "host_permissions",
    "action",
    "icons",
    "manifest_version",
    "name",
    "description",
  ] as const;

  test.each(sharedKeys)("Firefox and Chromium manifests have identical %s", (key) => {
    const ff = firefoxManifest();
    const cr = chromiumManifest();
    expect(ff[key]).toEqual(cr[key]);
  });
});

// ---------------------------------------------------------------------------
// resolveBrowserTarget
// ---------------------------------------------------------------------------
describe("resolveBrowserTarget", () => {
  test('returns "firefox" when env is undefined', () => {
    expect(resolveBrowserTarget(undefined)).toBe("firefox");
  });

  test('returns "firefox" when env is "firefox"', () => {
    expect(resolveBrowserTarget("firefox")).toBe("firefox");
  });

  test('returns "chromium" when env is "chromium"', () => {
    expect(resolveBrowserTarget("chromium")).toBe("chromium");
  });

  test.each(["safari", "edge", "Chrome"])("throws for invalid value %j", (value) => {
    expect(() => resolveBrowserTarget(value)).toThrow();
  });

  test('returns "firefox" for empty string (falsy, treated as unset)', () => {
    expect(resolveBrowserTarget("")).toBe("firefox");
  });
});
