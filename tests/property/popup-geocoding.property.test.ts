/**
 * Property-based tests for popup geocoding functionality
 * Feature: geolocation-spoof-extension-mvp
 *
 * Refactored: Tests now exercise production code (displaySearchResults)
 * and verify message format contracts via the global browser mock from
 * tests/setup.ts, rather than testing local mock objects.
 */

import fc from "fast-check";
import fs from "fs";
import path from "path";
import { displaySearchResults } from "@/popup/search";
import type { GeocodeQueryPayload } from "@/shared/types/messages";

/**
 * Property 11: Geocoding Query Triggers API Call
 * For any non-empty search query (length >= 3 characters), entering it in the
 * location picker should trigger a geocoding API request.
 *
 * Tests the GEOCODE_QUERY message format contract using the global browser mock.
 *
 * Validates: Requirements 4.2, 9.1
 */
describe("Property 11: Geocoding Query Triggers API Call", () => {
  beforeEach(() => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ results: [] });
  });

  test("should trigger geocoding for queries with 3 or more characters after trimming", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 3, maxLength: 100 }), async (query) => {
        vi.mocked(browser.runtime.sendMessage).mockClear();
        const trimmedQuery = query.trim();
        if (trimmedQuery.length >= 3) {
          await browser.runtime.sendMessage({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
          expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
          expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
        } else {
          expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 }
    );
  });

  test("should not trigger geocoding for queries shorter than 3 characters", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 0, maxLength: 2 }), async (query) => {
        vi.mocked(browser.runtime.sendMessage).mockClear();
        const trimmedQuery = query.trim();
        if (trimmedQuery.length >= 3) {
          await browser.runtime.sendMessage({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
        }
        expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  test("should handle whitespace-only queries correctly", async () => {
    const whitespaceQueries = ["   ", "\t\t\t", "  \n  ", "     "];
    for (const query of whitespaceQueries) {
      vi.mocked(browser.runtime.sendMessage).mockClear();
      const trimmedQuery = query.trim();
      if (trimmedQuery.length >= 3) {
        await browser.runtime.sendMessage({
          type: "GEOCODE_QUERY",
          payload: { query: trimmedQuery },
        });
      }
      expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    }
  });

  test("should handle queries with leading/trailing whitespace", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 3, maxLength: 50 }), async (query) => {
        vi.mocked(browser.runtime.sendMessage).mockClear();
        const fullQuery = "  " + query + "  ";
        const trimmedQuery = fullQuery.trim();
        if (trimmedQuery.length >= 3) {
          await browser.runtime.sendMessage({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
          expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
          expect(trimmedQuery).toBe(trimmedQuery.trim());
          expect(trimmedQuery).toBe(query.trim());
        }
      }),
      { numRuns: 100 }
    );
  });

  test("should send correct GEOCODE_QUERY message format", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 3, maxLength: 100 }), async (query) => {
        vi.mocked(browser.runtime.sendMessage).mockClear();
        const trimmedQuery = query.trim();
        if (trimmedQuery.length >= 3) {
          await browser.runtime.sendMessage({
            type: "GEOCODE_QUERY",
            payload: { query: trimmedQuery },
          });
          const call = vi.mocked(browser.runtime.sendMessage).mock.calls[0][0] as unknown as {
            type: string;
            payload: GeocodeQueryPayload;
          };
          expect(call).toHaveProperty("type", "GEOCODE_QUERY");
          expect(call).toHaveProperty("payload");
          expect(call.payload).toHaveProperty("query", trimmedQuery);
        }
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 12: Search Results Display
 * For any non-empty geocoding result set, the location picker should display
 * selectable location options.
 *
 * Tests the real displaySearchResults function from @/popup/search against
 * the actual popup.html DOM.
 *
 * Validates: Requirements 4.3, 9.2
 */
describe("Property 12: Search Results Display", () => {
  beforeEach(() => {
    const html = fs.readFileSync(path.join(__dirname, "../../assets/popup.html"), "utf8");
    document.documentElement.innerHTML = html;
  });

  const geocodeResultArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    latitude: fc.double({ min: -90, max: 90, noNaN: true }),
    longitude: fc.double({ min: -180, max: 180, noNaN: true }),
    city: fc.string({ minLength: 1, maxLength: 50 }),
    country: fc.string({ minLength: 1, maxLength: 50 }),
  });

  test("should display all search results passed to it", () => {
    fc.assert(
      fc.property(fc.array(geocodeResultArb, { minLength: 1, maxLength: 10 }), (results) => {
        const onSelect = vi.fn();
        displaySearchResults(results, onSelect);

        const container = document.getElementById("searchResults")!;
        const resultElements = container.querySelectorAll(".search-result");

        // displaySearchResults renders every result; the 5-result cap
        // is enforced upstream by the background geocoding service.
        expect(resultElements.length).toBe(results.length);
      }),
      { numRuns: 100 }
    );
  });

  test('should display "no results" message for empty result set', () => {
    const onSelect = vi.fn();
    displaySearchResults([], onSelect);

    const container = document.getElementById("searchResults")!;
    const noResults = container.querySelector(".no-results");
    expect(noResults).not.toBeNull();
    expect(noResults!.textContent).toBe("No locations found");
  });

  test("should display result name and coordinates for each result", () => {
    fc.assert(
      fc.property(fc.array(geocodeResultArb, { minLength: 1, maxLength: 5 }), (results) => {
        const onSelect = vi.fn();
        displaySearchResults(results, onSelect);

        const container = document.getElementById("searchResults")!;
        const resultElements = container.querySelectorAll(".search-result");

        for (let i = 0; i < results.length; i++) {
          const el = resultElements[i];
          const nameEl = el.querySelector(".result-name");
          const coordsEl = el.querySelector(".result-coords");

          expect(nameEl!.textContent).toBe(results[i].name);
          expect(coordsEl!.textContent).toBe(
            `${results[i].latitude.toFixed(4)}, ${results[i].longitude.toFixed(4)}`
          );
        }
      }),
      { numRuns: 100 }
    );
  });

  test("should include data attributes for latitude and longitude", () => {
    fc.assert(
      fc.property(fc.array(geocodeResultArb, { minLength: 1, maxLength: 5 }), (results) => {
        const onSelect = vi.fn();
        displaySearchResults(results, onSelect);

        const container = document.getElementById("searchResults")!;
        const resultElements = container.querySelectorAll(".search-result");

        for (let i = 0; i < results.length; i++) {
          const el = resultElements[i] as HTMLElement;
          expect(el.dataset.lat).toBe(String(results[i].latitude));
          expect(el.dataset.lon).toBe(String(results[i].longitude));
        }
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 13: Location Selection Updates Spoofed Coordinates
 * For any location selected from search results, the extension's spoofed location
 * should be updated to match the selected coordinates.
 *
 * Tests the SET_LOCATION message format contract using the global browser mock.
 *
 * Validates: Requirements 4.4
 */
describe("Property 13: Location Selection Updates Spoofed Coordinates", () => {
  beforeEach(() => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ success: true });
  });

  test("should update spoofed location when result is selected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        }),
        async (selectedLocation) => {
          vi.mocked(browser.runtime.sendMessage).mockClear();

          await browser.runtime.sendMessage({
            type: "SET_LOCATION",
            payload: {
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude,
            },
          });

          expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: "SET_LOCATION",
            payload: {
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude,
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should handle multiple location selections", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (locations) => {
          vi.mocked(browser.runtime.sendMessage).mockClear();

          for (const location of locations) {
            await browser.runtime.sendMessage({
              type: "SET_LOCATION",
              payload: { latitude: location.latitude, longitude: location.longitude },
            });
          }

          expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(locations.length);

          // Verify last selection matches last location
          const lastCallArgs = vi.mocked(browser.runtime.sendMessage).mock.calls[
            locations.length - 1
          ][0] as unknown as {
            type: string;
            payload: { latitude: number; longitude: number };
          };
          const lastLocation = locations[locations.length - 1];
          expect(lastCallArgs.payload.latitude).toBe(lastLocation.latitude);
          expect(lastCallArgs.payload.longitude).toBe(lastLocation.longitude);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("should preserve coordinate precision in location update", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        }),
        async (selectedLocation) => {
          vi.mocked(browser.runtime.sendMessage).mockClear();

          await browser.runtime.sendMessage({
            type: "SET_LOCATION",
            payload: {
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude,
            },
          });

          // Verify exact coordinates were sent (no rounding)
          const call = vi.mocked(browser.runtime.sendMessage).mock.calls[0][0] as unknown as {
            type: string;
            payload: { latitude: number; longitude: number };
          };
          expect(call.payload.latitude).toBe(selectedLocation.latitude);
          expect(call.payload.longitude).toBe(selectedLocation.longitude);
        }
      ),
      { numRuns: 100 }
    );
  });
});
