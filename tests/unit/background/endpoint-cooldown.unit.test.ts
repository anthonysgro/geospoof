/**
 * Unit tests for the per-endpoint cooldown helper.
 * Feature: vpn-region-sync / per-endpoint rate-limit isolation
 *
 * Covers the small state machine that isolates a throttled IP-echo provider or
 * geo service from its siblings: mark-on-throttle, self-expiry, order-preserving
 * availability filtering, the never-empty degraded fallback, and clear().
 */

import {
  EndpointCooldown,
  ENDPOINT_COOLDOWN_MS,
  looksRateLimited,
} from "@/background/endpoint-cooldown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("looksRateLimited", () => {
  test("matches standalone 429 / 403 status codes", () => {
    expect(looksRateLimited("HTTP 429")).toBe(true);
    expect(looksRateLimited("HTTP 403")).toBe(true);
    expect(looksRateLimited("geojs: HTTP 429 Too Many Requests")).toBe(true);
  });

  test("does not match unrelated text or substrings of larger numbers", () => {
    expect(looksRateLimited("HTTP 500")).toBe(false);
    expect(looksRateLimited("timeout")).toBe(false);
    expect(looksRateLimited("status 4290")).toBe(false);
    expect(looksRateLimited("14039")).toBe(false);
  });
});

describe("EndpointCooldown", () => {
  test("a parked key reports cooling down until the window elapses, then recovers", () => {
    const cd = new EndpointCooldown(ENDPOINT_COOLDOWN_MS);
    expect(cd.isCoolingDown("aws")).toBe(false);

    cd.markCoolingDown("aws");
    expect(cd.isCoolingDown("aws")).toBe(true);

    // Just before the window closes: still cooling.
    vi.advanceTimersByTime(ENDPOINT_COOLDOWN_MS - 1);
    expect(cd.isCoolingDown("aws")).toBe(true);

    // At/after the deadline: recovered.
    vi.advanceTimersByTime(1);
    expect(cd.isCoolingDown("aws")).toBe(false);
  });

  test("filterAvailable drops parked keys and preserves input order", () => {
    const cd = new EndpointCooldown();
    const items = ["a", "b", "c", "d"];
    cd.markCoolingDown("b");

    expect(cd.filterAvailable(items, (x) => x)).toEqual(["a", "c", "d"]);
  });

  test("filterAvailable returns the full list when every key is parked (never empty)", () => {
    const cd = new EndpointCooldown();
    const items = ["a", "b"];
    cd.markCoolingDown("a");
    cd.markCoolingDown("b");

    // Degraded-but-alive: better to hit a throttled endpoint than have nothing.
    expect(cd.filterAvailable(items, (x) => x)).toEqual(["a", "b"]);
  });

  test("clear() un-parks every key immediately", () => {
    const cd = new EndpointCooldown();
    cd.markCoolingDown("a");
    cd.markCoolingDown("b");
    expect(cd.isCoolingDown("a")).toBe(true);

    cd.clear();
    expect(cd.isCoolingDown("a")).toBe(false);
    expect(cd.isCoolingDown("b")).toBe(false);
  });

  test("independent keys expire independently", () => {
    const cd = new EndpointCooldown(ENDPOINT_COOLDOWN_MS);
    cd.markCoolingDown("a");
    vi.advanceTimersByTime(ENDPOINT_COOLDOWN_MS / 2);
    cd.markCoolingDown("b");

    // Half a window later, "a" has expired but "b" (parked later) has not.
    vi.advanceTimersByTime(ENDPOINT_COOLDOWN_MS / 2);
    expect(cd.isCoolingDown("a")).toBe(false);
    expect(cd.isCoolingDown("b")).toBe(true);
  });
});
