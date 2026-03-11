/**
 * Property-Based Tests for VPN Region Sync
 * Feature: vpn-region-sync
 */

import fc from "fast-check";
import type { Settings } from "@/shared/types/settings";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";
import { importBackground } from "../helpers/import-background";

/**
 * Feature: vpn-region-sync, Property 6: VPN settings validation round-trip
 *
 * Validates: Requirements 4.1, 7.3
 *
 * For any valid vpnSyncEnabled boolean, saving settings and then loading
 * and validating them should preserve the value. For any non-boolean
 * vpnSyncEnabled, validation should replace it with false.
 */
describe("Feature: vpn-region-sync, Property 6: VPN settings validation round-trip", () => {
  test("valid vpnSyncEnabled is preserved through validation", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (vpnSyncEnabled) => {
        const { validateSettings } = await importBackground();

        const settings: Partial<Settings> = {
          ...DEFAULT_SETTINGS,
          vpnSyncEnabled,
        };

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

          const settings = {
            ...DEFAULT_SETTINGS,
            vpnSyncEnabled: invalidValue as boolean,
          };

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

        const settings: Settings = {
          ...DEFAULT_SETTINGS,
          vpnSyncEnabled,
        };

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
 *
 * Validates: Requirements 1.4
 *
 * For any string that is not a valid IPv4 or IPv6 address,
 * isValidIpAddress should return false.
 */
describe("Feature: vpn-region-sync, Property 1: Invalid IP rejection", () => {
  test("arbitrary non-IP strings are rejected", async () => {
    const { isValidIpAddress } = await importBackground();

    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => {
          // Filter out strings that happen to be valid IPs
          const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
          const m = s.match(ipv4);
          if (m && m.slice(1).every((o) => parseInt(o, 10) >= 0 && parseInt(o, 10) <= 255)) {
            return false;
          }
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

  test("known invalid IP examples are rejected", async () => {
    const { isValidIpAddress } = await importBackground();

    const invalidIps = [
      "",
      "not-an-ip",
      "999.999.999.999",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "abc.def.ghi.jkl",
      "192.168.1",
      "hello world",
      "12345",
    ];

    for (const ip of invalidIps) {
      expect(isValidIpAddress(ip)).toBe(false);
    }
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
          const ip = `${a}.${b}.${c}.${d}`;
          expect(isValidIpAddress(ip)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: vpn-region-sync, Property 2: Out-of-range coordinate rejection
 *
 * Validates: Requirements 2.4
 *
 * For any IP geolocation response where latitude is outside [-90, 90]
 * or longitude is outside [-180, 180], geolocateIp should treat the
 * response as invalid and return a GEOLOCATION_FAILED error.
 */
describe("Feature: vpn-region-sync, Property 2: Out-of-range coordinate rejection", () => {
  test("out-of-range latitude causes GEOLOCATION_FAILED", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 91, max: 1000, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        async (lat, lon) => {
          const { geolocateIp } = await importBackground();

          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "success",
                lat,
                lon,
                city: "Test",
                country: "Test",
                query: "1.2.3.4",
              }),
          } as Response);

          await expect(geolocateIp("1.2.3.4")).rejects.toThrow("Invalid coordinates");
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
          const { geolocateIp } = await importBackground();

          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "success",
                lat,
                lon,
                city: "Test",
                country: "Test",
                query: "1.2.3.4",
              }),
          } as Response);

          await expect(geolocateIp("1.2.3.4")).rejects.toThrow("Invalid coordinates");
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
          const { geolocateIp } = await importBackground();

          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "success",
                lat,
                lon,
                city: "Test",
                country: "Test",
                query: "1.2.3.4",
              }),
          } as Response);

          await expect(geolocateIp("1.2.3.4")).rejects.toThrow("Invalid coordinates");
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Feature: vpn-region-sync, Property 3: Sync coordinates flow-through
 *
 * Validates: Requirements 2.2
 *
 * For any valid IP geolocation result with latitude in [-90, 90] and
 * longitude in [-180, 180], a successful syncVpnLocation call should
 * return those exact coordinates, ensuring they can be passed to
 * handleSetLocation for the existing SET_LOCATION pipeline.
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
          clearIpGeoCache();
          resetRateLimiter();

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
                  status: "success",
                  lat,
                  lon,
                  city,
                  country,
                  query: testIp,
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
 *
 * Validates: Requirements 6.2
 *
 * For any successful VPN sync operation, the response object should
 * contain all five required fields: latitude (number), longitude (number),
 * city (string), country (string), and ip (string), with latitude in
 * [-90, 90] and longitude in [-180, 180].
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
          clearIpGeoCache();
          resetRateLimiter();

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
                  status: "success",
                  lat,
                  lon,
                  city,
                  country,
                  query: testIp,
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
 *
 * Validates: Requirements 6.3
 *
 * For any failed VPN sync operation, the response object should contain
 * an error field with one of the defined error codes and a message field
 * that is a non-empty string.
 */
describe("Feature: vpn-region-sync, Property 5: Error response structure", () => {
  test("IP detection failure returns proper error structure", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMsg) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
        clearIpGeoCache();
        resetRateLimiter();

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
        clearIpGeoCache();
        resetRateLimiter();

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
        clearIpGeoCache();
        resetRateLimiter();

        if (failureType === "ip_fail") {
          vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
        } else if (failureType === "geo_fail") {
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: "1.2.3.4" }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ status: "fail" }),
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
 *
 * Validates: Requirements 8.2
 *
 * For any IP address that has been previously geolocated and cached,
 * calling syncVpnLocation with forceRefresh=false when the detected IP
 * matches the cached IP should return the cached IpGeolocationResult
 * without making a new geolocation API request.
 */
describe("Feature: vpn-region-sync, Property 7: Cache hit returns cached result", () => {
  test("cached IP returns cached result without new geolocation API call", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (lat, lon) => {
          const { syncVpnLocation, clearIpGeoCache, resetRateLimiter } = await importBackground();
          clearIpGeoCache();
          resetRateLimiter();

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
                  status: "success",
                  lat,
                  lon,
                  city: "Cached",
                  country: "Test",
                  query: testIp,
                }),
            } as Response);

          const firstResult = await syncVpnLocation(true);
          expect("error" in firstResult).toBe(false);

          // Reset fetch mock and rate limiter for second call
          vi.mocked(fetch).mockReset();
          resetRateLimiter();

          // Second call: should use cache (only IP detection fetch, no geolocation fetch)
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

          // fetch should have been called only once (for IP detection, not geolocation)
          expect(fetch).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

/**
 * Feature: vpn-region-sync, Property 8: Force refresh bypasses cache
 *
 * Validates: Requirements 5.2, 8.3
 *
 * For any IP address that has been previously geolocated and cached,
 * calling syncVpnLocation with forceRefresh=true should perform a fresh
 * geolocation API request regardless of cache state, and update the
 * cache with the new result.
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
          clearIpGeoCache();
          resetRateLimiter();

          const testIp = "203.0.113.42";

          // First call: populate cache with lat1/lon1
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  status: "success",
                  lat: lat1,
                  lon: lon1,
                  city: "First",
                  country: "Test",
                  query: testIp,
                }),
            } as Response);

          await syncVpnLocation(true);

          // Reset rate limiter for second call
          resetRateLimiter();

          // Second call with forceRefresh=true: should make fresh API call
          vi.mocked(fetch)
            .mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ ip: testIp }),
            } as Response)
            .mockResolvedValueOnce({
              ok: true,
              json: () =>
                Promise.resolve({
                  status: "success",
                  lat: lat2,
                  lon: lon2,
                  city: "Second",
                  country: "Test",
                  query: testIp,
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
 *
 * Validates: Requirements 8.4
 *
 * For any sequence of consecutive VPN sync requests, the actual time
 * between API calls to the Public_IP_Service and IP_Geolocation_Service
 * should be at least 2 seconds (the MIN_REQUEST_INTERVAL).
 */
describe("Feature: vpn-region-sync, Property 9: Rate limiting enforces minimum interval", () => {
  test("consecutive API calls are spaced at least MIN_REQUEST_INTERVAL apart", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (callCount) => {
        const { syncVpnLocation, clearIpGeoCache, resetRateLimiter, MIN_REQUEST_INTERVAL } =
          await importBackground();
        clearIpGeoCache();
        resetRateLimiter();

        vi.useFakeTimers();

        const fetchTimestamps: number[] = [];
        let fetchCallIndex = 0;

        vi.mocked(fetch).mockImplementation(() => {
          fetchTimestamps.push(Date.now());
          fetchCallIndex++;
          // Alternate: odd calls return IP, even calls return geolocation
          if (fetchCallIndex % 2 === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ ip: `1.2.3.${fetchCallIndex}` }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "success",
                lat: 40,
                lon: -74,
                city: "Test",
                country: "Test",
                query: `1.2.3.${fetchCallIndex - 1}`,
              }),
          } as Response);
        });

        for (let i = 0; i < callCount; i++) {
          // Each sync uses a unique IP to bypass cache
          const promise = syncVpnLocation(true);
          await vi.advanceTimersByTimeAsync(MIN_REQUEST_INTERVAL + 100);
          await promise;
        }

        // Extract the first fetch timestamp from each sync operation (every 2 fetches)
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
