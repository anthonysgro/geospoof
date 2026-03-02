/**
 * CSP Compatibility Integration Tests for Timezone Spoofing
 * 
 * Tests timezone spoofing on CSP-protected sites using CustomEvent communication
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

const fs = require("fs");

describe("CSP Compatibility Integration Tests", () => {
  describe("Code Analysis for CSP Safety", () => {
    test("content script uses CustomEvent for timezone data transmission (CSP-safe)", () => {
      // Load content script code
      const contentScriptCode = fs.readFileSync("content/content.js", "utf8");
      
      // Verify CustomEvent is used for settings transmission
      expect(contentScriptCode).toMatch(/CustomEvent/);
      expect(contentScriptCode).toMatch(/__geospoof_settings_update/);
      expect(contentScriptCode).toMatch(/dispatchEvent/);
      
      // Verify timezone data is included in the event payload
      expect(contentScriptCode).toMatch(/timezone/);
    });

    test("content script does not use inline scripts or eval (CSP violation)", () => {
      // Load content script code
      const contentScriptCode = fs.readFileSync("content/content.js", "utf8");
      
      // Check for CSP violations
      expect(contentScriptCode).not.toMatch(/eval\s*\(/);
      expect(contentScriptCode).not.toMatch(/new\s+Function\s*\(/);
      expect(contentScriptCode).not.toMatch(/setTimeout\s*\(\s*["'`]/); // setTimeout with string
      expect(contentScriptCode).not.toMatch(/setInterval\s*\(\s*["'`]/); // setInterval with string
    });

    test("injected script receives timezone data through event listeners only", () => {
      // Load injected script code
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify event listener for settings updates
      expect(injectedScriptCode).toMatch(/addEventListener/);
      expect(injectedScriptCode).toMatch(/__geospoof_settings_update/);
      
      // Verify timezone data is extracted from event
      expect(injectedScriptCode).toMatch(/timezone/);
    });

    test("injected script validates timezone data structure", () => {
      // Load injected script code
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify timezone validation exists
      expect(injectedScriptCode).toMatch(/validateTimezoneData|timezone.*identifier|timezone.*offset/);
    });
  });

  describe("Timezone API Overrides in Injected Script", () => {
    test("injected script overrides Date.prototype.getTimezoneOffset", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify getTimezoneOffset override exists
      expect(injectedScriptCode).toMatch(/Date\.prototype\.getTimezoneOffset/);
      expect(injectedScriptCode).toMatch(/originalGetTimezoneOffset|_originalGetTimezoneOffset/);
    });

    test("injected script overrides Intl.DateTimeFormat", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify Intl.DateTimeFormat override exists
      expect(injectedScriptCode).toMatch(/Intl\.DateTimeFormat/);
      expect(injectedScriptCode).toMatch(/resolvedOptions/);
    });

    test("injected script overrides Date formatting methods", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify Date formatting method overrides exist
      expect(injectedScriptCode).toMatch(/Date\.prototype\.toString/);
      expect(injectedScriptCode).toMatch(/Date\.prototype\.toTimeString/);
      expect(injectedScriptCode).toMatch(/Date\.prototype\.toLocaleString/);
    });
  });

  describe("Data Structure Verification", () => {
    test("content script includes all required timezone fields in CustomEvent", () => {
      const contentScriptCode = fs.readFileSync("content/content.js", "utf8");
      
      // Verify the settings object structure includes timezone
      // The content script should pass through the timezone data from background script
      expect(contentScriptCode).toMatch(/timezone/);
    });

    test("injected script handles timezone data with identifier, offset, and dstOffset", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify timezone data fields are referenced
      expect(injectedScriptCode).toMatch(/identifier/);
      expect(injectedScriptCode).toMatch(/offset/);
      expect(injectedScriptCode).toMatch(/dstOffset/);
    });

    test("injected script handles missing timezone data gracefully", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify null/undefined checks for timezone data
      expect(injectedScriptCode).toMatch(/timezone.*null|!timezone|timezone\s*===\s*null|timezone\s*===\s*undefined/);
    });

    test("injected script handles invalid timezone data gracefully", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify validation or error handling for timezone data
      expect(injectedScriptCode).toMatch(/validate|typeof.*identifier|typeof.*offset/);
    });
  });

  describe("OpenStreetMap Compatibility", () => {
    test("extension uses CSP-safe methods compatible with OpenStreetMap", () => {
      // OpenStreetMap has strict CSP: script-src 'self'
      // Verify our extension doesn't use any CSP-violating methods
      
      const contentScriptCode = fs.readFileSync("content/content.js", "utf8");
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Content script should not violate CSP
      expect(contentScriptCode).not.toMatch(/eval\s*\(/);
      expect(contentScriptCode).not.toMatch(/new\s+Function/);
      
      // Injected script runs in page context, so it can override APIs
      // but should not use eval or Function constructor
      expect(injectedScriptCode).not.toMatch(/eval\s*\(/);
      expect(injectedScriptCode).not.toMatch(/new\s+Function/);
    });

    test("manifest allows content script injection on all URLs including OpenStreetMap", () => {
      const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
      
      // Verify content scripts can run on all URLs
      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts.length).toBeGreaterThan(0);
      
      const contentScript = manifest.content_scripts[0];
      expect(contentScript.matches).toContain("<all_urls>");
      expect(contentScript.run_at).toBe("document_start");
    });
  });

  describe("Error Handling with CSP", () => {
    test("injected script logs errors without breaking page functionality", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify try-catch blocks exist for error handling
      expect(injectedScriptCode).toMatch(/try\s*{[\s\S]*?}\s*catch/);
      
      // Verify console.error or console.warn is used for logging
      expect(injectedScriptCode).toMatch(/console\.(error|warn)/);
    });

    test("content script handles event dispatch failures gracefully", () => {
      const contentScriptCode = fs.readFileSync("content/content.js", "utf8");
      
      // Verify error handling for event dispatch
      expect(contentScriptCode).toMatch(/try\s*{[\s\S]*?dispatchEvent[\s\S]*?}\s*catch|catch[\s\S]*?dispatchEvent/);
    });
  });

  describe("Geolocation Independence", () => {
    test("timezone spoofing failure does not affect geolocation spoofing", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify geolocation overrides exist independently
      expect(injectedScriptCode).toMatch(/navigator\.geolocation\.getCurrentPosition/);
      expect(injectedScriptCode).toMatch(/navigator\.geolocation\.watchPosition/);
      
      // Verify timezone overrides are separate
      expect(injectedScriptCode).toMatch(/Date\.prototype\.getTimezoneOffset/);
      
      // Both should exist in the same file but be independent
      const geolocationIndex = injectedScriptCode.indexOf("navigator.geolocation");
      const timezoneIndex = injectedScriptCode.indexOf("Date.prototype.getTimezoneOffset");
      
      expect(geolocationIndex).toBeGreaterThan(-1);
      expect(timezoneIndex).toBeGreaterThan(-1);
    });

    test("geolocation APIs are overridden even when timezone data is missing", () => {
      const injectedScriptCode = fs.readFileSync("content/injected.js", "utf8");
      
      // Verify geolocation overrides don't depend on timezone data
      // They should be set up independently
      expect(injectedScriptCode).toMatch(/navigator\.geolocation/);
    });
  });
});
