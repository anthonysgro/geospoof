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
  const requiredPermissions = ["storage", "privacy", "scripting", "alarms"];

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

test("Both Firefox and Chromium use world:MAIN for injected.js", () => {
  for (const target of ["firefox", "chromium"] as const) {
    const manifest = generateManifest(target, "0.0.1") as unknown as Manifest;
    const injectedEntry = manifest.content_scripts.find(
      (cs) => cs.js?.includes("content/injected.js") && cs.world === "MAIN"
    );
    expect(injectedEntry).toBeDefined();
    expect(injectedEntry!.world).toBe("MAIN");
  }
});
