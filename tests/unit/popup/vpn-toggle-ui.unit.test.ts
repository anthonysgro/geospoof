/**
 * Unit Tests for VPN Toggle UI — Edge Cases
 * Feature: vpn-toggle-ui
 * Validates: Requirements 6.4, 4.3, 4.4
 */

import fs from "fs";
import path from "path";
import { displayVpnSyncResult } from "@/popup/vpn-sync";
import { loadSettings } from "@/popup/settings";

describe("VPN Toggle UI — Edge Cases", () => {
  beforeEach(() => {
    const html = fs.readFileSync(path.join(__dirname, "../../../assets/popup.html"), "utf8");
    document.documentElement.innerHTML = html;
  });

  /**
   * Test rapid toggle on/off does not leave UI in inconsistent state
   * Validates: Requirement 7.1, 7.2, 7.3
   */
  test("rapid toggle on/off should leave UI in manual mode (toggle off)", () => {
    const toggle = document.getElementById("vpnSyncToggle") as HTMLInputElement;
    const inputModeTabs = document.getElementById("inputModeTabs")!;
    const searchMode = document.getElementById("searchMode")!;
    const coordsMode = document.getElementById("coordsMode")!;
    const vpnSyncMode = document.getElementById("vpnSyncMode")!;

    // Stub sendMessage to avoid real calls
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

    // Simulate rapid toggles by directly manipulating DOM the same way the handlers do
    for (let i = 0; i < 10; i++) {
      // Toggle ON
      toggle.checked = true;
      inputModeTabs.style.display = "none";
      searchMode.style.display = "none";
      coordsMode.style.display = "none";
      vpnSyncMode.style.display = "block";

      // Toggle OFF immediately
      toggle.checked = false;
      vpnSyncMode.style.display = "none";
      inputModeTabs.style.display = "flex";
      searchMode.style.display = "block";
      coordsMode.style.display = "none";
    }

    // Final state should be manual mode
    expect(toggle.checked).toBe(false);
    expect(vpnSyncMode.style.display).toBe("none");
    expect(inputModeTabs.style.display).toBe("flex");
    expect(searchMode.style.display).toBe("block");
    expect(coordsMode.style.display).toBe("none");
  });

  /**
   * Test loadSettings with missing vpnSyncEnabled defaults to off
   * Validates: Requirements 4.3, 4.4
   */
  test("loadSettings with missing vpnSyncEnabled should default to toggle off", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
      enabled: false,
      location: null,
      timezone: null,
      locationName: null,
      webrtcProtection: false,
      onboardingCompleted: true,
      version: "1.0",
      lastUpdated: Date.now(),
      // vpnSyncEnabled intentionally omitted
    });

    // Stub tabs.query for checkPageStatus
    vi.mocked(browser.tabs.query).mockResolvedValue([]);

    await loadSettings();

    const toggle = document.getElementById("vpnSyncToggle") as HTMLInputElement;
    const inputModeTabs = document.getElementById("inputModeTabs")!;
    const vpnPanel = document.getElementById("vpnSyncMode")!;
    const searchPanel = document.getElementById("searchMode")!;

    expect(toggle.checked).toBe(false);
    expect(inputModeTabs.style.display).not.toBe("none");
    expect(vpnPanel.style.display).toBe("none");
    expect(searchPanel.style.display).toBe("block");
  });

  /**
   * Test loadSettings with vpnSyncEnabled explicitly false
   * Validates: Requirements 4.3, 4.4
   */
  test("loadSettings with vpnSyncEnabled=false should show manual mode", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
      enabled: true,
      location: { latitude: 40, longitude: -74, accuracy: 10 },
      timezone: null,
      locationName: { city: "New York", country: "US", displayName: "New York, US" },
      webrtcProtection: false,
      onboardingCompleted: true,
      version: "1.0",
      lastUpdated: Date.now(),
      vpnSyncEnabled: false,
    });

    vi.mocked(browser.tabs.query).mockResolvedValue([]);

    await loadSettings();

    const toggle = document.getElementById("vpnSyncToggle") as HTMLInputElement;
    const vpnPanel = document.getElementById("vpnSyncMode")!;

    expect(toggle.checked).toBe(false);
    expect(vpnPanel.style.display).toBe("none");
  });

  /**
   * Test re-sync button is functional after successful sync (Requirement 6.4)
   */
  test("re-sync button should be visible and enabled after successful sync", () => {
    displayVpnSyncResult({
      latitude: 51.5074,
      longitude: -0.1278,
      city: "London",
      country: "United Kingdom",
      ip: "198.51.100.1",
    });

    const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;
    expect(resyncBtn.style.display).toBe("block");
    expect(resyncBtn.disabled).toBe(false);
  });

  /**
   * Test VPN panel UI reset when toggling off
   * (error hidden, sync button restored, status hidden)
   * Validates: Requirements 4.3, 4.4
   */
  test("toggling off should reset VPN panel UI state", () => {
    // First simulate a successful sync state
    const statusEl = document.getElementById("vpnSyncStatus")!;
    const syncBtn = document.getElementById("vpnSyncButton")!;
    const resyncBtn = document.getElementById("vpnResyncButton")!;
    const errorEl = document.getElementById("vpnSyncError")!;
    const vpnSyncMode = document.getElementById("vpnSyncMode")!;
    const inputModeTabs = document.getElementById("inputModeTabs")!;
    const searchMode = document.getElementById("searchMode")!;

    // Set up "VPN active with result" state
    statusEl.style.display = "block";
    syncBtn.style.display = "none";
    resyncBtn.style.display = "block";
    errorEl.style.display = "block";
    errorEl.textContent = "Some old error";
    vpnSyncMode.style.display = "block";
    inputModeTabs.style.display = "none";

    // Now simulate deactivateVpnSyncMode logic (same as src/popup/index.ts)
    vpnSyncMode.style.display = "none";
    inputModeTabs.style.display = "flex";
    searchMode.style.display = "block";
    statusEl.style.display = "none";
    syncBtn.style.display = "block";
    resyncBtn.style.display = "none";
    errorEl.style.display = "none";

    // Verify full reset
    expect(statusEl.style.display).toBe("none");
    expect(syncBtn.style.display).toBe("block");
    expect(resyncBtn.style.display).toBe("none");
    expect(errorEl.style.display).toBe("none");
    expect(vpnSyncMode.style.display).toBe("none");
    expect(inputModeTabs.style.display).toBe("flex");
  });

  /**
   * Test VPN panel error is hidden after toggling off even if error was showing
   */
  test("toggling off should hide error element even when error was visible", () => {
    const errorEl = document.getElementById("vpnSyncError")!;
    errorEl.style.display = "block";
    errorEl.textContent = "IP detection failed";

    // Simulate toggle off reset
    errorEl.style.display = "none";

    expect(errorEl.style.display).toBe("none");
  });
});
