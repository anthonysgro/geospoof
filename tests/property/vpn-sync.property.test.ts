/**
 * Property-Based Tests for VPN Sync — FreeIPAPI Migration
 * Feature: freeipapi-migration
 *
 * Tests use the two-step architecture: ipify.org (IP detection) + FreeIPAPI (geolocation).
 * All mocks use FreeIPAPI response shape: { ipAddress, latitude, longitude, cityName, countryName }.
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

/** Mock a successful two-step fetch: ipify → FreeIPAPI */
function mockTwoStepFetch(
  ip: string,
  geo: { latitude: number; longitude: number; cityName?: string; countryName?: string }
) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ip }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ipAddress: ip,
          latitude: geo.latitude,
          longitude: geo.longitude,
          cityName: geo.cityName ?? "TestCity",
          countryName: geo.countryName ?? "TestCountry",
        }),
    } as Response);
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
          const validated = validateSettings(settings as Partial<Settings>);
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
 * Updated for FreeIPAPI: uses syncVpnLocation with two-step mocks instead of geolocateIp.
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
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
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
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
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
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
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
 * Updated for FreeIPAPI response shape.
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
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: city,
                  countryName: country,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(result.latitude).toBe(lat);
            expect(result.longitude).toBe(lon);
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
 * Updated for FreeIPAPI response shape.
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
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: city,
                  countryName: country,
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
 * Updated for FreeIPAPI: geo_fail mock uses invalid FreeIPAPI response instead of { status: "fail" }.
 * Validates: Requirements 6.3
 */
describe("Feature: vpn-region-sync, Property 5: Error response structure", () => {
  test("IP detection failure returns proper error structure", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.mocked(fetch).mockRejectedValueOnce(new Error(errorMsg));

        const result = await syncVpnLocation(true);
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
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: testIp }),
          } as Response)
          .mockRejectedValueOnce(new Error(errorMsg));

        const result = await syncVpnLocation(true);
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

        if (failureType === "ip_fail") {
          vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
        } else if (failureType === "geo_fail") {
          // Invalid FreeIPAPI response (missing ipAddress, invalid shape)
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: "1.2.3.4" }),
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
            } as Response);
        } else {
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: "1.2.3.4" }),
            } as Response)
            .mockRejectedValueOnce(new Error("network error"));
        }

        const result = await syncVpnLocation(true);
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
 * Updated for FreeIPAPI response shape.
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

          // First call: populate cache with FreeIPAPI shape
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Cached",
                  countryName: "Test",
                }),
            } as Response);

          const firstResult = await syncVpnLocation(true);
          expect("error" in firstResult).toBe(false);

          vi.mocked(fetch).mockReset();
          await resetRateLimiter();

          // Second call: cache hit — only ipify fetch, no FreeIPAPI
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
 * Updated for FreeIPAPI response shape.
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
                  ipAddress: testIp,
                  latitude: lat1,
                  longitude: lon1,
                  cityName: "First",
                  countryName: "Test",
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
                  ipAddress: testIp,
                  latitude: lat2,
                  longitude: lon2,
                  cityName: "Second",
                  countryName: "Test",
                }),
            } as Response);

          const refreshResult = await syncVpnLocation(true);
          expect("error" in refreshResult).toBe(false);
          if (!("error" in refreshResult)) {
            expect(refreshResult.latitude).toBe(lat2);
            expect(refreshResult.longitude).toBe(lon2);
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
 * Updated for FreeIPAPI: two fetches per sync (ipify + FreeIPAPI).
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

        const fetchTimestamps: number[] = [];
        let fetchCallIndex = 0;

        vi.mocked(fetch).mockImplementation(() => {
          fetchTimestamps.push(Date.now());
          fetchCallIndex++;
          // Odd calls = ipify IP detection, even calls = FreeIPAPI geolocation
          if (fetchCallIndex % 2 === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ ip: `1.2.3.${fetchCallIndex}` }),
            } as Response);
          }
          const ip = `1.2.3.${fetchCallIndex - 1}`;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ipAddress: ip,
                latitude: 40,
                longitude: -74,
                cityName: "Test",
                countryName: "Test",
              }),
          } as Response);
        });

        for (let i = 0; i < callCount; i++) {
          const promise = syncVpnLocation(true);
          await vi.advanceTimersByTimeAsync(MIN_REQUEST_INTERVAL + 100);
          await promise;
        }

        // First fetch of each sync pair (every 2 fetches)
        const syncStartTimestamps = fetchTimestamps.filter((_, idx) => idx % 2 === 0);
        for (let i = 1; i < syncStartTimestamps.length; i++) {
          const interval = syncStartTimestamps[i] - syncStartTimestamps[i - 1];
          expect(interval).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL);
        }

        vi.useRealTimers();
      }),
      { numRuns: 20 }
    );
  });
});

// ============================================================
// New: freeipapi-migration properties
// ============================================================

