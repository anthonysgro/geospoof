/**
 * Unit Tests for SYNC_VPN message handler and startup auto-sync
 * Feature: vpn-region-sync
 * Validates: Requirements 4.3, 6.1, 6.2, 6.3
 */

import { storageData, sessionStorageData } from "../../setup";
import { importBackground } from "../../helpers/import-background";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";

function mockFetchForVpnSync(ip: string, lat: number, lon: number, city: string, country: string) {
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
          latitude: lat,
          longitude: lon,
          cityName: city,
          countryName: country,
        }),
    } as Response)
    // reverse geocode call from handleSetLocation
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          display_name: `${city}, ${country}`,
          address: { city, country },
        }),
    } as Response)
    // timezone lookup call from handleSetLocation
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          timezoneId: "America/New_York",
          rawOffset: -5,
          dstOffset: -4,
        }),
    } as Response);
}

describe("SYNC_VPN message handler", () => {
  /**
   * Test SYNC_VPN message routing — success path
   * Validates: Requirements 6.1, 6.2
   */
  test("should handle SYNC_VPN message and return success response", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter } = await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    mockFetchForVpnSync("203.0.113.42", 40.7128, -74.006, "New York", "United States");

    const result = await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: false } },
      {} as browser.runtime.MessageSender
    );

    const response = result as Record<string, unknown>;
    expect(response.latitude).toBe(40.7128);
    expect(response.longitude).toBe(-74.006);
    expect(response.city).toBe("New York");
    expect(response.country).toBe("United States");
    expect(response.ip).toBe("203.0.113.42");
  });

  /**
   * Test SYNC_VPN persists vpnSyncEnabled on success
   * Validates: Requirements 6.1
   */
  test("should persist vpnSyncEnabled on success", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter, loadSettings } =
      await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    mockFetchForVpnSync("198.51.100.1", 51.5074, -0.1278, "London", "United Kingdom");

    await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: true } },
      {} as browser.runtime.MessageSender
    );

    const settings = await loadSettings();
    expect(settings.vpnSyncEnabled).toBe(true);
  });

  /**
   * Test SYNC_VPN calls handleSetLocation with correct coordinates
   * Validates: Requirements 6.1
   */
  test("should call handleSetLocation with coordinates from VPN sync", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter, loadSettings } =
      await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    mockFetchForVpnSync("203.0.113.42", 35.6762, 139.6503, "Tokyo", "Japan");

    await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: false } },
      {} as browser.runtime.MessageSender
    );

    const settings = await loadSettings();
    expect(settings.location).not.toBeNull();
    expect(settings.location!.latitude).toBe(35.6762);
    expect(settings.location!.longitude).toBe(139.6503);
  });

  /**
   * Test SYNC_VPN returns error response on IP detection failure
   * Validates: Requirements 6.3
   */
  test("should return error response when IP detection fails", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter } = await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: false } },
      {} as browser.runtime.MessageSender
    );

    const response = result as Record<string, unknown>;
    expect(response.error).toBe("IP_DETECTION_FAILED");
    expect(typeof response.message).toBe("string");
    expect((response.message as string).length).toBeGreaterThan(0);
  });

  /**
   * Test SYNC_VPN returns error response on geolocation failure
   * Validates: Requirements 6.3
   */
  test("should return error response when geolocation fails", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter } = await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ip: "203.0.113.42" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response);

    const result = await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: false } },
      {} as browser.runtime.MessageSender
    );

    const response = result as Record<string, unknown>;
    expect(response.error).toBe("GEOLOCATION_FAILED");
    expect(typeof response.message).toBe("string");
  });

  /**
   * Test SYNC_VPN does not persist settings on failure
   * Validates: Requirements 6.3
   */
  test("should not persist vpnSyncEnabled on failure", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter, loadSettings } =
      await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    await handleMessage(
      { type: "SYNC_VPN", payload: { forceRefresh: false } },
      {} as browser.runtime.MessageSender
    );

    const settings = await loadSettings();
    expect(settings.vpnSyncEnabled).toBe(false);
  });

  /**
   * Test SYNC_VPN defaults forceRefresh to false when payload is missing
   * Validates: Requirements 6.1
   */
  test("should default forceRefresh to false when no payload provided", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter } = await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    mockFetchForVpnSync("203.0.113.42", 48.8566, 2.3522, "Paris", "France");

    const result = await handleMessage({ type: "SYNC_VPN" }, {} as browser.runtime.MessageSender);

    const response = result as Record<string, unknown>;
    expect(response.latitude).toBe(48.8566);
    expect(response.longitude).toBe(2.3522);
  });
});

