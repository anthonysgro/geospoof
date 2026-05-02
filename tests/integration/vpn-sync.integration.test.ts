/**
 * Integration Tests for VPN Sync Workflow
 *
 * Tests end-to-end VPN sync workflows including:
 * - Full VPN sync: user activates sync → location updates
 * - Tab switching: VPN sync → Search City → VPN sync deactivated
 * - Re-sync after VPN server change: first sync → new IP → re-sync → new location
 * - Error recovery: sync fails → error displayed → re-sync succeeds
 *
 * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.5, 5.1, 5.2, 5.4, 5.5
 */

import { importBackground } from "../helpers/import-background";
import { sessionStorageData } from "../setup";

// Hoist the browser-geo-tz mock so it survives vi.resetModules()
vi.mock("browser-geo-tz", () => ({
  init: vi.fn(() => ({
    find: vi.fn().mockResolvedValue([]),
  })),
}));

/**
 * Helper: mock fetch calls for a complete VPN sync flow.
 * Order: IP detection (ipify) → 3 parallel geo services (geojs, freeipapi, reallyfreegeoip).
 * All three geo services run in parallel; first success wins.
 */
function mockVpnSyncFetch(ip: string, lat: number, lon: number, city: string, country: string) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ip }),
    } as Response)
    // geojs.io — lat/lng are strings
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ip,
          city,
          country,
          latitude: String(lat),
          longitude: String(lon),
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
          latitude: lat,
          longitude: lon,
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
          latitude: lat,
          longitude: lon,
        }),
    } as Response);
}

/**
 * Helper: set up browser-geo-tz mock for a given timezone after module reset.
 */
async function setupTimezoneMock(timezone: string) {
  const { init: initFn } = await import("browser-geo-tz");
  const initMocked = vi.mocked(initFn);
  const results = initMocked.mock.results;
  const lastResult = results[results.length - 1];
  if (lastResult && lastResult.type === "return") {
    vi.mocked((lastResult.value as { find: ReturnType<typeof vi.fn> }).find).mockResolvedValue([
      timezone,
    ]);
  } else {
    const findFn = vi.fn().mockResolvedValue([timezone]);
    initMocked.mockReturnValue({ find: findFn });
  }
}

