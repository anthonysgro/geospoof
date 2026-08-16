/**
 * Property-Based Tests for Manifest Configuration
 * Feature: geolocation-spoof-extension-mvp, mv3-manifest-compat, chromium-browser-compat
 */

import type { Manifest } from "../../src/shared/types/manifest";
import { generateManifest } from "../../src/build/manifest";

/** Helper: generate a Firefox manifest with a test version and cast to Manifest type. */
function firefoxManifest(): Manifest {
  return generateManifest("firefox", "0.0.1") as unknown as Manifest;
}

/**
 * Example 10: Manifest Permissions
 *
 * Validates: Requirements 1.1, 1.3, 1.5, 1.6
 *
 * Verify that the manifest.json requests only necessary permissions
 * and uses MV3 structure (host_permissions for <all_urls>).
 */
test("Example 10: Manifest Permissions - manifest.json contains required permissions", () => {
  const manifest = firefoxManifest();

  // Required permissions (MV3: <all_urls> moved to host_permissions)
  const requiredPermissions = ["storage", "privacy", "proxy", "scripting", "alarms"];

  expect(manifest.permissions).toBeDefined();
  expect(Array.isArray(manifest.permissions)).toBe(true);

  for (const permission of requiredPermissions) {
    expect(manifest.permissions).toContain(permission);
  }

  // <all_urls> should be in host_permissions, not permissions
  expect(manifest.permissions).not.toContain("<all_urls>");
  expect(manifest.host_permissions).toBeDefined();
  expect(manifest.host_permissions).toContain("<all_urls>");

  // Verify manifest version is 3
  expect(manifest.manifest_version).toBe(3);

  // Verify content scripts configuration
  expect(manifest.content_scripts).toBeDefined();
  expect(Array.isArray(manifest.content_scripts)).toBe(true);
  expect(manifest.content_scripts.length).toBeGreaterThan(0);

  const contentScript = manifest.content_scripts[0];
  expect(contentScript.matches).toContain("<all_urls>");
  expect(contentScript.run_at).toBe("document_start");
  expect(contentScript.all_frames).toBe(true);
  expect(contentScript.js).toBeDefined();
  expect(Array.isArray(contentScript.js)).toBe(true);
  expect(contentScript.js.length).toBeGreaterThan(0);

  // Verify background script configuration (MV3: type module, no persistent)
  expect(manifest.background).toBeDefined();
  expect(manifest.background.scripts).toBeDefined();
  expect(Array.isArray(manifest.background.scripts)).toBe(true);
  expect(manifest.background.scripts.length).toBeGreaterThan(0);
  expect(manifest.background.type).toBe("module");
  expect((manifest.background as unknown as Record<string, unknown>).persistent).toBeUndefined();

  // Verify action (popup) configuration - MV3 uses "action" not "browser_action"
  expect(manifest.action).toBeDefined();
  expect(manifest.action.default_popup).toBeDefined();
  expect(manifest.browser_action).toBeUndefined();
});

/**
 * Property: Manifest structure is valid JSON and contains required fields
 *
 * This property verifies that the generated manifest contains all required
 * fields for a Firefox MV3 extension.
 */
test("Manifest is valid JSON with required fields", () => {
  const manifest = firefoxManifest();

  // Required fields
  expect(manifest.manifest_version).toBeDefined();
  expect(manifest.name).toBeDefined();
  expect(manifest.version).toBeDefined();
  expect(manifest.permissions).toBeDefined();
  expect(manifest.content_scripts).toBeDefined();
  expect(manifest.background).toBeDefined();
  // MV3 uses "action" instead of "browser_action"
  expect(manifest.action).toBeDefined();

  expect(Array.isArray(manifest.permissions)).toBe(true);
  expect(Array.isArray(manifest.content_scripts)).toBe(true);
});

/**
 * Firefox injected script uses world: "MAIN" at document_start
 *
 * Verifies that the Firefox manifest declares injected.js as a world: "MAIN"
 * content script so it runs in page context before any inline page scripts,
 * without requiring a sync XHR injection workaround.
 *
 * Firefox 128+ supports world: "MAIN"; our minimum is Firefox 140.
 */
test("Firefox manifest: injected.js declared as world:MAIN content script", () => {
  const manifest = firefoxManifest();

  const injectedEntry = manifest.content_scripts.find(
    (cs) => cs.js?.includes("content/injected.js") && cs.world === "MAIN"
  );

  expect(injectedEntry).toBeDefined();
  expect(injectedEntry!.run_at).toBe("document_start");
  expect(injectedEntry!.all_frames).toBe(true);
  expect(injectedEntry!.matches).toContain("<all_urls>");
});

test("Chromium manifest: injected.js declared as world:MAIN content script", () => {
  const manifest = generateManifest("chromium", "0.0.1") as unknown as Manifest;

  const injectedEntry = manifest.content_scripts.find(
    (cs) => cs.js?.includes("content/injected.js") && cs.world === "MAIN"
  );

  expect(injectedEntry).toBeDefined();
  expect(injectedEntry!.run_at).toBe("document_start");
  expect(injectedEntry!.all_frames).toBe(true);
});

test("Every supported browser uses world:MAIN for injected.js", () => {
  for (const target of ["firefox", "chromium", "safari"] as const) {
    const manifest = generateManifest(target, "0.0.1") as unknown as Manifest;
    const injectedEntry = manifest.content_scripts.find(
      (cs) => cs.js?.includes("content/injected.js") && cs.world === "MAIN"
    );
    expect(injectedEntry).toBeDefined();
    expect(injectedEntry!.world).toBe("MAIN");
  }
});