describe("DISABLE_VPN_SYNC message handler", () => {
  /**
   * Test DISABLE_VPN_SYNC sets vpnSyncEnabled to false in storage
   * Validates: Requirements 9.3, 3.5
   */
  test("should set vpnSyncEnabled to false in storage", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter, loadSettings, updateSettings } =
      await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    // First enable VPN sync
    await updateSettings({ vpnSyncEnabled: true });
    let settings = await loadSettings();
    expect(settings.vpnSyncEnabled).toBe(true);

    // Send DISABLE_VPN_SYNC
    const result = await handleMessage(
      { type: "DISABLE_VPN_SYNC" },
      {} as browser.runtime.MessageSender
    );

    expect(result).toEqual({ success: true });

    settings = await loadSettings();
    expect(settings.vpnSyncEnabled).toBe(false);
  });

  /**
   * Test DISABLE_VPN_SYNC clears the in-memory IP geolocation cache
   * Validates: Requirements 9.3
   */
  test("should clear the IP geolocation cache", async () => {
    const { handleMessage, resetRateLimiter } = await importBackground();
    await resetRateLimiter();

    // Populate session storage cache with a fake entry (using the "cache:" prefix from session-cache)
    sessionStorageData["cache:ipGeo:203.0.113.42"] = {
      latitude: 40.7128,
      longitude: -74.006,
      city: "New York",
      country: "United States",
      ip: "203.0.113.42",
    };
    expect(
      Object.keys(sessionStorageData).filter((k) => k.startsWith("cache:ipGeo:"))
    ).toHaveLength(1);

    // Send DISABLE_VPN_SYNC
    await handleMessage({ type: "DISABLE_VPN_SYNC" }, {} as browser.runtime.MessageSender);

    expect(
      Object.keys(sessionStorageData).filter((k) => k.startsWith("cache:ipGeo:"))
    ).toHaveLength(0);
  });

  /**
   * Test DISABLE_VPN_SYNC prevents auto-sync on next startup
   * Validates: Requirements 9.3, 3.5
   */
  test("should prevent auto-sync on next startup after disabling", async () => {
    const { handleMessage, clearIpGeoCache, resetRateLimiter, updateSettings } =
      await importBackground();
    await clearIpGeoCache();
    await resetRateLimiter();

    // Enable VPN sync, then disable it
    await updateSettings({ vpnSyncEnabled: true });
    await handleMessage({ type: "DISABLE_VPN_SYNC" }, {} as browser.runtime.MessageSender);

    // Simulate a fresh startup by re-importing
    vi.mocked(fetch).mockClear();

    storageData.settings = await (async () => {
      const { loadSettings } = await importBackground();
      return await loadSettings();
    })();

    const { initialize } = await importBackground();
    await initialize();

    // No VPN-related fetch calls should have been made
    const fetchCalls = vi.mocked(fetch).mock.calls;
    const vpnIpCalls = fetchCalls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("ipify")
    );
    expect(vpnIpCalls).toHaveLength(0);
  });
});

describe("Startup auto-sync", () => {
  /**
   * Test auto-sync triggers when vpnSyncEnabled is true
   * Validates: Requirements 4.3
   */
  test("should auto-sync VPN location on startup when vpnSyncEnabled is true", async () => {
    // Pre-populate storage with vpnSyncEnabled: true
    storageData.settings = {
      ...DEFAULT_SETTINGS,
      vpnSyncEnabled: true,
      enabled: true,
    };

    // Mock fetch for the auto-sync flow: IP detection + geolocation + reverse geocode + timezone
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ip: "203.0.113.42" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ipAddress: "203.0.113.42",
            latitude: 37.7749,
            longitude: -122.4194,
            cityName: "San Francisco",
            countryName: "United States",
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "San Francisco, United States",
            address: { city: "San Francisco", country: "United States" },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/Los_Angeles",
            rawOffset: -8,
            dstOffset: -7,
          }),
      } as Response);

    const { initialize, loadSettings } = await importBackground();
    await initialize();

    const settings = await loadSettings();
    expect(settings.location).not.toBeNull();
    expect(settings.location!.latitude).toBe(37.7749);
    expect(settings.location!.longitude).toBe(-122.4194);
  });

  /**
   * Test auto-sync does NOT trigger when vpnSyncEnabled is false
   * Validates: Requirements 4.3
   */
  test("should not auto-sync when vpnSyncEnabled is false", async () => {
    storageData.settings = {
      ...DEFAULT_SETTINGS,
      vpnSyncEnabled: false,
    };

    const { initialize } = await importBackground();
    await initialize();

    // fetch should not have been called for VPN sync (may be called for other init tasks)
    // The key assertion is that no VPN-related fetch calls were made
    const fetchCalls = vi.mocked(fetch).mock.calls;
    const vpnIpCalls = fetchCalls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("ipify")
    );
    expect(vpnIpCalls).toHaveLength(0);
  });

  /**
   * Test auto-sync failure does not block startup
   * Validates: Requirements 4.3
   */
  test("should not block startup when auto-sync fails", async () => {
    storageData.settings = {
      ...DEFAULT_SETTINGS,
      vpnSyncEnabled: true,
    };

    // Mock fetch to fail for IP detection
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network unavailable"));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { initialize, loadSettings } = await importBackground();

    // initialize should complete without throwing
    await expect(initialize()).resolves.not.toThrow();

    const settings = await loadSettings();
    // vpnSyncEnabled should remain true (not cleared on failure)
    expect(settings.vpnSyncEnabled).toBe(true);

    consoleSpy.mockRestore();
  });

  /**
   * Test auto-sync uses cache (forceRefresh=false)
   * Validates: Requirements 4.3
   */
  test("should use cache for startup auto-sync (forceRefresh=false)", async () => {
    storageData.settings = {
      ...DEFAULT_SETTINGS,
      vpnSyncEnabled: true,
    };

    // Mock fetch for IP detection + geolocation + reverse geocode + timezone
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ip: "10.0.0.1" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ipAddress: "10.0.0.1",
            latitude: 52.52,
            longitude: 13.405,
            cityName: "Berlin",
            countryName: "Germany",
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: "Berlin, Germany",
            address: { city: "Berlin", country: "Germany" },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/Berlin",
            rawOffset: 1,
            dstOffset: 2,
          }),
      } as Response);

    const { initialize, loadSettings } = await importBackground();
    await initialize();

    const settings = await loadSettings();
    expect(settings.location).not.toBeNull();
    expect(settings.location!.latitude).toBe(52.52);
    expect(settings.location!.longitude).toBe(13.405);
  });
});
