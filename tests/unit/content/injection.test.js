/**
 * Unit Tests for Content Script Injection
 * Feature: geolocation-spoof-extension-mvp
 */

const fs = require("fs");
const path = require("path");

describe("Content Script Injection", () => {
  let manifestContent;

  beforeAll(() => {
    // Read manifest.json
    const manifestPath = path.join(__dirname, "../../../manifest.json");
    manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  });

  describe("document_start injection timing", () => {
    test("should configure content script to run at document_start", () => {
      expect(manifestContent.content_scripts).toBeDefined();
      expect(manifestContent.content_scripts.length).toBeGreaterThan(0);

      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript).toBeDefined();
      expect(contentScript.run_at).toBe("document_start");
    });

    test("should inject into all frames", () => {
      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript.all_frames).toBe(true);
    });

    test("should inject into all HTTP and HTTPS pages", () => {
      const contentScript = manifestContent.content_scripts.find(
        (cs) => cs.js && cs.js.includes("content/content.js")
      );

      expect(contentScript.matches).toBeDefined();
      expect(contentScript.matches).toContain("<all_urls>");
    });
  });

  describe("injection failure handling", () => {
    test("content script should have error handling for failed settings request", () => {
      // Read content script
      const contentScriptPath = path.join(__dirname, "../../../content/content.js");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      // Verify error handling exists
      expect(contentScriptCode).toContain(".catch");
      expect(contentScriptCode).toContain("Failed to get initial settings");
    });

    test("content script should request initial settings on load", () => {
      // Read content script
      const contentScriptPath = path.join(__dirname, "../../../content/content.js");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      // Verify initial settings request
      expect(contentScriptCode).toContain("browser.runtime.sendMessage");
      expect(contentScriptCode).toContain("GET_SETTINGS");
    });
  });

  describe("API override availability", () => {
    test("injected script should store references to original APIs", () => {
      // Read injected script (where API overrides actually happen)
      const injectedScriptPath = path.join(__dirname, "../../../content/injected.js");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      // Verify original API references are stored
      expect(injectedScriptCode).toContain("originalGetCurrentPosition");
      expect(injectedScriptCode).toContain("originalWatchPosition");
      expect(injectedScriptCode).toContain("originalClearWatch");
    });

    test("injected script should override geolocation APIs", () => {
      // Read injected script (where API overrides actually happen)
      const injectedScriptPath = path.join(__dirname, "../../../content/injected.js");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      // Verify geolocation API overrides
      expect(injectedScriptCode).toContain("navigator.geolocation.getCurrentPosition = function");
      expect(injectedScriptCode).toContain("navigator.geolocation.watchPosition = function");
      expect(injectedScriptCode).toContain("navigator.geolocation.clearWatch = function");
    });

    test("content script should inject script into page context", () => {
      // Read content script
      const contentScriptPath = path.join(__dirname, "../../../content/content.js");
      const contentScriptCode = fs.readFileSync(contentScriptPath, "utf8");

      // Verify script injection
      expect(contentScriptCode).toContain("browser.runtime.getURL");
      expect(contentScriptCode).toContain("content/injected.js");
    });

    test("injected script should implement createGeolocationPosition helper", () => {
      // Read injected script
      const injectedScriptPath = path.join(__dirname, "../../../content/injected.js");
      const injectedScriptCode = fs.readFileSync(injectedScriptPath, "utf8");

      // Verify helper function exists
      expect(injectedScriptCode).toContain("function createGeolocationPosition");
      expect(injectedScriptCode).toContain("coords:");
      expect(injectedScriptCode).toContain("timestamp:");
    });
  });
});