/**
 * Safari declares the MAIN-world content script in the manifest.
 *
 * Safari 18 is the minimum supported OS, so the declarative path is both the
 * earliest and the only injection path. This keeps injection independent of
 * background-page startup and prevents accidental double installation.
 */
test("Safari manifest: injected.js is declared once as a MAIN-world content script", () => {
  const safari = generateManifest("safari", "0.0.1") as unknown as Manifest;

  const injectedEntries = safari.content_scripts.filter((cs) =>
    cs.js?.includes("content/injected.js")
  );
  expect(injectedEntries).toHaveLength(1);
  expect(injectedEntries[0].world).toBe("MAIN");
  expect(injectedEntries[0].run_at).toBe("document_start");
  expect(injectedEntries[0].all_frames).toBe(true);
  expect(injectedEntries[0].matches).toContain("<all_urls>");

  // The isolated-world relay content script must still be declared statically.
  const relayEntry = safari.content_scripts.find((cs) => cs.js?.includes("content/content.js"));
  expect(relayEntry).toBeDefined();
  expect(relayEntry!.run_at).toBe("document_start");
  expect(relayEntry!.all_frames).toBe(true);
  expect(relayEntry!.matches).toContain("<all_urls>");
});

/**
 * Safari still needs `scripting` for best-effort catch-up injection of the
 * isolated relay into already-open tabs after an extension update.
 */
test("Safari manifest: retains the scripting permission used for existing-tab catch-up", () => {
  const safari = generateManifest("safari", "0.0.1") as unknown as Manifest;
  expect(safari.permissions).toContain("scripting");
});

/**
 * Manifest injection reads injected.js out of the extension package, so it
 * must not be exposed to pages. Listing it in `web_accessible_resources` would
 * hand page code a stable probe for the extension's presence and id — a
 * regression for an extension whose value depends on not being detectable.
 */
test("Safari manifest: does not expose injected.js to pages via web_accessible_resources", () => {
  const safari = generateManifest("safari", "0.0.1");
  expect(safari.web_accessible_resources).toBeUndefined();
});

/**
 * Proxy permission gating for the VPN-sync proxy-change watcher.
 *
 * The watcher observes `proxy.settings.onChange` to detect when a browser-based
 * VPN switches exit nodes. That requires the `proxy` permission on the engines
 * that expose the API (Chromium, Firefox desktop). Safari has no proxy
 * WebExtensions API, so the permission must be omitted there (it would be an
 * invalid permission and the watcher feature-detects to a no-op anyway).
 */
test("proxy permission present on Firefox and Chromium, absent on Safari", () => {
  const firefox = generateManifest("firefox", "0.0.1") as unknown as Manifest;
  const chromium = generateManifest("chromium", "0.0.1") as unknown as Manifest;
  const safari = generateManifest("safari", "0.0.1") as unknown as Manifest;

  expect(firefox.permissions).toContain("proxy");
  expect(chromium.permissions).toContain("proxy");
  expect(safari.permissions).not.toContain("proxy");

  // Safari also omits `privacy` (unsupported) — guard against regressing the
  // shared filter that strips both.
  expect(safari.permissions).not.toContain("privacy");
});

/**
 * Accept-Language header rewriting (locale-spoofing Req 10.2, 10.3, 10.4).
 *
 * The variant of the declarativeNetRequest permission is a correctness issue,
 * not a style choice. Both variants grant identical capabilities, but only the
 * plain `declarativeNetRequest` form carries an install-time permission warning
 * — and Chrome DISABLES an extension until the user manually re-accepts whenever
 * an update adds a permission with a new warning. Shipping the plain form would
 * therefore silently disable GeoSpoof for every existing Chrome user.
 * `declarativeNetRequestWithHostAccess` leans on the `<all_urls>` host
 * permission we already hold and adds no warning. This test exists so that
 * distinction cannot be undone by accident.
 */
test("Chromium and Safari request declarativeNetRequestWithHostAccess, never the warning-carrying variant", () => {
  const chromium = generateManifest("chromium", "0.0.1") as unknown as Manifest;
  const safari = generateManifest("safari", "0.0.1") as unknown as Manifest;

  for (const [name, manifest] of [
    ["chromium", chromium],
    ["safari", safari],
  ] as const) {
    expect(manifest.permissions, name).toContain("declarativeNetRequestWithHostAccess");
    // The plain form would add an install warning and disable the extension for
    // existing users on update.
    expect(manifest.permissions, name).not.toContain("declarativeNetRequest");
    // modifyHeaders requires host access, which must stay present.
    expect(manifest.host_permissions, name).toContain("<all_urls>");
  }
});

test("Firefox needs no declarativeNetRequest permission for the header rewrite", () => {
  // Firefox uses blocking webRequest.onBeforeSendHeaders, and `webRequest` +
  // `webRequestBlocking` are already required for the worker script filter — so
  // the header rewrite adds no permission on Firefox at all.
  const firefox = generateManifest("firefox", "0.0.1") as unknown as Manifest;

  expect(firefox.permissions).toContain("webRequest");
  expect(firefox.permissions).toContain("webRequestBlocking");
  expect(firefox.permissions).not.toContain("declarativeNetRequest");
  expect(firefox.permissions).not.toContain("declarativeNetRequestWithHostAccess");
});
