/**
 * Unit Tests for Geocoding Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 */

import { getFetchUrl, getFetchOptions } from "../../helpers/mock-types";
import type { MockLike } from "../../helpers/mock-types";
import { importBackground } from "../../helpers/import-background";

describe("Geocoding Edge Cases", () => {
  /**
   * Test empty results handling
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle empty geocoding results", async () => {
    const { geocodeQuery } = await importBackground();

    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    const results = await geocodeQuery("NonexistentCity12345");

    expect(results).toEqual([]);
    expect(fetch).toHaveBeenCalled();
  });

  /**
   * Test network failure scenarios
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle network failure gracefully", async () => {
    const { geocodeQuery } = await importBackground();

    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    await expect(geocodeQuery("San Francisco")).rejects.toThrow("NETWORK");
  });

  /**
   * Test API error responses
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle API error responses", async () => {
    const { geocodeQuery } = await importBackground();

    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(geocodeQuery("San Francisco")).rejects.toThrow("NETWORK");
  });

  /**
   * Test free service usage (Nominatim)
   * Validates: Requirements 9.4, 10.5
   */
  test("should use Nominatim free service without authentication", async () => {
    const { geocodeQuery } = await importBackground();

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            display_name: "San Francisco, CA, USA",
            lat: "37.7749",
            lon: "-122.4194",
            address: {
              city: "San Francisco",
              country: "USA",
            },
          },
        ]),
        { status: 200 }
      )
    );

    await geocodeQuery("San Francisco");

    expect(fetch).toHaveBeenCalled();
    const fetchMock = fetch as unknown as MockLike;
    const fetchUrl = getFetchUrl(fetchMock);
    expect(fetchUrl).toContain("nominatim.openstreetmap.org");

    const fetchOpts = getFetchOptions(fetchMock);
    expect(fetchOpts.headers["User-Agent"]).toBe("GeoSpoof-Extension/1.0");

    expect(fetchUrl).not.toContain("apikey");
    expect(fetchUrl).not.toContain("api_key");
    expect(fetchOpts.headers).not.toHaveProperty("Authorization");
  });

  /**
   * Test reverse geocoding with empty results
   */
  test("should handle reverse geocoding with minimal address data", async () => {
    const { reverseGeocode } = await importBackground();

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          display_name: "37.7749, -122.4194",
          address: {},
        }),
        { status: 200 }
      )
    );

    const result = await reverseGeocode(37.7749, -122.4194);

    expect(result.city).toBe("");
    expect(result.country).toBe("");
    expect(result.displayName).toBe("37.7749, -122.4194");
  });

  /**
   * Test query length validation
   */
  test("should return empty array for queries shorter than 3 characters", async () => {
    const { geocodeQuery } = await importBackground();

    const results1 = await geocodeQuery("");
    const results2 = await geocodeQuery("ab");
    const results3 = await geocodeQuery("  ");

    expect(results1).toEqual([]);
    expect(results2).toEqual([]);
    expect(results3).toEqual([]);

    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * Test retry logic for transient failures
   */
  test("should retry on transient network failures", async () => {
    const { geocodeQuery } = await importBackground();

    let callCount = 0;

    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error("Transient network error"));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              display_name: "San Francisco, CA, USA",
              lat: "37.7749",
              lon: "-122.4194",
              address: {
                city: "San Francisco",
                country: "USA",
              },
            },
          ]),
          { status: 200 }
        )
      );
    });

    const results = await geocodeQuery("San Francisco");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("San Francisco, CA, USA");
    expect(callCount).toBe(3);
  });

  /**
   * Test reverse geocoding network failure
   */
  test("should handle reverse geocoding network failure", async () => {
    const { reverseGeocode } = await importBackground();

    const uniqueLat = 12.3456;
    const uniqueLon = 78.9012;

    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    await expect(reverseGeocode(uniqueLat, uniqueLon)).rejects.toThrow("NETWORK");
  });
});
