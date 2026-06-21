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

  test('has a content_scripts entry with world: "MAIN" for injected.js', () => {
    const m = firefoxManifest();
    const cs = m.content_scripts as Array<Record<string, unknown>>;
    const mainWorldEntry = cs.find(
      (entry) =>
        entry.world === "MAIN" &&
        Array.isArray(entry.js) &&
        (entry.js as string[]).includes("content/injected.js")
    );
    expect(mainWorldEntry).toBeDefined();
    expect(mainWorldEntry!.run_at).toBe("document_start");
    expect(mainWorldEntry!.all_frames).toBe(true);
  });

  test("preserves all shared fields", () => {
    const m = firefoxManifest();
    expect(m.permissions).toBeDefined();
    expect(m.host_permissions).toBeDefined();
    expect(m.content_scripts).toBeDefined();
    expect(m.action).toBeDefined();
    expect(m.icons).toBeDefined();
    expect(m.manifest_version).toBe(3);
    // Name and description are now __MSG_*__ references so the browser
    // picks the right locale from _locales/<lang>/messages.json. The
    // actual displayed name/description is asserted in the i18n
    // test suite against the messages.json files themselves.
    expect(m.name).toBe("__MSG_extensionName__");
    expect(m.description).toBe("__MSG_extensionDescription__");
    expect(m.default_locale).toBe("en");
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
    // Chromium overrides the name with a literal keyword-rich string for the
    // Chrome Web Store listing (Firefox/Safari keep __MSG_extensionName__).
    expect(m.name).toBe("GeoSpoof: Spoof Geolocation, Timezone & WebRTC");
    expect(m.description).toBe("__MSG_extensionDescription__");
    expect(m.default_locale).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// Shared fields preservation (Firefox vs Chromium)
// ---------------------------------------------------------------------------
describe("Shared fields preservation", () => {
  // NOTE: `permissions` intentionally diverges between Firefox and Chromium
  // because Firefox needs `webRequest` for worker filterResponseData
  // (Firefox-only in MV3). That divergence is tested below with a
  // dedicated assertion instead of the identity check.
  const sharedKeys = [
    "host_permissions",
    "action",
    "icons",
    "manifest_version",
    "description",
  ] as const;

  test.each(sharedKeys)("Firefox and Chromium manifests have identical %s", (key) => {
    const ff = firefoxManifest();
    const cr = chromiumManifest();
    expect(ff[key]).toEqual(cr[key]);
  });

  // `name` intentionally diverges: Chromium overrides it with a literal
  // keyword-rich string for the Chrome Web Store listing, while Firefox keeps
  // the localized `__MSG_extensionName__` reference (→ "GeoSpoof" on AMO).
  test("name diverges — Firefox localized, Chromium literal", () => {
    expect(firefoxManifest().name).toBe("__MSG_extensionName__");
    expect(chromiumManifest().name).toBe("GeoSpoof: Spoof Geolocation, Timezone & WebRTC");
  });

  test("Firefox manifest includes the Chromium permission set plus required worker-filter permissions", () => {
    const ff = firefoxManifest().permissions as string[];
    const cr = chromiumManifest().permissions as string[];

    // Every Chromium permission must appear on Firefox.
    for (const p of cr) expect(ff).toContain(p);

    // Firefox adds the webRequest.filterResponseData permission set
    // as required permissions so the background can always-on the
    // worker script filter without a runtime prompt. Chromium MV3
    // removed response-body modification so these are deliberately
    // absent there.
    expect(ff).toContain("webRequest");
    expect(ff).toContain("webRequestBlocking");
    expect(ff).toContain("webRequestFilterResponse");
    expect(ff).toContain("webRequestFilterResponse.serviceWorkerScript");
    expect(cr).not.toContain("webRequest");
    expect(cr).not.toContain("webRequestBlocking");
    expect(cr).not.toContain("webRequestFilterResponse");
    expect(cr).not.toContain("webRequestFilterResponse.serviceWorkerScript");

    // Firefox declares `userScripts` as an optional-only permission (it is
    // requested at runtime from a user gesture to close the synchronous-
    // timezone cold-start race). It must NOT appear under required permissions
    // — Firefox drops optional-only permissions listed there. Chromium has no
    // optional_permissions block.
    expect(firefoxManifest().optional_permissions).toEqual(["userScripts"]);
    expect(ff).not.toContain("userScripts");
    expect(chromiumManifest().optional_permissions).toBeUndefined();
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

  test.each(["edge", "Chrome"])("throws for invalid value %j", (value) => {
    expect(() => resolveBrowserTarget(value)).toThrow();
  });

  test('returns "safari" when env is "safari"', () => {
    expect(resolveBrowserTarget("safari")).toBe("safari");
  });

  test('returns "firefox" for empty string (falsy, treated as unset)', () => {
    expect(resolveBrowserTarget("")).toBe("firefox");
  });
});
