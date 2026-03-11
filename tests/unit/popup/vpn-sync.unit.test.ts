/**
 * Unit Tests for Popup VPN Sync Module
 * Feature: vpn-region-sync
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.3, 5.4, 5.5
 */

import fs from "fs";
import path from "path";
import {
  handleVpnSync,
  displayVpnSyncResult,
  displayVpnSyncError,
  setVpnSyncLoading,
} from "@/popup/vpn-sync";

describe("Popup VPN Sync Module", () => {
  beforeEach(() => {
    // Load popup.html into jsdom
    const html = fs.readFileSync(path.join(__dirname, "../../../assets/popup.html"), "utf8");
    document.documentElement.innerHTML = html;
  });

  describe("displayVpnSyncResult", () => {
    /**
     * Test: displays IP on success (region shown in main location area)
     * Validates: Requirements 3.3, 5.4
     */
    test("should display detected IP in the status panel", () => {
      displayVpnSyncResult({
        latitude: 40.7128,
        longitude: -74.006,
        city: "New York",
        country: "United States",
        ip: "203.0.113.42",
      });

      const statusEl = document.getElementById("vpnSyncStatus");
      const ipEl = document.getElementById("vpnSyncIp");

      expect(statusEl?.style.display).toBe("block");
      expect(ipEl?.textContent).toBe("Detected IP: 203.0.113.42");
    });

    /**
     * Test: hides "Sync Now" and shows "Re-sync" after first success
     * Validates: Requirements 3.6, 5.1
     */
    test("should hide Sync Now button and show Re-sync button after success", () => {
      displayVpnSyncResult({
        latitude: 51.5074,
        longitude: -0.1278,
        city: "London",
        country: "United Kingdom",
        ip: "198.51.100.1",
      });

      const syncBtn = document.getElementById("vpnSyncButton");
      const resyncBtn = document.getElementById("vpnResyncButton");

      expect(syncBtn?.style.display).toBe("none");
      expect(resyncBtn?.style.display).toBe("block");
    });

    /**
     * Test: hides error display on success
     * Validates: Requirements 5.4
     */
    test("should hide error display when result is shown", () => {
      // First show an error
      const errorEl = document.getElementById("vpnSyncError");
      if (errorEl) errorEl.style.display = "block";

      displayVpnSyncResult({
        latitude: 35.6762,
        longitude: 139.6503,
        city: "Tokyo",
        country: "Japan",
        ip: "192.0.2.1",
      });

      expect(errorEl?.style.display).toBe("none");
    });
  });

  describe("displayVpnSyncError", () => {
    /**
     * Test: shows error message inline
     * Validates: Requirements 5.5
     */
    test("should display error message in the error panel", () => {
      displayVpnSyncError({
        error: "IP_DETECTION_FAILED",
        message: "Could not detect your public IP address.",
      });

      const errorEl = document.getElementById("vpnSyncError");
      expect(errorEl?.style.display).toBe("block");
      expect(errorEl?.textContent).toBe("Could not detect your public IP address.");
    });

    /**
     * Test: re-enables Re-sync button on error when it's visible
     * Validates: Requirements 5.5
     */
    test("should re-enable Re-sync button when visible", () => {
      const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;
      resyncBtn.style.display = "block";
      resyncBtn.disabled = true;

      displayVpnSyncError({
        error: "GEOLOCATION_FAILED",
        message: "Could not determine location for your IP address.",
      });

      expect(resyncBtn.disabled).toBe(false);
    });

    /**
     * Test: does not enable Re-sync button when it's hidden (first sync failed)
     * Validates: Requirements 5.5
     */
    test("should not enable Re-sync button when it is hidden", () => {
      const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;
      // Initially hidden (display: none from HTML)
      expect(resyncBtn.style.display).toBe("none");

      displayVpnSyncError({
        error: "NETWORK",
        message: "A network error occurred.",
      });

      // Button should remain as-is since it's hidden
      expect(resyncBtn.style.display).toBe("none");
    });
  });

  describe("setVpnSyncLoading", () => {
    /**
     * Test: disables buttons and adds loading class when loading
     * Validates: Requirements 5.3
     */
    test("should disable buttons and add loading class when loading=true", () => {
      setVpnSyncLoading(true);

      const syncBtn = document.getElementById("vpnSyncButton") as HTMLButtonElement;
      const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;

      expect(syncBtn.disabled).toBe(true);
      expect(syncBtn.classList.contains("loading")).toBe(true);
      expect(resyncBtn.disabled).toBe(true);
      expect(resyncBtn.classList.contains("loading")).toBe(true);
    });

    /**
     * Test: enables buttons and removes loading class when done
     * Validates: Requirements 5.3
     */
    test("should enable buttons and remove loading class when loading=false", () => {
      // First set loading
      setVpnSyncLoading(true);
      // Then clear loading
      setVpnSyncLoading(false);

      const syncBtn = document.getElementById("vpnSyncButton") as HTMLButtonElement;
      const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;

      expect(syncBtn.disabled).toBe(false);
      expect(syncBtn.classList.contains("loading")).toBe(false);
      expect(resyncBtn.disabled).toBe(false);
      expect(resyncBtn.classList.contains("loading")).toBe(false);
    });
  });

  describe("handleVpnSync", () => {
    /**
     * Test: sends SYNC_VPN message with forceRefresh=false
     * Validates: Requirements 3.2
     */
    test("should send SYNC_VPN message with forceRefresh=false for initial sync", async () => {
      vi.mocked(browser.runtime.sendMessage)
        .mockResolvedValueOnce({
          latitude: 48.8566,
          longitude: 2.3522,
          city: "Paris",
          country: "France",
          ip: "203.0.113.10",
        })
        // loadSettings GET_SETTINGS call
        .mockResolvedValueOnce({
          enabled: true,
          location: { latitude: 48.8566, longitude: 2.3522, accuracy: 10 },
          timezone: null,
          locationName: { city: "Paris", country: "France", displayName: "Paris, France" },
          webrtcProtection: false,
          onboardingCompleted: true,
          version: "1.0",
          lastUpdated: Date.now(),
          vpnSyncEnabled: true,
        });

      await handleVpnSync(false);

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: "SYNC_VPN",
        payload: { forceRefresh: false },
      });
    });

    /**
     * Test: sends SYNC_VPN message with forceRefresh=true for re-sync
     * Validates: Requirements 5.2
     */
    test("should send SYNC_VPN message with forceRefresh=true for re-sync", async () => {
      vi.mocked(browser.runtime.sendMessage)
        .mockResolvedValueOnce({
          latitude: 52.52,
          longitude: 13.405,
          city: "Berlin",
          country: "Germany",
          ip: "198.51.100.5",
        })
        .mockResolvedValueOnce({
          enabled: true,
          location: { latitude: 52.52, longitude: 13.405, accuracy: 10 },
          timezone: null,
          locationName: { city: "Berlin", country: "Germany", displayName: "Berlin, Germany" },
          webrtcProtection: false,
          onboardingCompleted: true,
          version: "1.0",
          lastUpdated: Date.now(),
          vpnSyncEnabled: true,
        });

      await handleVpnSync(true);

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: "SYNC_VPN",
        payload: { forceRefresh: true },
      });
    });

    /**
     * Test: displays error when sync fails
     * Validates: Requirements 5.5
     */
    test("should display error when SYNC_VPN returns error response", async () => {
      vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
        error: "IP_DETECTION_FAILED",
        message: "Could not detect your public IP address.",
      });

      await handleVpnSync(false);

      const errorEl = document.getElementById("vpnSyncError");
      expect(errorEl?.style.display).toBe("block");
      expect(errorEl?.textContent).toBe("Could not detect your public IP address.");
    });

    /**
     * Test: displays error on network exception
     * Validates: Requirements 5.5
     */
    test("should display network error when sendMessage throws", async () => {
      vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error("Connection lost"));

      await handleVpnSync(false);

      const errorEl = document.getElementById("vpnSyncError");
      expect(errorEl?.style.display).toBe("block");
      expect(errorEl?.textContent).toBe("A network error occurred. Please try again.");
    });

    /**
     * Test: clears loading state after sync completes
     * Validates: Requirements 5.3
     */
    test("should clear loading state after sync completes (success)", async () => {
      vi.mocked(browser.runtime.sendMessage)
        .mockResolvedValueOnce({
          latitude: 35.6762,
          longitude: 139.6503,
          city: "Tokyo",
          country: "Japan",
          ip: "192.0.2.1",
        })
        .mockResolvedValueOnce({
          enabled: true,
          location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
          timezone: null,
          locationName: null,
          webrtcProtection: false,
          onboardingCompleted: true,
          version: "1.0",
          lastUpdated: Date.now(),
          vpnSyncEnabled: true,
        });

      await handleVpnSync(false);

      const syncBtn = document.getElementById("vpnSyncButton") as HTMLButtonElement;
      expect(syncBtn.classList.contains("loading")).toBe(false);
    });

    /**
     * Test: clears loading state after sync fails
     * Validates: Requirements 5.3
     */
    test("should clear loading state after sync fails", async () => {
      vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
        error: "NETWORK",
        message: "A network error occurred.",
      });

      await handleVpnSync(false);

      const syncBtn = document.getElementById("vpnSyncButton") as HTMLButtonElement;
      const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement;
      expect(syncBtn.disabled).toBe(false);
      expect(resyncBtn.disabled).toBe(false);
    });
  });
});
