/**
 * Per-endpoint cooldown helper.
 *
 * Both the public-IP echo providers (AWS / Cloudflare / Akamai / ipify, tried
 * as a sequential failover) and the IP-geolocation services (geojs / freeipapi
 * / reallyfreegeoip / ipinfo, raced in parallel) are independent third-party
 * endpoints with independent rate-limit behavior. When one of them pushes back
 * (HTTP 429/403 — typically because many users share a single VPN exit IP and
 * collectively hammer the same endpoint), the right response is to park *that
 * endpoint* for a short while and keep using its siblings — not to halt the
 * whole sync path.
 *
 * This is a small, in-memory, per-key cooldown. State is intentionally not
 * persisted: an MV3 service-worker restart clears it, which is harmless — a
 * cooldown is only an optimization to avoid re-hitting a known-throttled
 * endpoint, so losing it just costs at most one wasted request.
 */

import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/**
 * Default cooldown window applied to an endpoint after it rate-limits us.
 * Short by design: these are transient throttles, and the failover/race across
 * sibling endpoints already absorbs a single endpoint being unavailable.
 */
export const ENDPOINT_COOLDOWN_MS = 60 * 1000; // 1 minute

/**
 * Heuristic: does this error/result message look like the endpoint is
 * rate-limiting or blocking us? Matches a standalone 429 or 403 status. Shared
 * by the cooldown call sites and the resync gate's circuit breaker so the
 * "are we being throttled?" decision is made one way everywhere.
 */
export function looksRateLimited(message: string): boolean {
  return /\b429\b|\b403\b/.test(message);
}

/**
 * Tracks a short cooldown per endpoint key. Thread-free, synchronous, and
 * lazily self-expiring (an entry is dropped the first time it's read past its
 * deadline, so the map can't grow unbounded for endpoints that recover).
 */
export class EndpointCooldown {
  private readonly cooldowns = new Map<string, number>();

  constructor(
    private readonly durationMs: number = ENDPOINT_COOLDOWN_MS,
    private readonly label = "ENDPOINT"
  ) {}

  /** Park `key` for the cooldown window. */
  markCoolingDown(key: string): void {
    this.cooldowns.set(key, Date.now() + this.durationMs);
    logger.debug(`[${this.label}] ${key} cooling down for ${this.durationMs / 1000}s`);
  }

  /** True while `key` is still within its cooldown window. */
  isCoolingDown(key: string): boolean {
    const until = this.cooldowns.get(key);
    if (until === undefined) return false;
    if (Date.now() >= until) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Return the subset of `items` whose key is not currently cooling down,
   * preserving input order. If *every* item is cooling down, returns the full
   * list unchanged — a degraded-but-alive fallback so the caller never ends up
   * with nothing to try (better to hit a throttled endpoint than to fail the
   * sync outright).
   */
  filterAvailable<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
    const available = items.filter((item) => !this.isCoolingDown(keyOf(item)));
    if (available.length === 0) {
      logger.debug(`[${this.label}] all endpoints cooling down; trying all anyway`);
      return [...items];
    }
    return available;
  }

  /** Clear all cooldowns (e.g. on a user-initiated manual sync). */
  clear(): void {
    this.cooldowns.clear();
  }
}
