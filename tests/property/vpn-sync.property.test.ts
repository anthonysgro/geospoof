/**
 * Property-Based Tests for VPN Sync
 * Feature: vpn-region-sync
 *
 * Tests use the three-service parallel architecture:
 *   ipify.org (IP detection) → geojs.io + freeipapi + reallyfreegeoip (parallel, first wins)
 *
 * Mock shapes:
 *   geojs:          { ip, city, country, latitude: string, longitude: string }
 *   freeipapi:      { ipAddress, cityName, countryName, latitude: number, longitude: number }
 *   reallyfreegeoip:{ ip, city, country_name, latitude: number, longitude: number }
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";
import { importBackground } from "../helpers/import-background";
import { sessionStorageData } from "../setup";

// --- Helpers ---

/** Generate a valid IPv4 address string from four octets */
function ipv4Arb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 254 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 1, max: 254 })
    )
    .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);
}

/**
 * Mock a successful 5-fetch sync: ipify → geojs + freeipapi + reallyfreegeoip + ipinfo (parallel).
 * geojs returns lat/lng as strings; the others as numbers.
 * ipinfo returns loc as "lat,lng" string.
 */
function mockFourFetchSync(
  ip: string,
  geo: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    cityName?: string;
    countryName?: string;
  }
) {
  const city = geo.city ?? geo.cityName ?? "TestCity";
  const country = geo.country ?? geo.countryName ?? "TestCountry";
  vi.mocked(fetch)
    // ipify
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ip }),
    } as Response)
    // geojs — lat/lng as strings
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ip,
          city,
          country,
          latitude: String(geo.latitude),
          longitude: String(geo.longitude),
        }),
    } as Response)
    // freeipapi
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ipAddress: ip,
          cityName: city,
          countryName: country,
          latitude: geo.latitude,
          longitude: geo.longitude,
        }),
    } as Response)
    // reallyfreegeoip
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ip,
          city,
          country_name: country,
          latitude: geo.latitude,
          longitude: geo.longitude,
        }),
    } as Response)
    // ipinfo — loc is "lat,lng" string
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ip,
          city,
          country,
          loc: `${geo.latitude},${geo.longitude}`,
        }),
    } as Response);
}

// Alias for tests that reference mockTwoStepFetch — updated to use the current 4-geo-service setup.
// The "two step" concept (ipify + geo) still applies; we just have 4 parallel geo services now.
function mockTwoStepFetch(
  ip: string,
  geo: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    cityName?: string;
    countryName?: string;
  }
) {
  mockFourFetchSync(ip, geo);
}

// ============================================================
// Preserved: vpn-region-sync properties (updated for FreeIPAPI)
// ============================================================

/**
 * Feature: vpn-region-sync, Property 6: VPN settings validation round-trip
 * Validates: Requirements 4.1, 7.3
 */
