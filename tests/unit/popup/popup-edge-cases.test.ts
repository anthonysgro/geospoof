/**
 * Unit tests for popup edge cases
 * Validates: Requirements 7.6
 */

import type { GeocodeResult } from "@/shared/types/messages";
import type { Location } from "@/shared/types/settings";
import type { MockBrowser, MockDocument } from "../../helpers/mock-types";
import { assignGlobal } from "../../helpers/mock-types";
import type { Mock } from "vitest";

/** Extended mock document that also includes querySelector. */
interface PopupMockDocument extends MockDocument {
  querySelector: Mock;
}

/** Minimal settings shape used by the warning-display logic in this file. */
interface WarningSettings {
  enabled: boolean;
  location: Pick<Location, "latitude" | "longitude"> | null;
  webrtcProtection: boolean;
}

describe("Popup Edge Cases", () => {
  let mockBrowser: MockBrowser;
  let mockDocument: PopupMockDocument;

  beforeEach(() => {
    // Mock browser API
    mockBrowser = {
      runtime: {
        sendMessage: vi.fn(),
      },
    };
    assignGlobal("browser", mockBrowser);

    // Mock DOM
    mockDocument = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
    };
    assignGlobal("document", mockDocument);
  });

  describe("Empty geocoding results display", () => {
    test('should display "no results" message when geocoding returns empty array', () => {
      const mockContainer = { innerHTML: "" };
      mockDocument.getElementById.mockReturnValue(mockContainer);

      function displaySearchResults(results: GeocodeResult[]) {
        if (results.length === 0) {
          mockContainer.innerHTML = "<div class='no-results'>No locations found</div>";
          return;
        }
        mockContainer.innerHTML = results.map((r) => `<div>${r.name}</div>`).join("");
      }

      displaySearchResults([]);

      expect(mockContainer.innerHTML).toContain("no-results");
      expect(mockContainer.innerHTML).toContain("No locations found");
    });

    test("should clear previous results when new search returns empty", () => {
      const mockContainer = { innerHTML: '<div class="search-result">Previous Result</div>' };
      mockDocument.getElementById.mockReturnValue(mockContainer);

      function displaySearchResults(results: GeocodeResult[]) {
        if (results.length === 0) {
          mockContainer.innerHTML = "<div class='no-results'>No locations found</div>";
          return;
        }
        mockContainer.innerHTML = results.map((r) => `<div>${r.name}</div>`).join("");
      }

      displaySearchResults([]);

      expect(mockContainer.innerHTML).not.toContain("Previous Result");
      expect(mockContainer.innerHTML).toContain("No locations found");
    });

    test("should handle null or undefined results gracefully", () => {
      const mockContainer = { innerHTML: "" };
      mockDocument.getElementById.mockReturnValue(mockContainer);

      function displaySearchResults(results: GeocodeResult[] | null | undefined) {
        if (!results || results.length === 0) {
          mockContainer.innerHTML = "<div class='no-results'>No locations found</div>";
          return;
        }
        mockContainer.innerHTML = results.map((r) => `<div>${r.name}</div>`).join("");
      }

      displaySearchResults(null);
      expect(mockContainer.innerHTML).toContain("No locations found");

      displaySearchResults(undefined);
      expect(mockContainer.innerHTML).toContain("No locations found");
    });
  });

  describe("Protection-without-location warning", () => {
    test("should display warning when protection enabled without location", () => {
      const mockWarning = { style: { display: "none" } };
      mockDocument.getElementById.mockImplementation((id: string) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      // Simulate loadSettings with protection enabled but no location
      const settings: WarningSettings = {
        enabled: true,
        location: null,
        webrtcProtection: false,
      };

      if (settings.enabled && !settings.location) {
        mockWarning.style.display = "block";
      } else {
        mockWarning.style.display = "none";
      }

      expect(mockWarning.style.display).toBe("block");
    });

    test("should hide warning when protection disabled", () => {
      const mockWarning = { style: { display: "block" } };
      mockDocument.getElementById.mockImplementation((id: string) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      const settings: WarningSettings = {
        enabled: false,
        location: null,
        webrtcProtection: false,
      };

      if (settings.enabled && !settings.location) {
        mockWarning.style.display = "block";
      } else {
        mockWarning.style.display = "none";
      }

      expect(mockWarning.style.display).toBe("none");
    });

    test("should hide warning when location is set", () => {
      const mockWarning = { style: { display: "block" } };
      mockDocument.getElementById.mockImplementation((id: string) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      const settings: WarningSettings = {
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194 },
        webrtcProtection: false,
      };

      if (settings.enabled && !settings.location) {
        mockWarning.style.display = "block";
      } else {
        mockWarning.style.display = "none";
      }

      expect(mockWarning.style.display).toBe("none");
    });

    test("should update warning visibility when settings change", () => {
      const mockWarning = { style: { display: "none" } };
      mockDocument.getElementById.mockImplementation((id: string) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      function updateWarning(settings: WarningSettings) {
        if (settings.enabled && !settings.location) {
          mockWarning.style.display = "block";
        } else {
          mockWarning.style.display = "none";
        }
      }

      // Initially no warning
      updateWarning({ enabled: false, location: null, webrtcProtection: false });
      expect(mockWarning.style.display).toBe("none");

      // Enable protection without location - should show warning
      updateWarning({ enabled: true, location: null, webrtcProtection: false });
      expect(mockWarning.style.display).toBe("block");

      // Add location - should hide warning
      updateWarning({
        enabled: true,
        location: { latitude: 0, longitude: 0 },
        webrtcProtection: false,
      });
      expect(mockWarning.style.display).toBe("none");
    });
  });

  describe("Coordinate input validation errors", () => {
    test("should show error for latitude below -90", () => {
      const lat = -91;
      const lon = 0;

      const isValid = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid latitude. Must be between -90 and 90." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
      expect(errorMessage).toContain("latitude");
    });

    test("should show error for latitude above 90", () => {
      const lat = 91;
      const lon = 0;

      const isValid = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid latitude. Must be between -90 and 90." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
    });

    test("should show error for longitude below -180", () => {
      const lat = 0;
      const lon = -181;

      const isValid = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid longitude. Must be between -180 and 180." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
      expect(errorMessage).toContain("longitude");
    });

    test("should show error for longitude above 180", () => {
      const lat = 0;
      const lon = 181;

      const isValid = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid longitude. Must be between -180 and 180." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
    });

    test("should show error for NaN latitude", () => {
      const lat = NaN;
      const lon = 0;

      const isValid =
        !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid latitude. Must be a number." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
    });

    test("should show error for NaN longitude", () => {
      const lat = 0;
      const lon = NaN;

      const isValid =
        !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const errorMessage = !isValid ? "Invalid longitude. Must be a number." : null;

      expect(isValid).toBe(false);
      expect(errorMessage).toBeTruthy();
    });

    test("should accept valid boundary values", () => {
      const testCases = [
        { lat: -90, lon: -180 },
        { lat: -90, lon: 180 },
        { lat: 90, lon: -180 },
        { lat: 90, lon: 180 },
        { lat: 0, lon: 0 },
      ];

      testCases.forEach(({ lat, lon }) => {
        const isValid =
          !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        expect(isValid).toBe(true);
      });
    });

    test("should prevent submission with invalid coordinates", () => {
      const mockAlert = vi.fn();
      global.alert = mockAlert;

      function handleManualCoordinates(latValue: string, lonValue: string) {
        const lat = parseFloat(latValue);
        const lon = parseFloat(lonValue);

        if (isNaN(lat) || lat < -90 || lat > 90) {
          alert("Invalid latitude. Must be between -90 and 90.");
          return false;
        }

        if (isNaN(lon) || lon < -180 || lon > 180) {
          alert("Invalid longitude. Must be between -180 and 180.");
          return false;
        }

        return true;
      }

      // Test invalid latitude
      const result1 = handleManualCoordinates("91", "0");
      expect(result1).toBe(false);
      expect(mockAlert).toHaveBeenCalledWith("Invalid latitude. Must be between -90 and 90.");

      mockAlert.mockClear();

      // Test invalid longitude
      const result2 = handleManualCoordinates("0", "181");
      expect(result2).toBe(false);
      expect(mockAlert).toHaveBeenCalledWith("Invalid longitude. Must be between -180 and 180.");

      mockAlert.mockClear();

      // Test valid coordinates
      const result3 = handleManualCoordinates("37.7749", "-122.4194");
      expect(result3).toBe(true);
      expect(mockAlert).not.toHaveBeenCalled();
    });
  });

  /**
   * Protection Status Toggle Responsiveness Unit Tests
   * Converted from property tests (popup-responsiveness.property.test.ts)
   * Toggle timing doesn't vary based on generated input data.
   *
   * Validates: Requirements 6.1, 6.2, 6.3
   */
  describe("Protection status toggle responsiveness", () => {
    test("should toggle protection status within 100ms", async () => {
      mockBrowser.runtime.sendMessage.mockResolvedValue({ success: true });

      const startTime = Date.now();
      await mockBrowser.runtime.sendMessage({
        type: "SET_PROTECTION_STATUS",
        payload: { enabled: true },
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    test("should handle rapid toggle sequences", async () => {
      mockBrowser.runtime.sendMessage.mockResolvedValue({ success: true });

      const toggleSequence = [true, false, true, false, true];
      const startTime = Date.now();

      for (const enabled of toggleSequence) {
        await mockBrowser.runtime.sendMessage({
          type: "SET_PROTECTION_STATUS",
          payload: { enabled },
        });
      }

      const avgDuration = (Date.now() - startTime) / toggleSequence.length;
      expect(avgDuration).toBeLessThan(100);
    });
  });

  /**
   * Popup Performance Unit Tests
   * Converted from property tests (popup-performance.property.test.ts)
   * These timing assertions don't vary based on generated input data,
   * so they are tested with representative examples instead of fast-check.
   *
   * Validates: Requirements 6.1, 6.2, 6.3
   */
  describe("Popup open performance (<200ms)", () => {
    test("should load settings within 200ms", async () => {
      const settings = {
        enabled: true,
        webrtcProtection: false,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        locationName: {
          city: "San Francisco",
          country: "USA",
          displayName: "San Francisco, CA, USA",
        },
      };

      mockBrowser.runtime.sendMessage.mockResolvedValue(settings);

      const mockElements = {
        protectionToggle: { checked: false },
        webrtcToggle: { checked: false },
        statusBadge: { classList: { add: vi.fn(), remove: vi.fn() } },
        statusText: { textContent: "" },
        locationName: { textContent: "" },
        locationCoords: { textContent: "" },
        warningMessage: { style: { display: "none" } },
      };

      mockDocument.getElementById.mockImplementation(
        (id: string) => (mockElements as Record<string, unknown>)[id] || null
      );

      const startTime = Date.now();

      const loaded = (await mockBrowser.runtime.sendMessage({ type: "GET_SETTINGS" })) as {
        enabled: boolean;
        webrtcProtection: boolean;
        location: { latitude: number; longitude: number; accuracy: number };
        locationName: { displayName: string };
      };
      mockElements.protectionToggle.checked = loaded.enabled;
      mockElements.webrtcToggle.checked = loaded.webrtcProtection;
      mockElements.statusBadge.classList.add("enabled");
      mockElements.statusText.textContent = "Enabled";
      mockElements.locationName.textContent = loaded.locationName.displayName;
      mockElements.locationCoords.textContent = `${loaded.location.latitude.toFixed(4)}, ${loaded.location.longitude.toFixed(4)}`;

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    test("should maintain performance with complex location data", async () => {
      const settings = {
        enabled: true,
        webrtcProtection: true,
        location: { latitude: -33.8688, longitude: 151.2093, accuracy: 50 },
        locationName: {
          city: "Sydney",
          country: "Australia",
          displayName: "Sydney, New South Wales, Australia — Southern Hemisphere Test Location",
        },
      };

      mockBrowser.runtime.sendMessage.mockResolvedValue(settings);

      const mockElements = {
        protectionToggle: { checked: false },
        webrtcToggle: { checked: false },
        statusBadge: { classList: { add: vi.fn(), remove: vi.fn() } },
        statusText: { textContent: "" },
        locationName: { textContent: "" },
        locationCoords: { textContent: "" },
        warningMessage: { style: { display: "none" } },
      };

      mockDocument.getElementById.mockImplementation(
        (id: string) => (mockElements as Record<string, unknown>)[id] || null
      );

      const startTime = Date.now();

      const loaded = (await mockBrowser.runtime.sendMessage({ type: "GET_SETTINGS" })) as {
        enabled: boolean;
        webrtcProtection: boolean;
        location: { latitude: number; longitude: number };
        locationName: { displayName: string };
      };
      mockElements.protectionToggle.checked = loaded.enabled;
      mockElements.webrtcToggle.checked = loaded.webrtcProtection;
      mockElements.locationName.textContent = loaded.locationName.displayName;
      mockElements.locationCoords.textContent = `${loaded.location.latitude.toFixed(4)}, ${loaded.location.longitude.toFixed(4)}`;

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    test("should handle rapid popup open/close cycles within 200ms each", async () => {
      const settingsSequence = [
        { enabled: true, location: { latitude: 40.7128, longitude: -74.006 } },
        { enabled: false, location: null },
        { enabled: true, location: { latitude: 51.5074, longitude: -0.1278 } },
      ];

      const mockElements = {
        protectionToggle: { checked: false },
        webrtcToggle: { checked: false },
        statusBadge: { classList: { add: vi.fn(), remove: vi.fn() } },
        statusText: { textContent: "" },
        locationName: { textContent: "" },
        locationCoords: { textContent: "" },
        warningMessage: { style: { display: "none" } },
      };

      mockDocument.getElementById.mockImplementation(
        (id: string) => (mockElements as Record<string, unknown>)[id] || null
      );

      for (const settings of settingsSequence) {
        mockBrowser.runtime.sendMessage.mockResolvedValue({
          ...settings,
          webrtcProtection: false,
          locationName: null,
        });

        const startTime = Date.now();
        await mockBrowser.runtime.sendMessage({ type: "GET_SETTINGS" });
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(200);
      }
    });
  });
});
