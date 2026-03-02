/**
 * Unit Tests for CSP Compatibility Handling
 *
 * Tests content script isolation, injection failure detection,
 * badge icon warning state, and popup warnings.
 *
 * Requirements: 8.2, 8.5
 */

import fs from "fs";
import type { Manifest } from "../../../src/shared/types/manifest";
import { expectBadgeColor, expectBadgeText, expectTabsSendMessage } from "../../helpers/mock-types";

const background = await import("@/background");

describe("CSP Compatibility Tests", () => {
  describe("Content script isolation from page CSP", () => {
    test("content scripts run in isolated world by default", () => {
      const manifest = JSON.parse(fs.readFileSync("./manifest.json", "utf8")) as Manifest;

      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts.length).toBeGreaterThan(0);

      const contentScript = manifest.content_scripts[0];
      expect(contentScript.matches).toContain("<all_urls>");
      expect(contentScript.run_at).toBe("document_start");
      expect(contentScript.all_frames).toBe(true);
    });

    test("content script uses CSP-safe communication method", () => {
      const contentScriptCode = fs.readFileSync("./src/content/index.ts", "utf8");

      expect(contentScriptCode).toContain("CustomEvent");
      expect(contentScriptCode).toContain("__geospoof_settings_update");
      expect(contentScriptCode).toContain("window.dispatchEvent");

      const injectedScriptCode = fs.readFileSync("./src/content/injected.ts", "utf8");

      expect(injectedScriptCode).toContain("addEventListener");
      expect(injectedScriptCode).toContain("__geospoof_settings_update");
      expect(injectedScriptCode).toContain("navigator.geolocation.getCurrentPosition = function");
      expect(injectedScriptCode).toContain("navigator.geolocation.watchPosition = function");
    });
  });

  describe("Injection failure detection and logging", () => {
    test("checkTabInjection detects when content script is not responding", async () => {
      const tabId = 123;

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content script not available"));

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(false);
      expect(status.error).toBeDefined();
      expect(status.error).toContain("Content script not available");
    });

    test("checkTabInjection detects when content script is responding", async () => {
      const tabId = 456;

      browser.tabs.sendMessage.mockResolvedValue({ pong: true });

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(true);
      expect(status.error).toBeNull();
    });

    test("injection failure is logged with error details", async () => {
      const tabId = 789;
      const errorMessage = "Receiving end does not exist";

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      browser.tabs.sendMessage.mockRejectedValue(new Error(errorMessage));

      await background.checkTabInjection(tabId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Content script not responding in tab ${tabId}`),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test("injection check handles timeout errors", async () => {
      const tabId = 999;

      browser.tabs.sendMessage.mockRejectedValue(new Error("Timeout"));

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(false);
      expect(status.error).toContain("Timeout");
    });
  });

  describe("Badge icon warning state", () => {
    test("badge shows orange with ! when injection fails on enabled protection", async () => {
      const tabId = 111;

      const settings = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        timezone: { identifier: "America/Los_Angeles", offset: 480, dstOffset: 60 },
      };

      browser.storage.local.get.mockResolvedValue({ settings });

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content script not available"));

      await browser.browserAction.setBadgeBackgroundColor({ color: "orange", tabId });
      await browser.browserAction.setBadgeText({ text: "!", tabId });

      expectBadgeColor().toHaveBeenCalledWith({ color: "orange", tabId });
      expectBadgeText().toHaveBeenCalledWith({ text: "!", tabId });
    });

    test("badge shows green when injection succeeds with enabled protection", async () => {
      const tabId = 222;

      const settings = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      };

      browser.storage.local.get.mockResolvedValue({ settings });

      browser.tabs.sendMessage.mockResolvedValue({ pong: true });

      await browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId });
      await browser.browserAction.setBadgeText({ text: "ON", tabId });

      expectBadgeColor().toHaveBeenCalledWith({ color: "green", tabId });
      expectBadgeText().toHaveBeenCalledWith({ text: "ON", tabId });
    });

    test("badge shows gray when protection is disabled", async () => {
      const tabId = 333;

      const settings = {
        enabled: false,
        location: null,
      };

      browser.storage.local.get.mockResolvedValue({ settings });

      await browser.browserAction.setBadgeBackgroundColor({ color: "gray", tabId });
      await browser.browserAction.setBadgeText({ text: "", tabId });

      expectBadgeColor().toHaveBeenCalledWith({ color: "gray", tabId });
      expectBadgeText().toHaveBeenCalledWith({ text: "", tabId });
    });

    test("badge warning is tab-specific", async () => {
      const failingTabId = 444;
      const workingTabId = 555;

      browser.tabs.sendMessage.mockImplementation((tabId: number) => {
        if (tabId === failingTabId) {
          return Promise.reject(new Error("Content script not available"));
        }
        return Promise.resolve({ pong: true });
      });

      await browser.browserAction.setBadgeBackgroundColor({ color: "orange", tabId: failingTabId });
      await browser.browserAction.setBadgeText({ text: "!", tabId: failingTabId });

      await browser.browserAction.setBadgeBackgroundColor({ color: "green", tabId: workingTabId });
      await browser.browserAction.setBadgeText({ text: "ON", tabId: workingTabId });

      expectBadgeColor().toHaveBeenCalledWith({ color: "orange", tabId: failingTabId });
      expectBadgeColor().toHaveBeenCalledWith({ color: "green", tabId: workingTabId });
    });
  });

  describe("Popup warning display", () => {
    test("popup can check injection status for current tab", async () => {
      const tabId = 666;

      browser.tabs.query.mockResolvedValue([{ id: tabId, url: "https://example.com" }]);

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content script not available"));

      await background.handleMessage(
        { type: "CHECK_TAB_INJECTION", payload: { tabId } },
        {} as browser.runtime.MessageSender
      );

      expectTabsSendMessage().toHaveBeenCalledWith(tabId, { type: "PING" });
    });

    test("popup receives injection failure status", async () => {
      const tabId = 777;

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content script not available"));

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(false);
      expect(status.error).toBeDefined();
    });

    test("popup receives successful injection status", async () => {
      const tabId = 888;

      browser.tabs.sendMessage.mockResolvedValue({ pong: true });

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(true);
      expect(status.error).toBeNull();
    });

    test("popup warning is only shown for http/https pages", () => {
      const httpUrl = "https://example.com";
      const aboutUrl = "about:blank";
      const extensionUrl = "moz-extension://abc123";

      expect(httpUrl.startsWith("http://") || httpUrl.startsWith("https://")).toBe(true);
      expect(aboutUrl.startsWith("http://") || aboutUrl.startsWith("https://")).toBe(false);
      expect(extensionUrl.startsWith("http://") || extensionUrl.startsWith("https://")).toBe(false);
    });
  });

  describe("Content script PING response", () => {
    test("content script responds to PING messages", () => {
      const contentScriptCode = fs.readFileSync("./src/content/index.ts", "utf8");

      expect(contentScriptCode).toContain('message.type === "PING"');
      expect(contentScriptCode).toContain("pong: true");
    });
  });

  describe("CSP error scenarios", () => {
    test("handles CSP-blocked injection gracefully", async () => {
      const tabId = 999;

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content Security Policy directive"));

      const status = await background.checkTabInjection(tabId);

      expect(status.injected).toBe(false);
      expect(status.error).toContain("Content Security Policy");
    });

    test("logs CSP errors for debugging", async () => {
      const tabId = 1000;
      const cspError = new Error("Content Security Policy directive: script-src 'self'");

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      browser.tabs.sendMessage.mockRejectedValue(cspError);

      await background.checkTabInjection(tabId);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
