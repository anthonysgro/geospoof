/**
 * Property-Based Tests for Manifest Configuration
 * Feature: geolocation-spoof-extension-mvp, mv3-manifest-compat
 */

import fs from "fs";
import path from "path";
import type { Manifest } from "../../src/shared/types/manifest";

/**
 * Example 10: Manifest Permissions
 *
 * Validates: Requirements 1.1, 1.3, 1.5, 1.6
 *
 * Verify that the manifest.json requests only necessary permissions
 * and uses MV3 structure (host_permissions for <all_urls>).
 */
test("Example 10: Manifest Permissions - manifest.json contains required permissions", () => {
  const manifestPath = path.join(__dirname, "../../manifest.json");
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent) as Manifest;

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
 * This property verifies that the manifest.json file is valid JSON and
 * contains all required fields for a Firefox MV3 extension.
 */
test("Manifest is valid JSON with required fields", () => {
  const manifestPath = path.join(__dirname, "../../manifest.json");
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent) as Manifest;

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
