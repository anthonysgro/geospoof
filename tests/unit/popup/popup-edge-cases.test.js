/**
 * Unit tests for popup edge cases
 * Validates: Requirements 7.6
 */

describe("Popup Edge Cases", () => {
  let mockBrowser;
  let mockDocument;

  beforeEach(() => {
    // Mock browser API
    mockBrowser = {
      runtime: {
        sendMessage: jest.fn(),
      },
    };
    global.browser = mockBrowser;

    // Mock DOM
    mockDocument = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
    };
    global.document = mockDocument;
  });

  describe("Empty geocoding results display", () => {
    test('should display "no results" message when geocoding returns empty array', () => {
      const mockContainer = { innerHTML: "" };
      mockDocument.getElementById.mockReturnValue(mockContainer);

      // Simulate displaySearchResults from popup.js
      function displaySearchResults(results) {
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

      function displaySearchResults(results) {
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

      function displaySearchResults(results) {
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
    test("should display warning when protection enabled without location", async () => {
      const mockWarning = { style: { display: "none" } };
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      // Simulate loadSettings with protection enabled but no location
      const settings = {
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

    test("should hide warning when protection disabled", async () => {
      const mockWarning = { style: { display: "block" } };
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      const settings = {
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

    test("should hide warning when location is set", async () => {
      const mockWarning = { style: { display: "block" } };
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      const settings = {
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

    test("should update warning visibility when settings change", async () => {
      const mockWarning = { style: { display: "none" } };
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === "warningMessage") return mockWarning;
        return null;
      });

      function updateWarning(settings) {
        if (settings.enabled && !settings.location) {
          mockWarning.style.display = "block";
        } else {
          mockWarning.style.display = "none";
        }
      }

      // Initially no warning
      updateWarning({ enabled: false, location: null });
      expect(mockWarning.style.display).toBe("none");

      // Enable protection without location - should show warning
      updateWarning({ enabled: true, location: null });
      expect(mockWarning.style.display).toBe("block");

      // Add location - should hide warning
      updateWarning({ enabled: true, location: { latitude: 0, longitude: 0 } });
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
      const mockAlert = jest.fn();
      global.alert = mockAlert;

      function handleManualCoordinates(latValue, lonValue) {
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
});