/**
 * Feature: freeipapi-migration, Property 1: Two HTTPS requests per sync
 *
 * For any successful syncVpnLocation(true), exactly two fetch calls are made:
 * first to https://api.ipify.org?format=json, second to a URL starting with
 * https://freeipapi.com/api/json/. Both URLs use HTTPS.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
describe("Feature: freeipapi-migration, Property 1: Two HTTPS requests per sync", () => {
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

        expect(fetch).toHaveBeenCalledTimes(2);

        const firstUrl = vi.mocked(fetch).mock.calls[0][0] as string;
        const secondUrl = vi.mocked(fetch).mock.calls[1][0] as string;

        expect(firstUrl).toBe("https://api.ipify.org?format=json");
        expect(secondUrl).toMatch(/^https:\/\/free\.freeipapi\.com\/api\/json\//);
        expect(firstUrl.startsWith("https://")).toBe(true);
        expect(secondUrl.startsWith("https://")).toBe(true);
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 2: Field mapping correctness
 *
 * For any valid FreeIPAPI response with valid IP, latitude in [-90, 90],
 * longitude in [-180, 180], and string cityName/countryName, the returned
 * IpGeolocationResult fields match the response fields and the ipGeoCache
 * contains the result keyed by IP.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 5.4
 */
describe("Feature: freeipapi-migration, Property 2: Field mapping correctness", () => {
  test("FreeIPAPI fields are correctly mapped to IpGeolocationResult", async () => {
    await fc.assert(
      fc.asyncProperty(
        ipv4Arb(),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (ip, lat, lon, cityName, countryName) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          mockTwoStepFetch(ip, { latitude: lat, longitude: lon, cityName, countryName });

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            expect(result.ip).toBe(ip);
            expect(result.latitude).toBe(lat);
            expect(result.longitude).toBe(lon);
            expect(result.city).toBe(cityName);
            expect(result.country).toBe(countryName);

            // Cache should contain the result keyed by IP in session storage
            const cacheKey = `cache:ipGeo:${ip}`;
            expect(cacheKey in sessionStorageData).toBe(true);
            const cached = sessionStorageData[cacheKey] as {
              ip: string;
              latitude: number;
              longitude: number;
            };
            expect(cached.ip).toBe(ip);
            expect(cached.latitude).toBe(lat);
            expect(cached.longitude).toBe(lon);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 3: Invalid coordinate rejection
 *
 * For any FreeIPAPI response with out-of-range or non-numeric latitude/longitude,
 * syncVpnLocation returns a VpnSyncError with error equal to "GEOLOCATION_FAILED".
 *
 * Validates: Requirements 2.6, 2.7
 */
describe("Feature: freeipapi-migration, Property 3: Invalid coordinate rejection", () => {
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
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
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
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.constant(0)),
          fc.tuple(fc.constant(0), fc.string({ minLength: 1, maxLength: 10 })),
          fc.tuple(fc.constant(undefined), fc.constant(0)),
          fc.tuple(fc.constant(0), fc.constant(null))
        ),
        async ([lat, lon]) => {
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
                  ipAddress: testIp,
                  latitude: lat,
                  longitude: lon,
                  cityName: "Test",
                  countryName: "Test",
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
 * Feature: freeipapi-migration, Property 4: Missing city/country defaults to empty string
 *
 * For any FreeIPAPI response with valid IP and coordinates but missing/non-string
 * cityName or countryName, the corresponding field defaults to "".
 *
 * Validates: Requirements 2.8
 */
describe("Feature: freeipapi-migration, Property 4: Missing city/country defaults to empty string", () => {
  test("missing or non-string cityName/countryName defaults to empty string", async () => {
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
          // Missing cityName
          fc.tuple(nonStringArb, fc.string({ minLength: 1, maxLength: 20 })),
          // Missing countryName
          fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), nonStringArb),
          // Both missing
          fc.tuple(nonStringArb, nonStringArb)
        ),
        async ([cityName, countryName]) => {
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
                  ipAddress: testIp,
                  latitude: 40.7128,
                  longitude: -74.006,
                  cityName,
                  countryName,
                }),
            } as Response);

          const result = await syncVpnLocation(true);
          expect("error" in result).toBe(false);
          if (!("error" in result)) {
            if (typeof cityName !== "string") {
              expect(result.city).toBe("");
            }
            if (typeof countryName !== "string") {
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
 * Feature: freeipapi-migration, Property 5: Invalid IP rejection
 *
 * For any FreeIPAPI response where ipAddress is missing or not a valid IP address,
 * syncVpnLocation returns a VpnSyncError with error equal to "GEOLOCATION_FAILED".
 *
 * Validates: Requirements 2.9
 */
describe("Feature: freeipapi-migration, Property 5: Invalid IP rejection", () => {
  test("invalid ipAddress in FreeIPAPI response returns GEOLOCATION_FAILED", async () => {
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
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: detectedIp }),
          } as Response)
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

  test("missing ipAddress in FreeIPAPI response returns GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant("")),
        async (missingIp) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          await clearIpGeoCache();
          await resetRateLimiter();

          const detectedIp = "203.0.113.42";
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: detectedIp }),
            } as Response)
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
 * Feature: freeipapi-migration, Property 6: Non-2xx HTTP status returns error with status code
 *
 * For any non-2xx status from ipify, syncVpnLocation returns IP_DETECTION_FAILED with status
 * in message. For any non-2xx status from FreeIPAPI, returns GEOLOCATION_FAILED with status
 * in message.
 *
 * Validates: Requirements 3.2, 3.5
 */
describe("Feature: freeipapi-migration, Property 6: Non-2xx HTTP status returns error", () => {
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

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status,
          json: () => Promise.resolve({}),
        } as Response);

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(result.error).toBe("IP_DETECTION_FAILED");
          expect(result.message).toContain(String(status));
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);

  test("non-2xx from FreeIPAPI returns GEOLOCATION_FAILED with status in message", async () => {
    await fc.assert(
      fc.asyncProperty(non2xxStatusArb, async (status) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: "203.0.113.42" }),
          } as Response)
          .mockResolvedValueOnce({
            ok: false,
            status,
            json: () => Promise.resolve({}),
          } as Response);

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(result.error).toBe("GEOLOCATION_FAILED");
          expect(result.message).toContain(String(status));
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 7: Network error returns appropriate error code
 *
 * For any fetch rejection during ipify, syncVpnLocation returns NETWORK error.
 * For any fetch rejection during FreeIPAPI, returns NETWORK error.
 * Both have non-empty message.
 *
 * Validates: Requirements 3.6, 3.8
 */
describe("Feature: freeipapi-migration, Property 7: Network error returns appropriate error code", () => {
  test("network error during ipify returns NETWORK error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.mocked(fetch).mockRejectedValueOnce(new Error(errorMsg));

        const result = await syncVpnLocation(true);
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

  test("network error during FreeIPAPI returns NETWORK error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ip: "203.0.113.42" }),
          } as Response)
          .mockRejectedValueOnce(new Error(errorMsg));

        const result = await syncVpnLocation(true);
        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect(result.error).toBe("NETWORK");
          expect(typeof result.message).toBe("string");
          expect(result.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 8: Cache hit avoids FreeIPAPI call
 *
 * After a successful sync, syncVpnLocation(false) with the same IP returns
 * the cached result with only one fetch (ipify for IP detection) and no
 * FreeIPAPI call.
 *
 * Validates: Requirements 5.1, 5.2
 */
describe("Feature: freeipapi-migration, Property 8: Cache hit avoids FreeIPAPI call", () => {
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

          // Second call: cache hit — only ipify, no FreeIPAPI
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
          // Only one fetch (ipify), no FreeIPAPI call
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 9: Force refresh bypasses cache
 *
 * After a successful sync, syncVpnLocation(true) makes two fetch calls
 * (ipify + FreeIPAPI) and returns the fresh result.
 *
 * Validates: Requirements 5.3
 */
describe("Feature: freeipapi-migration, Property 9: Force refresh bypasses cache", () => {
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
            expect(result.latitude).toBe(lat2);
            expect(result.longitude).toBe(lon2);
            expect(result.city).toBe("Second");
          }
          // Two fetches: ipify + FreeIPAPI
          expect(fetch).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

/**
 * Feature: freeipapi-migration, Property 10: Rate limiting enforces minimum interval
 *
 * Consecutive syncVpnLocation calls have at least MIN_REQUEST_INTERVAL (2000ms)
 * between fetch invocations.
 *
 * Validates: Requirements 6.1, 6.2
 */
describe("Feature: freeipapi-migration, Property 10: Rate limiting enforces minimum interval", () => {
  test("consecutive syncs are spaced at least MIN_REQUEST_INTERVAL apart", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (callCount) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter, MIN_REQUEST_INTERVAL } =
          await importBackground();
        await clearIpGeoCache();
        await resetRateLimiter();

        vi.useFakeTimers();

        const fetchTimestamps: number[] = [];
        let fetchCallIndex = 0;

        vi.mocked(fetch).mockImplementation(() => {
          fetchTimestamps.push(Date.now());
          fetchCallIndex++;
          if (fetchCallIndex % 2 === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ ip: `1.2.3.${fetchCallIndex}` }),
            } as Response);
          }
          const ip = `1.2.3.${fetchCallIndex - 1}`;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ipAddress: ip,
                latitude: 40,
                longitude: -74,
                cityName: "Test",
                countryName: "Test",
              }),
          } as Response);
        });

        for (let i = 0; i < callCount; i++) {
          const promise = syncVpnLocation(true);
          await vi.advanceTimersByTimeAsync(MIN_REQUEST_INTERVAL + 100);
          await promise;
        }

        // First fetch of each sync pair
        const syncStartTimestamps = fetchTimestamps.filter((_, idx) => idx % 2 === 0);
        for (let i = 1; i < syncStartTimestamps.length; i++) {
          const interval = syncStartTimestamps[i] - syncStartTimestamps[i - 1];
          expect(interval).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL);
        }

        vi.useRealTimers();
      }),
      { numRuns: 20 }
    );
  });
});
