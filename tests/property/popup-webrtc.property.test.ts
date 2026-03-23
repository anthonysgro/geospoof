/**
 * Property-based tests for WebRTC UI reflection
 * Feature: geolocation-spoof-extension-mvp
 *
 * Validates: Requirements 4.4, 5.1
 */

import fc from "fast-check";
import fs from "fs";
import path from "path";
import { loadSettings } from "@/popup/settings";

/**
 * Property 10: WebRTC Protection UI Reflection
 * For any WebRTC protection state (enabled or disabled), the popup UI toggle
 * should accurately reflect the current state.
 *
 * Validates: Requirements 3.5
 */
describe("Property 10: WebRTC Protection UI Reflection", () => {
  beforeEach(() => {
    const html = fs.readFileSync(path.join(__dirname, "../../assets/popup.html"), "utf8");
    document.documentElement.innerHTML = html;
    vi.mocked(browser.tabs.query).mockResolvedValue([]);
  });

  /** Helper to build a valid settings response */
  function makeSettings(overrides: Record<string, unknown> = {}) {
    return {
      enabled: false,
      location: null,
      timezone: null,
      locationName: null,
      webrtcProtection: false,
      onboardingCompleted: true,
      version: "1.0",
      lastUpdated: Date.now(),
      ...overrides,
    };
  }

  test("should reflect WebRTC protection status in UI toggle", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (webrtcEnabled) => {
        document.documentElement.innerHTML = fs.readFileSync(
          path.join(__dirname, "../../assets/popup.html"),
          "utf8"
        );
        vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(
          makeSettings({ webrtcProtection: webrtcEnabled })
        );
        vi.mocked(browser.tabs.query).mockResolvedValue([]);

        await loadSettings();

        const toggle = document.getElementById("webrtcToggle") as HTMLInputElement;
        expect(toggle.checked).toBe(webrtcEnabled);
      }),
      { numRuns: 100 }
    );
  });

  test("should update UI when WebRTC status changes across loadSettings calls", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (firstStatus, secondStatus) => {
        // First load
        document.documentElement.innerHTML = fs.readFileSync(
          path.join(__dirname, "../../assets/popup.html"),
          "utf8"
        );
        vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(
          makeSettings({ webrtcProtection: firstStatus })
        );
        vi.mocked(browser.tabs.query).mockResolvedValue([]);

        await loadSettings();

        const toggle = document.getElementById("webrtcToggle") as HTMLInputElement;
        expect(toggle.checked).toBe(firstStatus);

        // Second load with different status
        vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(
          makeSettings({ webrtcProtection: secondStatus })
        );

        await loadSettings();

        expect(toggle.checked).toBe(secondStatus);
      }),
      { numRuns: 100 }
    );
  });

  test("should maintain UI consistency across multiple WebRTC status changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (statusSequence) => {
          document.documentElement.innerHTML = fs.readFileSync(
            path.join(__dirname, "../../assets/popup.html"),
            "utf8"
          );
          vi.mocked(browser.tabs.query).mockResolvedValue([]);

          for (const status of statusSequence) {
            vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(
              makeSettings({ webrtcProtection: status })
            );
            await loadSettings();
          }

          const finalStatus = statusSequence[statusSequence.length - 1];
          const toggle = document.getElementById("webrtcToggle") as HTMLInputElement;
          expect(toggle.checked).toBe(finalStatus);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("should handle WebRTC toggle independently of protection status", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (protectionEnabled, webrtcEnabled) => {
        document.documentElement.innerHTML = fs.readFileSync(
          path.join(__dirname, "../../assets/popup.html"),
          "utf8"
        );
        vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(
          makeSettings({ enabled: protectionEnabled, webrtcProtection: webrtcEnabled })
        );
        vi.mocked(browser.tabs.query).mockResolvedValue([]);

        await loadSettings();

        const protectionToggle = document.getElementById("protectionToggle") as HTMLInputElement;
        const webrtcToggle = document.getElementById("webrtcToggle") as HTMLInputElement;

        expect(protectionToggle.checked).toBe(protectionEnabled);
        expect(webrtcToggle.checked).toBe(webrtcEnabled);
      }),
      { numRuns: 100 }
    );
  });
});
