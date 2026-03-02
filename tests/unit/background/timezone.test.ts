/**
 * Unit Tests for Timezone Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 */

import { vi } from "vitest";
import { importBackground } from "../../helpers/import-background";

describe("Timezone Edge Cases", () => {
  test("should correctly map San Francisco coordinates to America/Los_Angeles", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/Los_Angeles",
            rawOffset: -8,
            dstOffset: -7,
          }),
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(37.7749, -122.4194);
    expect(timezone.identifier).toBe("America/Los_Angeles");
    expect(timezone.offset).toBe(-480);
    expect(timezone.dstOffset).toBe(-420);
  });

  test("should correctly map London coordinates to Europe/London", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Europe/London",
            rawOffset: 0,
            dstOffset: 1,
          }),
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(51.5074, -0.1278);
    expect(timezone.identifier).toBe("Europe/London");
    expect(timezone.offset).toBe(0);
    expect(timezone.dstOffset).toBe(60);
  });

  test("should correctly map Tokyo coordinates to Asia/Tokyo", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "Asia/Tokyo",
            rawOffset: 9,
            dstOffset: 9,
          }),
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(35.6762, 139.6503);
    expect(timezone.identifier).toBe("Asia/Tokyo");
    expect(timezone.offset).toBe(540);
    expect(timezone.dstOffset).toBe(540);
  });

  test("should use fallback timezone estimation when API fails", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("API unavailable")));
    const timezone = await getTimezoneForCoordinates(43.4567, -117.8901);
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
    expect(timezone.offset).toBe(-480);
    expect(timezone.dstOffset).toBe(0);
  });

  test("should estimate timezone from longitude for positive coordinates", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("API unavailable")));
    const timezone = await getTimezoneForCoordinates(44.5678, 140.9012);
    expect(timezone.identifier).toBe("Etc/GMT-9");
    expect(timezone.fallback).toBe(true);
    expect(timezone.offset).toBe(540);
  });

  test("should handle API error responses", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(40.1234, -120.5678);
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should handle API error status in response", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: {
              message: "Invalid coordinates",
              value: 10,
            },
          }),
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(41.2345, -119.6789);
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should handle invalid timezone identifier from API", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "invalid/timezone",
            rawOffset: -8,
            dstOffset: -7,
          }),
      } as Response)
    );
    const timezone = await getTimezoneForCoordinates(42.3456, -118.789);
    expect(timezone.identifier).toBe("Etc/GMT+8");
    expect(timezone.fallback).toBe(true);
  });

  test("should cache timezone results", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            timezoneId: "America/Los_Angeles",
            rawOffset: -8,
            dstOffset: -7,
          }),
      } as Response)
    );
    const lat = 37.1234;
    const lon = -122.5678;
    await getTimezoneForCoordinates(lat, lon);
    expect(fetch).toHaveBeenCalledTimes(1);
    await getTimezoneForCoordinates(lat, lon);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("should cache fallback timezone results", async () => {
    const { getTimezoneForCoordinates } = await importBackground();
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("API unavailable")));
    const lat = 38.9876;
    const lon = -121.4321;
    await getTimezoneForCoordinates(lat, lon);
    expect(fetch).toHaveBeenCalledTimes(1);
    await getTimezoneForCoordinates(lat, lon);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