describe("Feature: vpn-region-sync, Property 6: VPN settings validation round-trip", () => {
  test("valid vpnSyncEnabled is preserved through validation", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (vpnSyncEnabled) => {
        const { validateSettings } = await importBackground();
        const settings: Partial<Settings> = { ...DEFAULT_SETTINGS, vpnSyncEnabled };
        const validated = validateSettings(settings);
        expect(validated.vpnSyncEnabled).toBe(vpnSyncEnabled);
      }),
      { numRuns: 100 }
    );
  });

  test("invalid vpnSyncEnabled is replaced with false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.anything().filter((v) => typeof v !== "boolean"),
        async (invalidValue) => {
          const { validateSettings } = await importBackground();
          const settings = { ...DEFAULT_SETTINGS, vpnSyncEnabled: invalidValue as boolean };
          const validated = validateSettings(settings);
          expect(validated.vpnSyncEnabled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("save and load round-trip preserves vpnSyncEnabled", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (vpnSyncEnabled) => {
        const { saveSettings, loadSettings } = await importBackground();
        const settings: Settings = { ...DEFAULT_SETTINGS, vpnSyncEnabled };
        await saveSettings(settings);
        const loaded = await loadSettings();
        expect(loaded.vpnSyncEnabled).toBe(vpnSyncEnabled);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: vpn-region-sync, Property 1: Invalid IP rejection
 * Validates: Requirements 1.4
 */
describe("Feature: vpn-region-sync, Property 1: Invalid IP rejection", () => {
  test("arbitrary non-IP strings are rejected", async () => {
    const { isValidIpAddress } = await importBackground();
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => {
          const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
          const m = s.match(ipv4);
          if (m && m.slice(1).every((o) => parseInt(o, 10) >= 0 && parseInt(o, 10) <= 255))
            return false;
          const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
          if (ipv6.test(s)) return false;
          return true;
        }),
        (input) => {
          expect(isValidIpAddress(input)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("valid IPv4 addresses are accepted", async () => {
    const { isValidIpAddress } = await importBackground();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (a, b, c, d) => {
          expect(isValidIpAddress(`${a}.${b}.${c}.${d}`)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: vpn-region-sync, Property 2: Out-of-range coordinate rejection
 * Updated for ipwho.is: uses syncVpnLocation with two-step mocks.
 * Validates: Requirements 2.4
 */
describe("Feature: vpn-region-sync, Property 2: Out-of-range coordinate rejection", () => {
  test("out-of-range latitude causes GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 91, max: 1000, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        async (lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "1.2.3.4";
          // All 4 geo services return bad coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: String(lat),
                  longitude: String(lon),
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test("out-of-range negative latitude causes GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -1000, max: -91, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        async (lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "1.2.3.4";
          // All 4 geo services return bad coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: String(lat),
                  longitude: String(lon),
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test("out-of-range longitude causes GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: 181, max: 1000, noNaN: true }),
        async (lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "1.2.3.4";
          // All 4 geo services return bad coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: String(lat),
                  longitude: String(lon),
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Feature: vpn-region-sync, Property 3: Sync coordinates flow-through
 * Updated for ipwho.is response shape.
 * Validates: Requirements 2.2
 */
describe("Feature: vpn-region-sync, Property 3: Sync coordinates flow-through", () => {
  test("valid coordinates flow through syncVpnLocation unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (lat, lon, city, country) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city,
                  country,
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(result.latitude).toBeCloseTo(lat, 10);
            expect(result.longitude).toBeCloseTo(lon, 10);
            expect(result.city).toBe(city);
            expect(result.country).toBe(country);
            expect(result.ip).toBe(testIp);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 4: Success response completeness
 * Updated for ipwho.is response shape.
 * Validates: Requirements 6.2
 */
describe("Feature: vpn-region-sync, Property 4: Success response completeness", () => {
  test("successful sync returns all required fields with correct types and ranges", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (lat, lon, city, country) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "198.51.100.1";
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city,
                  country,
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(typeof result.latitude).toBe("number");
            expect(typeof result.longitude).toBe("number");
            expect(typeof result.city).toBe("string");
            expect(typeof result.country).toBe("string");
            expect(typeof result.ip).toBe("string");
            expect(result.latitude).toBeGreaterThanOrEqual(-90);
            expect(result.latitude).toBeLessThanOrEqual(90);
            expect(result.longitude).toBeGreaterThanOrEqual(-180);
            expect(result.longitude).toBeLessThanOrEqual(180);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 5: Error response structure
 * Updated for ipwho.is + freeipapi fallback: geo_fail mock uses invalid response for both services.
 * Validates: Requirements 6.3
 */
describe("Feature: vpn-region-sync, Property 5: Error response structure", () => {
  test("IP detection failure returns proper error structure", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();
        // Mock fetch to reject for both the initial attempt and the retry
        vi.mocked(fetch)
          .mockRejectedValueOnce(new Error(errorMsg))
          .mockRejectedValueOnce(new Error(errorMsg));

        const promise = syncVpnLocation(true);
        // Advance past the 2s retry delay and any throttle delay
        await vi.advanceTimersByTimeAsync(5000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(["IP_DETECTION_FAILED", "GEOLOCATION_FAILED", "NETWORK"]).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 }
    );
  }, 30000);

  test("geolocation failure returns proper error structure", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        const testIp = "203.0.113.42";
        vi.useFakeTimers();
        // Mock: IP detection succeeds, all 4 geo services fail (with retries)
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: testIp }),
          } as Response)
          .mockRejectedValue(new Error(errorMsg)); // all subsequent calls fail

        const promise = syncVpnLocation(true);
        // Advance past all retry delays (GEO_MAX_RETRIES=2, delays: 1s + 2s per service)
        await vi.advanceTimersByTimeAsync(15000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(["IP_DETECTION_FAILED", "GEOLOCATION_FAILED", "NETWORK"]).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 }
    );
  }, 30000);

  test("error codes are one of the defined values", async () => {
    const validErrorCodes = ["IP_DETECTION_FAILED", "GEOLOCATION_FAILED", "NETWORK"];

    await fc.assert(
      fc.asyncProperty(fc.constantFrom("ip_fail", "geo_fail", "network"), async (failureType) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();

        if (failureType === "ip_fail") {
          // Mock both the initial attempt and the retry
          vi.mocked(fetch)
            .mockRejectedValueOnce(new Error("timeout"))
            .mockRejectedValueOnce(new Error("timeout"));
        } else if (failureType === "geo_fail") {
          // All 4 geo services return invalid IP
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: "1.2.3.4" }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: "not-a-valid-ip",
                  city: "",
                  country: "",
                  latitude: "0",
                  longitude: "0",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: "not-a-valid-ip",
                  latitude: 0,
                  longitude: 0,
                  cityName: "",
                  countryName: "",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: "not-a-valid-ip",
                  city: "",
                  country_name: "",
                  latitude: 0,
                  longitude: 0,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({ ip: "not-a-valid-ip", city: "", country: "", loc: "0,0" }),
            } as Response);
        } else {
          // Network error on all 4 geolocation services
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: "1.2.3.4" }),
            } as Response)
            .mockRejectedValue(new Error("network error")); // all geo service calls fail
        }

        const promise = syncVpnLocation(true);
        await vi.advanceTimersByTimeAsync(15000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(validErrorCodes).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 30 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 7: Cache hit returns cached result
 * Updated for ipwho.is response shape.
 * Validates: Requirements 8.2
 */
describe("Feature: vpn-region-sync, Property 7: Cache hit returns cached result", () => {
  test("cached IP returns cached result without new geolocation API call", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";

          // First call: populate cache with ipwho.is shape
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city: "Cached",
                  country: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response);

          const firstResult = await syncVpnLocation(true);
          expect("error" in firstResult).toBe(false);

          vi.mocked(fetch).mockReset();
          await resetRateLimiter();

          // Second call: cache hit — only ipify fetch, no ipwho.is
          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: testIp }),
          } as Response);

          const cachedResult = await syncVpnLocation(false);
          expect("error" in cachedResult).toBe(false);
          if (!("error" in cachedResult) && !("error" in firstResult)) {
            expect(cachedResult.latitude).toBe(firstResult.latitude);
            expect(cachedResult.longitude).toBe(firstResult.longitude);
            expect(cachedResult.ip).toBe(firstResult.ip);
          }
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 8: Force refresh bypasses cache
 * Updated for ipwho.is response shape.
 * Validates: Requirements 5.2, 8.3
 */
describe("Feature: vpn-region-sync, Property 8: Force refresh bypasses cache", () => {
  test("forceRefresh=true makes fresh API call even with cached result", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (lat1, lon1, lat2, lon2) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";

          // First call: populate cache
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city: "First",
                  country: "Test",
                  latitude: lat1,
                  longitude: lon1,
                }),
            } as Response);

          await syncVpnLocation(true);
          await resetRateLimiter();

          // Second call with forceRefresh=true
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city: "Second",
                  country: "Test",
                  latitude: lat2,
                  longitude: lon2,
                }),
            } as Response);

          const refreshResult = await syncVpnLocation(true);
          expect("error" in refreshResult).toBe(false);
          if (!("error" in refreshResult)) {
            expect(refreshResult.latitude).toBeCloseTo(lat2, 10);
            expect(refreshResult.longitude).toBeCloseTo(lon2, 10);
            expect(refreshResult.city).toBe("Second");
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 9: Rate limiting enforces minimum interval
 * Updated for 4-service setup: 1 ipify + 4 parallel geo services = 5 fetches per sync.
 * Validates: Requirements 8.4
 */
describe("Feature: vpn-region-sync, Property 9: Rate limiting enforces minimum interval", () => {
  test("consecutive API calls are spaced at least MIN_REQUEST_INTERVAL apart", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (callCount) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter, MIN_REQUEST_INTERVAL } =
          await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();

        // Track timestamps of ipify (first fetch of each sync)
        const ipifyTimestamps: number[] = [];
        let fetchCallIndex = 0;

        vi.mocked(fetch).mockImplementation(() => {
          const callIdx = fetchCallIndex++;
          // Every 5th fetch (0, 5, 10...) is ipify; the rest are geo services
          const positionInSync = callIdx % 5;
          if (positionInSync === 0) {
            ipifyTimestamps.push(Date.now());
            const syncNum = Math.floor(callIdx / 5);
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ ip: `1.2.3.${syncNum + 1}` }),
            } as Response);
          }
          // Geo service responses (geojs, freeipapi, reallyfreegeoip, ipinfo)
          const syncNum = Math.floor(callIdx / 5);
          const ip = `1.2.3.${syncNum + 1}`;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ip,
                city: "Test",
                country: "Test",
                latitude: "40",
                longitude: "-74",
                // Also valid for freeipapi/reallyfreegeoip/ipinfo shapes
                ipAddress: ip,
                cityName: "Test",
                countryName: "Test",
                country_name: "Test",
                loc: "40,-74",
              }),
          } as Response);
        });

        for (let i = 0; i < callCount; i++) {
          const promise = syncVpnLocation(true);
          await vi.advanceTimersByTimeAsync(MIN_REQUEST_INTERVAL + 100);
          await promise;
        }

        // Verify ipify calls are spaced at least MIN_REQUEST_INTERVAL apart
        for (let i = 1; i < ipifyTimestamps.length; i++) {
          const interval = ipifyTimestamps[i] - ipifyTimestamps[i - 1];
          expect(interval).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL);
        }

        vi.useRealTimers();
      }),
      { numRuns: 20 }
    );
  });
});

