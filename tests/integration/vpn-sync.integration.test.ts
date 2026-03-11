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

// Hoist the browser-geo-tz mock so it survives vi.resetModules()
vi.mock("browser-geo-tz", () => ({
  find: vi.fn(),
}));

/**
 * Helper: mock fetch calls for a complete VPN sync flow.
 * Order: IP detection → geolocation → reverse geocode (from handleSetLocation)
 */
function mockVpnSyncFetch(ip: string, lat: number, lon: number, city: string, country: string) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ip }),
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
          query: ip,
        }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          display_name: `${city}, ${country}`,
          address: { city, country },
        }),
    } as Response);
}

/**
 * Helper: set up browser-geo-tz mock for a given timezone after module reset.
 */
async function setupTimezoneMock(timezone: string) {
  const { find: findFn } = await import("browser-geo-tz");
  vi.mocked(findFn).mockResolvedValue([timezone]);
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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      // User clicks "Sync with VPN" tab → popup sends SYNC_VPN
      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
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
     * VPN sync sets locationName from reverse geocoding.
     * Validates: Requirements 2.2, 3.2
     */
    test("should populate locationName from reverse geocoding", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      await setupTimezoneMock("Europe/Paris");
      mockVpnSyncFetch("198.51.100.1", 48.8566, 2.3522, "Paris", "France");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

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
      const {
        handleMessage,
        clearIpGeoCache,
        resetRateLimiter,
        clearTimezoneCache,
        loadSettings,
        ipGeoCache,
      } = await importBackground();
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(true);
      expect(ipGeoCache.size).toBeGreaterThan(0);

      // Step 2: User switches to "Search City" tab → popup sends DISABLE_VPN_SYNC
      await handleMessage({ type: "DISABLE_VPN_SYNC" }, {} as browser.runtime.MessageSender);

      settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);
      expect(ipGeoCache.size).toBe(0);
    });

    /**
     * After disabling VPN sync, user can set a manual location normally.
     * Validates: Requirements 3.5
     */
    test("should allow manual location after disabling VPN sync", async () => {
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      // Step 2: Disable VPN sync
      await handleMessage({ type: "DISABLE_VPN_SYNC" }, {} as browser.runtime.MessageSender);

      // Step 3: Set manual location (Tokyo)
      clearTimezoneCache();
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
        {} as browser.runtime.MessageSender
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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // First sync: US VPN server
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      let settings = await loadSettings();
      expect(settings.location!.latitude).toBe(40.7128);

      // User switches VPN to London server, clicks Re-sync (forceRefresh: true)
      resetRateLimiter();
      clearTimezoneCache();
      await setupTimezoneMock("Europe/London");
      mockVpnSyncFetch("198.51.100.99", 51.5074, -0.1278, "London", "United Kingdom");

      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: true } },
        {} as browser.runtime.MessageSender
      );

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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // First sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      // Second sync with same IP — only IP detection fetch needed, geolocation from cache
      resetRateLimiter();
      clearTimezoneCache();
      await setupTimezoneMock("America/New_York");

      // Only mock IP detection (cache will serve geolocation) + reverse geocode from handleSetLocation
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ip: "203.0.113.42" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              display_name: "New York, United States",
              address: { city: "New York", country: "United States" },
            }),
        } as Response);

      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // First attempt: IP detection fails
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const failResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      // Verify error response
      const errorResponse = failResult as Record<string, unknown>;
      expect(errorResponse.error).toBe("IP_DETECTION_FAILED");
      expect(typeof errorResponse.message).toBe("string");

      // vpnSyncEnabled should NOT be set on failure
      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);

      // User clicks Re-sync → succeeds this time
      resetRateLimiter();
      clearTimezoneCache();
      await setupTimezoneMock("America/Los_Angeles");
      mockVpnSyncFetch("203.0.113.42", 37.7749, -122.4194, "San Francisco", "United States");

      const successResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: true } },
        {} as browser.runtime.MessageSender
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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // First attempt: IP detection succeeds but geolocation fails
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ip: "203.0.113.42" }),
        } as Response)
        .mockRejectedValueOnce(new Error("Geolocation service unavailable"));

      const failResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      const errorResponse = failResult as Record<string, unknown>;
      expect(errorResponse.error).toBe("GEOLOCATION_FAILED");

      // User clicks Re-sync → succeeds
      resetRateLimiter();
      clearTimezoneCache();
      await setupTimezoneMock("Europe/Berlin");
      mockVpnSyncFetch("203.0.113.42", 52.52, 13.405, "Berlin", "Germany");

      const successResult = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: true } },
        {} as browser.runtime.MessageSender
      );

      const successResponse = successResult as Record<string, unknown>;
      expect(successResponse.latitude).toBe(52.52);
      expect(successResponse.city).toBe("Berlin");

      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(52.52);
      expect(settings.timezone!.identifier).toBe("Europe/Berlin");
    });

    /**
     * Reverse geocoding fails during VPN sync but location still saved.
     * Validates: Requirements 2.2
     */
    test("should save location even when reverse geocoding fails during sync", async () => {
      vi.mocked(fetch).mockReset();
      const { handleMessage, clearIpGeoCache, resetRateLimiter, clearTimezoneCache, loadSettings } =
        await importBackground();
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      await setupTimezoneMock("Asia/Tokyo");

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ip: "203.0.113.42" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "success",
              lat: 35.6762,
              lon: 139.6503,
              city: "Tokyo",
              country: "Japan",
              query: "203.0.113.42",
            }),
        } as Response)
        // Reverse geocode fails (3 attempts: initial + 2 retries from fetchWithRetry)
        .mockRejectedValueOnce(new Error("Nominatim unavailable"))
        .mockRejectedValueOnce(new Error("Nominatim unavailable"))
        .mockRejectedValueOnce(new Error("Nominatim unavailable"));

      const result = await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      // VPN sync itself should succeed
      const response = result as Record<string, unknown>;
      expect(response.latitude).toBe(35.6762);

      // Location should still be persisted
      const settings = await loadSettings();
      expect(settings.location!.latitude).toBe(35.6762);
      expect(settings.location!.longitude).toBe(139.6503);
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
      clearIpGeoCache();
      resetRateLimiter();
      clearTimezoneCache();

      // Step 1: Activate VPN sync
      await setupTimezoneMock("America/New_York");
      mockVpnSyncFetch("203.0.113.42", 40.7128, -74.006, "New York", "United States");

      await handleMessage(
        { type: "SYNC_VPN", payload: { forceRefresh: false } },
        {} as browser.runtime.MessageSender
      );

      let settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(true);

      // Step 2: User sets manual location via SET_LOCATION
      clearTimezoneCache();
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
        {} as browser.runtime.MessageSender
      );

      // VPN sync should be disabled, cache cleared
      settings = await loadSettings();
      expect(settings.vpnSyncEnabled).toBe(false);
      expect(settings.location!.latitude).toBe(52.52);
    });
  });
});
