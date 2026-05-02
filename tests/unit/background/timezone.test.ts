/**
 * Unit Tests for Timezone Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 *
 * Updated to use browser-geo-tz mocking instead of GeoNames fetch mocking.
 */

import { vi } from "vitest";
import { importBackground } from "../../helpers/import-background";

// Mock browser-geo-tz at the module level
vi.mock("browser-geo-tz", () => ({
  init: vi.fn(() => ({
    find: vi.fn().mockResolvedValue([]),
  })),
}));

async function getMockedFind() {
  const mod = await import("browser-geo-tz");
  const initMock = vi.mocked(mod.init);
  // Get the most recent init() call result
  const results = initMock.mock.results;
  const lastResult = results[results.length - 1];
  if (lastResult && lastResult.type === "return") {
    return vi.mocked((lastResult.value as { find: ReturnType<typeof vi.fn> }).find);
  }
  const findFn = vi.fn().mockResolvedValue([]);
  initMock.mockReturnValue({ find: findFn });
  return findFn;
}

describe("Timezone Edge Cases", () => {
  let mockedFind: Awaited<ReturnType<typeof getMockedFind>>;

  beforeEach(async () => {
    mockedFind = await getMockedFind();
    mockedFind.mockReset();
  });

  test("should correctly map San Francisco coordinates to America/Los_Angeles", async () => {
    const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
    await clearTimezoneCache();

    mockedFind.mockResolvedValue(["America/Los_Angeles"]);

    const timezone = await getTimezoneForCoordinates(37.7749, -122.4194);
    expect(timezone.identifier).toBe("America/Los_Angeles");
    expect(Number.isFinite(timezone.offset)).toBe(true);
    expect(Number.isFinite(timezone.dstOffset)).toBe(true);
  });

  test("should correctly map London coordinates to Europe/London", async () => {
    const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
    await clearTimezoneCache();

    mockedFind.mockResolvedValue(["Europe/London"]);

    const timezone = await getTimezoneForCoordinates(51.5074, -0.1278);
    expect(timezone.identifier).toBe("Europe/London");
    expect(Number.isFinite(timezone.offset)).toBe(true);
    expect(Number.isFinite(timezone.dstOffset)).toBe(true);
  });

  test("should correctly map Tokyo coordinates to Asia/Tokyo", async () => {
    const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
    await clearTimezoneCache();

    mockedFind.mockResolvedValue(["Asia/Tokyo"]);

    const timezone = await getTimezoneForCoordinates(35.6762, 139.6503);
    expect(timezone.identifier).toBe("Asia/Tokyo");
    expect(timezone.offset).toBe(540);
    expect(timezone.dstOffset).toBe(0);
  });

  test("should handle invalid timezone identifier from browser-geo-tz", async () => {
    const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
    await clearTimezoneCache();

    mockedFind.mockResolvedValue(["invalid/timezone"]);

    const timezone = await getTimezoneForCoordinates(42.3456, -118.789);
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should resolve timezone within 100ms", async () => {
    const { getTimezoneForCoordinates, clearTimezoneCache } = await importBackground();
    await clearTimezoneCache();

    mockedFind.mockResolvedValue(["America/Los_Angeles"]);

    const startTime = Date.now();
    await getTimezoneForCoordinates(37.7749, -122.4194);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(100);
  });
});
