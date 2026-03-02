/**
 * Unit Tests for Content Script Injection
 * Feature: geolocation-spoof-extension-mvp
 */

import fs from "fs";
import path from "path";
import type { Manifest } from "../../../src/shared/types/manifest";

describe("Content Script Injection", () => {
  let manifestContent: Manifest;

  beforeAll(() => {
    // Read manifest.json
    const manifestPath = path.join(__dirname, "../../../manifest.json");
    manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  });

  describe("document_start injection timing", () => {
    test("should configure content script to run at document_start", () => {
      expect(manifestContent.content_scripts).toBeDefined();
      expect(manifestContent.content_scripts.length).toBeGreaterThan(0);

      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript).toBeDefined();
      expect(contentScript!.run_at).toBe("document_start");
    });

    test("should inject into all frames", () => {
      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript!.all_frames).toBe(true);
    });

    test("should inject into all HTTP and HTTPS pages", () => {
      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript!.matches).toBeDefined();
      expect(contentScript!.matches).toContain("<all_urls>");
    });
  });

  describe("injection failure handling", () => {
    test("content script should have error handling for failed settings request", () => {
      const contentScriptPath = path.join(__dirname, "../../../src/content/index.ts");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      expect(contentScriptCode).toContain(".catch");
      expect(contentScriptCode).toContain("Failed to get initial settings");
    });

    test("content script should request initial settings on load", () => {
      const contentScriptPath = path.join(__dirname, "../../../src/content/index.ts");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      expect(contentScriptCode).toContain(".sendMessage");
      expect(contentScriptCode).toContain("GET_SETTINGS");
    });
  });

  describe("API override availability", () => {
    test("injected script should store references to original APIs", () => {
      const injectedScriptPath = path.join(__dirname, "../../../src/content/injected.ts");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      expect(injectedScriptCode).toContain("originalGetCurrentPosition");
      expect(injectedScriptCode).toContain("originalWatchPosition");
      expect(injectedScriptCode).toContain("originalClearWatch");
    });

    test("injected script should override geolocation APIs", () => {
      const injectedScriptPath = path.join(__dirname, "../../../src/content/injected.ts");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      expect(injectedScriptCode).toContain("navigator.geolocation.getCurrentPosition = function");
      expect(injectedScriptCode).toContain("navigator.geolocation.watchPosition = function");
      expect(injectedScriptCode).toContain("navigator.geolocation.clearWatch = function");
    });

    test("content script should inject script into page context", () => {
      const contentScriptPath = path.join(__dirname, "../../../src/content/index.ts");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      expect(contentScriptCode).toContain("browser.runtime.getURL");
      expect(contentScriptCode).toContain("content/injected.js");
    });

    test("injected script should implement createGeolocationPosition helper", () => {
      const injectedScriptPath = path.join(__dirname, "../../../src/content/injected.ts");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      expect(injectedScriptCode).toContain("function createGeolocationPosition");
      expect(injectedScriptCode).toContain("coords:");
      expect(injectedScriptCode).toContain("timestamp:");
    });
  });
});
