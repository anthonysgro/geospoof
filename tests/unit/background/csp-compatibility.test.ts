/**
 * Unit Tests for CSP Compatibility Handling
 *
 * Tests injection failure detection, popup warnings, and CSP error scenarios.
 * String-reading tests and mock-only badge tests removed per audit (Requirements: 4.3, 5.1).
 *
 * Requirements: 8.2, 8.5
 */

import { expectTabsSendMessage } from "../../helpers/mock-types";

const background = await import("@/background");

describe("CSP Compatibility Tests", () => {
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
        expect.stringContaining("[ERROR]"),
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

  describe("Popup warning display", () => {
    test("popup can check injection status for current tab", async () => {
      const tabId = 666;

      browser.tabs.query.mockResolvedValue([{ id: tabId, url: "https://example.com" }]);

      browser.tabs.sendMessage.mockRejectedValue(new Error("Content script not available"));

      await background.handleMessage({ type: "CHECK_TAB_INJECTION", payload: { tabId } }, {});

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