describe("VPN Sync Integration Tests", () => {
  describe("Workflow: VPN sync tab → sync completes → location display updates", () => {
    /**
     * Full VPN sync workflow via SYNC_VPN message.
     * Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2
     */
    test("should complete full VPN sync and update location", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      // User clicks "Sync with VPN" tab → popup sends SYNC_VPN
      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {}
      );

      // Verify success response contains all required fields
      const response = result as Record<string, unknown>;
      expect(response.latitude).toBe(40.7128);
      expect(response.longitude).toBe(-74.006);
      expect(response.city).toBe("New York");
      expect(response.country).toBe("United States");
      expect(response.ip).toBe("203.0.113.42");

      // Verify location was persisted via handleSetLocation pipeline
      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(40.7128);
      expect(settings.location!.longitude).toBe(-74.006);
      expect(settings.timezone!.identifier).toBe("America/New_York");
      expect(settings.vpnSyncEnabled).toBe(true);
    });

    /**
     * VPN sync sets locationName from ipwho.is response directly.
     * Validates: Requirements 2.2, 3.2
     */
    test("should populate locationName from ipwho.is response", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      await setupTimezoneMock("Europe/Paris");
      mockVpnSyncFetch("198.51.100.1", 48.8566, 2.3522, "Paris", "France");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      const settings = await loadSettings();
      expect(settings.locationName).not.toBeNull();
      expect(settings.locationName!.city).toBe("Paris");
      expect(settings.locationName!.country).toBe("France");
    });
  });

  describe("Workflow: Tab switching — VPN sync → Search City → VPN sync deactivated", () => {
    /**
     * Switching away from VPN sync disables it and clears cache.
     * Validates: Requirements 3.5, 5.1
     */
    test("should deactivate VPN sync when user switches to another input method", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(true);
      const cacheKeys = Object.keys(sessionStorageData).filter((k) => k.startsWith("cache:ipGeo:"));
      expect(cacheKeys.length).toBeGreaterThan(0);

      // Step 2: User switches to "Search City" tab → popup sends DISABLE_VPN_SYNC
      await handleMessage({ type: "DISABLE_VPN_SYNC" }, {});

      settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);
      const cacheKeysAfter = Object.keys(sessionStorageData).filter((k) =>
        k.startsWith("cache:ipGeo:")
      );
      expect(cacheKeysAfter.length).toBe(0);
    });

    /**
     * After disabling VPN sync, user can set a manual location normally.
     * Validates: Requirements 3.5
     */
    test("should allow manual location after disabling VPN sync", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      // Step 2: Disable VPN sync
      await handleMessage({ type: "DISABLE_VPN_SYNC" }, {});

      // Step 3: Set manual location (Tokyo)
      await clearTimezoneCache();
      await setupTimezoneMock("Asia/Tokyo");
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Tokyo, Japan",
            address: { city: "Tokyo", country: "Japan" },
          }),
      } as Response);

      await handleMessage(
        { type: "SET_LOCATION", payload: { latitude: 35.6762, longitude: 139.6503 } },
        {}
      );

      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(35.6762);
      expect(settings.location!.longitude).toBe(139.6503);
      expect(settings.vpnSyncEnabled).toBe(false);
    });
  });

  describe("Workflow: Re-sync after VPN server change", () => {
    /**
     * First sync → change mock IP → re-sync → verify new location.
     * Validates: Requirements 5.1, 5.2, 5.4
     */
    test("should update location when user re-syncs after VPN server change", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // First sync: US VPN server
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      let settings = await loadSettings();
      expect(settings.location!.latitude).toBe(40.7128);

      // User switches VPN to London server, clicks Re-sync (forceRefresh: true)
      await resetRateLimiter();
      await clearTimezoneCache();
      await setupTimezoneMock("Europe/London");
      mockVpnSyncFetch("198.51.100.99", 51.5074, -0.1278, "London", "United Kingdom");

      const result = await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: true } }, {});

      // Verify new location returned
      const response = result as Record<string, unknown>;
      expect(response.ip).toBe("198.51.100.99");
      expect(response.latitude).toBe(51.5074);
      expect(response.city).toBe("London");

      // Verify persisted location updated
      settings = await loadSettings();
      expect(settings.location!.latitude).toBe(51.5074);
      expect(settings.location!.longitude).toBe(-0.1278);
      expect(settings.timezone!.identifier).toBe("Europe/London");
    });

    /**
     * Re-sync with same IP returns cached result when not forced.
     * Validates: Requirements 5.2
     */
    test("should use cache when IP unchanged and forceRefresh is false", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // First sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      // Second sync with same IP — only IP detection fetch needed, geolocation from cache
      await resetRateLimiter();
      await clearTimezoneCache();
      await setupTimezoneMock("America/New_York");

      // Only mock IP detection (cache will serve geolocation)
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ip: "203.0.113.42" }),
      } as Response);

      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {}
      );

      const response = result as Record<string, unknown>;
      expect(response.latitude).toBe(40.7128);
      expect(response.city).toBe("New York");
    });
  });

  describe("Workflow: Error recovery — sync fails → re-sync succeeds", () => {
    /**
     * IP detection fails → error returned → user re-syncs → succeeds.
     * Validates: Requirements 5.5, 1.1
     */
    test("should recover from IP detection failure on re-sync", async () => {
      vi.mocked(fetch).mockReset();
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // First attempt: IP detection fails
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const failResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {}
      );

      // Verify error response
      const errorResponse = failResult as Record<string, unknown>;
      expect(errorResponse.error).toBe("IP_DETECTION_FAILED");
      expect(typeof errorResponse.message).toBe("string");

      // vpnSyncEnabled should NOT be set on failure
      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);

      // User clicks Re-sync → succeeds this time
      await resetRateLimiter();
      await clearTimezoneCache();
      await setupTimezoneMock("America/Los_Angeles");
      mockVpnSyncFetch("203.0.113.42", 37.7749, -122.4194, "San Francisco", "United States");

      const successResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: true } },
        {}
      );

      const successResponse = successResult as Record<string, unknown>;
      expect(successResponse.latitude).toBe(37.7749);
      expect(successResponse.city).toBe("San Francisco");

      settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(true);
      expect(settings.location!.latitude).toBe(37.7749);
    });

    /**
     * Geolocation fails → error returned → user re-syncs → succeeds.
     * Validates: Requirements 5.5, 2.1
     */
    test("should recover from geolocation failure on re-sync", async () => {
      vi.mocked(fetch).mockReset();
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // First attempt: IP detection succeeds but all four geo services fail
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ip: "203.0.113.42" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response);

      const failResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {}
      );

      const errorResponse = failResult as Record<string, unknown>;
      expect(errorResponse.error).toBe("GEOLOCATION_FAILED");

      // User clicks Re-sync → succeeds
      await resetRateLimiter();
      await clearTimezoneCache();
      await setupTimezoneMock("Europe/Berlin");
      mockVpnSyncFetch("203.0.113.42", 52.52, 13.405, "Berlin", "Germany");

      const successResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: true } },
        {}
      );

      const successResponse = successResult as Record<string, unknown>;
      expect(successResponse.latitude).toBe(52.52);
      expect(successResponse.city).toBe("Berlin");

      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(52.52);
      expect(settings.timezone!.identifier).toBe("Europe/Berlin");
    });

    /**
     * VPN sync uses city/country from ipwho.is directly, no Nominatim needed.
     * Validates: Requirements 2.2
     */
    test("should use city/country from ipwho.is directly", async () => {
      vi.mocked(fetch).mockReset();
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      await setupTimezoneMock("Asia/Tokyo");

      // Only IP detection and 3 parallel geo services — no Nominatim call
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ip: "203.0.113.42" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ip: "203.0.113.42",
              city: "Tokyo",
              country: "Japan",
              latitude: "35.6762",
              longitude: "139.6503",
            }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ipAddress: "203.0.113.42",
              cityName: "Tokyo",
              countryName: "Japan",
              latitude: 35.6762,
              longitude: 139.6503,
            }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ip: "203.0.113.42",
              city: "Tokyo",
              country_name: "Japan",
              latitude: 35.6762,
              longitude: 139.6503,
            }),
        } as Response);

      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {}
      );

      // VPN sync should succeed
      const response = result as Record<string, unknown>;
      expect(response.latitude).toBe(35.6762);

      // Location and locationName should be persisted from ipwho.is data
      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(35.6762);
      expect(settings.location!.longitude).toBe(139.6503);
      expect(settings.locationName!.city).toBe("Tokyo");
      expect(settings.locationName!.country).toBe("Japan");
      expect(settings.vpnSyncEnabled).toBe(true);
    });
  });

  describe("Workflow: Manual location overrides VPN sync", () => {
    /**
     * Setting a manual location while VPN sync is active disables VPN sync.
     * Validates: Requirements 3.5
     */
    test("should disable VPN sync when manual location is set", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      await clearIpGeoCache();
      await resetRateLimiter();
      await clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage({ type: "SYNC_VPN", payload: { forceRefresh: false } }, {});

      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(true);

      // Step 2: User sets manual location via SET_LOCATION
      await clearTimezoneCache();
      await setupTimezoneMock("Europe/Berlin");
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Berlin, Germany",
            address: { city: "Berlin", country: "Germany" },
          }),
      } as Response);

      await handleMessage(
        { type: "SET_LOCATION", payload: { latitude: 52.52, longitude: 13.405 } },
        {}
      );

      // VPN sync should be disabled, cache cleared
      settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);
      expect(settings.location!.latitude).toBe(52.52);
    });
  });
});