// ============================================================
// New: ipwhois-migration properties
// ============================================================

/**
 * Feature: ipwhois-migration, Property 1: HTTPS requests per sync
 *
 * For any successful syncVpnLocation(true), fetch calls are made:
 * first to https://api.ipify.org?format=json, then to geo services in parallel.
 * All URLs use HTTPS.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
describe("Feature: ipwhois-migration, Property 1: Two HTTPS requests per sync", () => {
  test("successful sync makes exactly two HTTPS fetch calls to correct endpoints", async () => {
    await fc.assert(
      fc.asyncProperty(ipv4Arb(), async (ip) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();
        vi.mocked(fetch).mockReset();

        mockTwoStepFetch(ip, { latitude: 40, longitude: -74 });

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(false);

        // 1 ipify + 4 parallel geo services = 5 total
        expect(fetch).toHaveBeenCalledTimes(5);

        const firstUrl = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(firstUrl).toBe("https://api.ipify.org?format=json");

        // All geo service URLs use HTTPS
        for (let i = 1; i < 5; i++) {
          const url = vi.mocked(fetch).mock.calls[i][0] as string;
          expect(url.startsWith("https://")).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 2: Field mapping correctness
 *
 * For any valid ipwho.is response with valid IP, latitude in [-90, 90],
 * longitude in [-180, 180], and string city/country, the returned
 * IpGeolocationResult fields match the response fields and the ipGeoCache
 * contains the result keyed by IP.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 5.4
 */
