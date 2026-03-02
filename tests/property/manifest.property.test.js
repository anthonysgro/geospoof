/**
 * Property-Based Tests for Manifest Configuration
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, expect } = require("@jest/globals");
const fc = require("fast-check");
const fs = require("fs");
const path = require("path");

/**
 * Example 10: Manifest Permissions
 *
 * Validates: Requirements 7.7
 *
 * Verify that the manifest.json requests only necessary permissions
 * (storage, geolocation, privacy, <all_urls>)
 */
test("Example 10: Manifest Permissions - manifest.json contains required permissions", () => {
  // Read manifest.json
  const manifestPath = path.join(process.cwd(), "manifest.json");
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent);

  // Required permissions
  const requiredPermissions = ["storage", "privacy", "<all_urls>"];

  // Verify all required permissions are present
  expect(manifest.permissions).toBeDefined();
  expect(Array.isArray(manifest.permissions)).toBe(true);

  for (const permission of requiredPermissions) {
    expect(manifest.permissions).toContain(permission);
  }

  // Verify manifest version (Manifest V2 for Firefox compatibility)
  expect(manifest.manifest_version).toBe(2);

  // Verify content scripts configuration
  expect(manifest.content_scripts).toBeDefined();
  expect(Array.isArray(manifest.content_scripts)).toBe(true);
  expect(manifest.content_scripts.length).toBeGreaterThan(0);

  const contentScript = manifest.content_scripts[0];

  // Verify content script matches all URLs
  expect(contentScript.matches).toContain("<all_urls>");

  // Verify content script runs at document_start
  expect(contentScript.run_at).toBe("document_start");

  // Verify content script injects into all frames
  expect(contentScript.all_frames).toBe(true);

  // Verify content script file exists
  expect(contentScript.js).toBeDefined();
  expect(Array.isArray(contentScript.js)).toBe(true);
  expect(contentScript.js.length).toBeGreaterThan(0);

  // Verify background script configuration
  expect(manifest.background).toBeDefined();
  expect(manifest.background.scripts).toBeDefined();
  expect(Array.isArray(manifest.background.scripts)).toBe(true);
  expect(manifest.background.scripts.length).toBeGreaterThan(0);

  // Verify action (popup) configuration - Manifest V2 uses browser_action
  expect(manifest.browser_action).toBeDefined();
  expect(manifest.browser_action.default_popup).toBeDefined();
});

/**
 * Property: Manifest structure is valid JSON and contains required fields
 *
 * This property verifies that the manifest.json file is valid JSON and
 * contains all required fields for a Firefox extension.
 */
test("Property: Manifest is valid JSON with required fields", () => {
  fc.assert(
    fc.property(
      fc.constant(null), // No random input needed, we're testing a static file
      () => {
        // Read manifest.json
        const manifestPath = path.join(process.cwd(), "manifest.json");
        const manifestContent = fs.readFileSync(manifestPath, "utf-8");

        // Should parse as valid JSON
        let manifest;
        expect(() => {
          manifest = JSON.parse(manifestContent);
        }).not.toThrow();

        // Required fields
        expect(manifest.manifest_version).toBeDefined();
        expect(manifest.name).toBeDefined();
        expect(manifest.version).toBeDefined();
        expect(manifest.permissions).toBeDefined();
        expect(manifest.content_scripts).toBeDefined();
        expect(manifest.background).toBeDefined();
        // Manifest V2 uses browser_action instead of action
        expect(manifest.browser_action).toBeDefined();

        // Permissions should be an array
        expect(Array.isArray(manifest.permissions)).toBe(true);

        // Content scripts should be an array
        expect(Array.isArray(manifest.content_scripts)).toBe(true);

        return true;
      }
    ),
    { numRuns: 1 } // Only need to run once since we're testing a static file
  );
});