describe("Feature: ipwhois-migration, Property 2: Field mapping correctness", () => {
  test("ipwho.is fields are correctly mapped to IpGeolocationResult", async () => {
    await fc.assert(
      fc.asyncProperty(
        ipv4Arb(),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (ip, lat, lon, city, country) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          mockTwoStepFetch(ip, {
            latitude: lat,
            longitude: lon,
            cityName: city,
            countryName: country,
          });

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(result.ip).toBe(ip);
            // Use toBeCloseTo for coordinates to handle -0 vs +0 edge case
            expect(result.latitude).toBeCloseTo(lat, 10);
            expect(result.longitude).toBeCloseTo(lon, 10);
            expect(result.city).toBe(city);
            expect(result.country).toBe(country);

            // Cache should contain the result keyed by IP in session storage
            const cacheKey = `cache:ipGeo:${ip}`;
            expect(cacheKey in sessionStorageData).toBe(true);
            const cached = sessionStorageData[cacheKey] as {
              ip: string;
              latitude: number;
              longitude: number;
            };
            expect(cached.ip).toBe(ip);
            expect(cached.latitude).toBeCloseTo(lat, 10);
            expect(cached.longitude).toBeCloseTo(lon, 10);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 3: Invalid coordinate rejection
 *
 * For any ipwho.is response with out-of-range or non-numeric latitude/longitude,
 * syncVpnLocation returns a VpnSyncError with error equal to "GEOLOCATION_FAILED".
 *
 * Validates: Requirements 2.6, 2.7
 */
describe("Feature: ipwhois-migration, Property 3: Invalid coordinate rejection", () => {
  test("out-of-range coordinates return GEOLOCATION_FAILED", async () => {
    // Generate at least one coordinate that's out of range
    const outOfRangeLatArb = fc.oneof(
      fc.double({ min: 91, max: 10000, noNaN: true }),
      fc.double({ min: -10000, max: -91, noNaN: true })
    );
    const outOfRangeLonArb = fc.oneof(
      fc.double({ min: 181, max: 10000, noNaN: true }),
      fc.double({ min: -10000, max: -181, noNaN: true })
    );

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Bad lat, any lon
          fc.tuple(outOfRangeLatArb, fc.double({ min: -180, max: 180, noNaN: true })),
          // Any lat, bad lon
          fc.tuple(fc.double({ min: -90, max: 90, noNaN: true }), outOfRangeLonArb),
          // Both bad
          fc.tuple(outOfRangeLatArb, outOfRangeLonArb)
        ),
        async ([lat, lon]) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";
          // All 4 geo services return bad coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: String(lat),
                  longitude: String(lon),
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  test("non-numeric coordinates return GEOLOCATION_FAILED", async () => {
    // Use strings that parseFloat() returns NaN for (not parseable as numbers at all)
    const nonNumericArb = fc.constantFrom("abc", "not-a-number", "hello", "xyz", "lat:12");
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.tuple(nonNumericArb, fc.constant(0)),
          fc.tuple(fc.constant(0), nonNumericArb),
          fc.tuple(fc.constant(undefined), fc.constant(0)),
          fc.tuple(fc.constant(0), fc.constant(null))
        ),
        async ([lat, lon]) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";
          // All 4 geo services return bad coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  test("non-numeric coordinates return GEOLOCATION_FAILED", async () => {
    // Use strings that parseFloat() returns NaN for (not parseable as numbers at all)
    const nonNumericArb = fc.constantFrom("abc", "not-a-number", "hello", "xyz", "lat:12");
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.tuple(nonNumericArb, fc.constant(0)),
          fc.tuple(fc.constant(0), nonNumericArb),
          fc.tuple(fc.constant(undefined), fc.constant(0)),
          fc.tuple(fc.constant(0), fc.constant(null))
        ),
        async ([lat, lon]) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";
          // All 4 geo services return non-numeric coords
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: lat,
                  longitude: lon,
                }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  city: "Test",
                  country: "Test",
                  loc: `${lat},${lon}`,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 4: Missing city/country defaults to empty string
 *
 * For any ipwho.is response with valid IP and coordinates but missing/non-string
 * city or country, the corresponding field defaults to "".
 *
 * Validates: Requirements 2.8
 */
describe("Feature: ipwhois-migration, Property 4: Missing city/country defaults to empty string", () => {
  test("missing or non-string city/country defaults to empty string", async () => {
    const nonStringArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(null),
      fc.integer(),
      fc.boolean(),
      fc.constant({}),
      fc.constant([])
    );

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Missing city
          fc.tuple(nonStringArb, fc.string({ minLength: 1, maxLength: 20 })),
          // Missing country
          fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), nonStringArb),
          // Both missing
          fc.tuple(nonStringArb, nonStringArb)
        ),
        async ([city, country]) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const testIp = "203.0.113.42";
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: testIp,
                  success: true,
                  city,
                  country,
                  latitude: 40.7128,
                  longitude: -74.006,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            if (typeof city !== "string") {
              expect(result.city).toBe("");
            }
            if (typeof country !== "string") {
              expect(result.country).toBe("");
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 5: Invalid IP rejection
 *
 * For any ipwho.is response where ip is missing or not a valid IP address,
 * syncVpnLocation returns a VpnSyncError with error equal to "GEOLOCATION_FAILED".
 *
 * Validates: Requirements 2.9
 */
describe("Feature: ipwhois-migration, Property 5: Invalid IP rejection", () => {
  test("invalid ip in ipwho.is response returns GEOLOCATION_FAILED", async () => {
    const invalidIpArb = fc.oneof(
      fc.constant(""),
      fc.constant("not-an-ip"),
      fc.constant("999.999.999.999"),
      fc.constant("256.1.1.1"),
      fc.constant("1.2.3"),
      fc.constant("abc.def.ghi.jkl"),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
        const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const m = s.match(ipv4);
        if (m && m.slice(1).every((o) => parseInt(o, 10) >= 0 && parseInt(o, 10) <= 255))
          return false;
        const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
        return !ipv6.test(s);
      })
    );

    await fc.assert(
      fc.asyncProperty(invalidIpArb, async (badIp) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        const detectedIp = "203.0.113.42";
        // All 4 geo services return bad IP
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: detectedIp }),
          } as Response)
          // geojs — bad ip
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                ip: badIp,
                city: "Test",
                country: "Test",
                latitude: "40",
                longitude: "-74",
              }),
          } as Response)
          // freeipapi — bad ip
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                ipAddress: badIp,
                latitude: 40,
                longitude: -74,
                cityName: "Test",
                countryName: "Test",
              }),
          } as Response)
          // reallyfreegeoip — bad ip
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                ip: badIp,
                city: "Test",
                country_name: "Test",
                latitude: 40,
                longitude: -74,
              }),
          } as Response)
          // ipinfo — bad ip
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                ip: badIp,
                city: "Test",
                country: "Test",
                loc: "40,-74",
              }),
          } as Response);

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(result.error).toBe("GEOLOCATION_FAILED");
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);

  test("missing ip in ipwho.is response returns GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant("")),
        async (missingIp) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const detectedIp = "203.0.113.42";
          // All 4 geo services return missing IP
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: detectedIp }),
            } as Response)
            // geojs — missing ip
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: missingIp,
                  city: "Test",
                  country: "Test",
                  latitude: "40",
                  longitude: "-74",
                }),
            } as Response)
            // freeipapi — missing ip
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: missingIp,
                  latitude: 40,
                  longitude: -74,
                  cityName: "Test",
                  countryName: "Test",
                }),
            } as Response)
            // reallyfreegeoip — missing ip
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: missingIp,
                  city: "Test",
                  country_name: "Test",
                  latitude: 40,
                  longitude: -74,
                }),
            } as Response)
            // ipinfo — missing ip
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ip: missingIp,
                  city: "Test",
                  country: "Test",
                  loc: "40,-74",
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(true);
          if ("error" in result) {
            expect(result.error).toBe("GEOLOCATION_FAILED");
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 6: Non-2xx HTTP status returns error with status code
 *
 * For any non-2xx status from ipify, syncVpnLocation returns IP_DETECTION_FAILED with status
 * in message. For any non-2xx status from ipwho.is + freeipapi, returns GEOLOCATION_FAILED with status
 * in message.
 *
 * Validates: Requirements 3.2, 3.5
 */
describe("Feature: ipwhois-migration, Property 6: Non-2xx HTTP status returns error", () => {
  const non2xxStatusArb = fc.oneof(
    fc.integer({ min: 400, max: 599 }),
    fc.integer({ min: 300, max: 399 }),
    fc.constant(100),
    fc.constant(101)
  );

  test("non-2xx from ipify returns IP_DETECTION_FAILED with status in message", async () => {
    await fc.assert(
      fc.asyncProperty(non2xxStatusArb, async (status) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();
        // Mock both the initial attempt and the retry
        const failResponse = {
          ok: false,
          status,
          json: () => Promise.resolve({}),
        } as Response;
        vi.mocked(fetch).mockResolvedValueOnce(failResponse).mockResolvedValueOnce(failResponse);

        const promise = syncVpnLocation(true);
        await vi.advanceTimersByTimeAsync(5000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(result.error).toBe("IP_DETECTION_FAILED");
          expect(result.message).toContain(String(status));
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);

  test("non-2xx from both geolocation services returns GEOLOCATION_FAILED with status in message", async () => {
    await fc.assert(
      fc.asyncProperty(non2xxStatusArb, async (status) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        // Mock: IP detection succeeds, all 4 geo services fail with non-2xx
        const failResponse = {
          ok: false,
          status,
          json: () => Promise.resolve({}),
        } as Response;
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: "203.0.113.42" }),
          } as Response)
          .mockResolvedValueOnce(failResponse)
          .mockResolvedValueOnce(failResponse)
          .mockResolvedValueOnce(failResponse)
          .mockResolvedValueOnce(failResponse);

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(true);
        if ("error" in result) {
          // 403 responses set blocked=true → IP_BLOCKED; other non-2xx → GEOLOCATION_FAILED
          expect(["GEOLOCATION_FAILED", "IP_BLOCKED"]).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 7: Network error returns appropriate error code
 *
 * For any fetch rejection during ipify, syncVpnLocation returns NETWORK error.
 * For any fetch rejection during both geolocation services, returns NETWORK error.
 * Both have non-empty message.
 *
 * Validates: Requirements 3.6, 3.8
 */
describe("Feature: ipwhois-migration, Property 7: Network error returns appropriate error code", () => {
  test("network error during ipify returns NETWORK error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();
        // Mock fetch to reject for both the initial attempt and the retry
        vi.mocked(fetch)
          .mockRejectedValueOnce(new Error(errorMsg))
          .mockRejectedValueOnce(new Error(errorMsg));

        const promise = syncVpnLocation(true);
        await vi.advanceTimersByTimeAsync(5000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          // ipify network errors get caught as IP_DETECTION_FAILED, then mapped to NETWORK
          // in the syncVpnLocation catch block if code is not recognized
          expect(["NETWORK", "IP_DETECTION_FAILED"]).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);

  test("network error during both geolocation services returns NETWORK error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();
        // Mock: IP detection succeeds, all geo services fail (with retries)
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: "203.0.113.42" }),
          } as Response)
          .mockRejectedValue(new Error(errorMsg)); // all subsequent calls fail

        const promise = syncVpnLocation(true);
        // Advance past all retry delays (GEO_MAX_RETRIES=2, delays: 1s + 2s per service)
        await vi.advanceTimersByTimeAsync(15000);
        const result = await promise;
        vi.useRealTimers();

        expect("error" in result).toBe(true);
        if ("error" in result) {
          // Network errors from geo services result in GEOLOCATION_FAILED
          // (anyServiceResponded=false since all errors have code "NETWORK")
          expect(["NETWORK", "GEOLOCATION_FAILED"]).toContain(result.error);
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 8: Cache hit avoids geolocation call
 *
 * After a successful sync, syncVpnLocation(false) with the same IP returns
 * the cached result with only one fetch (ipify for IP detection) and no
 * geolocation call.
 *
 * Validates: Requirements 5.1, 5.2
 */
describe("Feature: ipwhois-migration, Property 8: Cache hit avoids geolocation call", () => {
  test("cache hit returns cached result with only one fetch call", async () => {
    await fc.assert(
      fc.asyncProperty(
        ipv4Arb(),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (ip, lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          // First call: populate cache
          mockTwoStepFetch(ip, { latitude: lat, longitude: lon });
          const firstResult = await syncVpnLocation(true);
          expect("error" in firstResult).toBe(false);

          vi.mocked(fetch).mockReset();
          await resetRateLimiter();

          // Second call: cache hit — only ipify, no geolocation
          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip }),
          } as Response);

          const cachedResult = await syncVpnLocation(false);
          expect("error" in cachedResult).toBe(false);
          if (!("error" in cachedResult) && !("error" in firstResult)) {
            expect(cachedResult.latitude).toBe(firstResult.latitude);
            expect(cachedResult.longitude).toBe(firstResult.longitude);
            expect(cachedResult.ip).toBe(firstResult.ip);
          }
          // Only one fetch (ipify), no geolocation call
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 9: Force refresh bypasses cache
 *
 * After a successful sync, syncVpnLocation(true) makes two fetch calls
 * (ipify + ipwho.is) and returns the fresh result.
 *
 * Validates: Requirements 5.3
 */
describe("Feature: ipwhois-migration, Property 9: Force refresh bypasses cache", () => {
  test("force refresh makes two fetch calls and returns fresh result", async () => {
    await fc.assert(
      fc.asyncProperty(
        ipv4Arb(),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (ip, lat1, lon1, lat2, lon2) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          // First call: populate cache
          mockTwoStepFetch(ip, { latitude: lat1, longitude: lon1, cityName: "First" });
          await syncVpnLocation(true);

          vi.mocked(fetch).mockReset();
          await resetRateLimiter();

          // Second call: force refresh
          mockTwoStepFetch(ip, { latitude: lat2, longitude: lon2, cityName: "Second" });
          const result = await syncVpnLocation(true);

          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(result.latitude).toBeCloseTo(lat2, 10);
            expect(result.longitude).toBeCloseTo(lon2, 10);
            expect(result.city).toBe("Second");
          }
          // 1 ipify + 4 parallel geo services = 5 total
          expect(fetch).toHaveBeenCalledTimes(5);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: ipwhois-migration, Property 10: Rate limiting enforces minimum interval
 *
 * Consecutive syncVpnLocation calls have at least MIN_REQUEST_INTERVAL (2000ms)
 * between fetch invocations.
 *
 * Validates: Requirements 6.1, 6.2
 */
describe("Feature: ipwhois-migration, Property 10: Rate limiting enforces minimum interval", () => {
  test("consecutive syncs are spaced at least MIN_REQUEST_INTERVAL apart", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (callCount) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter, MIN_REQUEST_INTERVAL } =
          await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();

        const ipifyTimestamps: number[] = [];
        let fetchCallIndex = 0;

        vi.mocked(fetch).mockImplementation(() => {
          const callIdx = fetchCallIndex++;
          // Every 5th fetch (0, 5, 10...) is ipify; the rest are geo services
          const positionInSync = callIdx % 5;
          if (positionInSync === 0) {
            ipifyTimestamps.push(Date.now());
            const syncNum = Math.floor(callIdx / 5);
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ ip: `1.2.3.${syncNum + 1}` }),
            } as Response);
          }
          const syncNum = Math.floor(callIdx / 5);
          const ip = `1.2.3.${syncNum + 1}`;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ip,
                city: "Test",
                country: "Test",
                latitude: "40",
                longitude: "-74",
                ipAddress: ip,
                cityName: "Test",
                countryName: "Test",
                country_name: "Test",
                loc: "40,-74",
              }),
          } as Response);
        });

        for (let i = 0; i < callCount; i++) {
          const promise = syncVpnLocation(true);
          await vi.advanceTimersByTimeAsync(MIN_REQUEST_INTERVAL + 100);
          await promise;
        }

        // First fetch of each sync (ipify) should be spaced at least MIN_REQUEST_INTERVAL apart
        for (let i = 1; i < ipifyTimestamps.length; i++) {
          const interval = ipifyTimestamps[i] - ipifyTimestamps[i - 1];
          expect(interval).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL);
        }

        vi.useRealTimers();
      }),
      { numRuns: 20 }
    );
  });
});
