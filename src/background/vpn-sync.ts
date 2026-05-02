/**
 * VPN Sync Module
 * Detects the user's public IP, geolocates it, and provides coordinates
 * for the VPN exit region. Includes caching and rate limiting.
 */

import { createLogger } from "@/shared/utils/debug-logger";
import { sessionGet, sessionSet, sessionDelete, sessionClearNamespace } from "./session-cache";

const logger = createLogger("BG");

// --- Constants ---
const PUBLIC_IP_URL = "https://api.ipify.org?format=json";
const GEOJS_URL = "https://get.geojs.io/v1/ip/geo/"; // Primary — CORS-friendly, no key, no rate limits
const FREEIPAPI_URL = "https://free.freeipapi.com/api/json/"; // Fallback #1
const REALLYFREEGEOIP_URL = "https://reallyfreegeoip.org/json/"; // Fallback #2
const REQUEST_TIMEOUT = 10000; // 10 seconds (IP detection)
const GEO_TIMEOUT = 5000; // 5 seconds per geo service (all run in parallel, worst case = 5s)
const GEO_MAX_RETRIES = 2; // retry on network failure (e.g. VPN transition)
const GEO_USER_AGENT = "GeoSpoof-Extension/1.0"; // custom UA forces fresh TCP connections
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between API calls

// --- Persistent IP Geo Cache ---

const IP_GEO_CACHE_KEY = "ipGeoCache";
const IP_GEO_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

interface IpGeoCacheEntry {
  result: IpGeolocationResult;
  cachedAt: number;
}

type IpGeoCacheStore = Record<string, IpGeoCacheEntry>;

async function persistentCacheGet(ip: string): Promise<IpGeolocationResult | undefined> {
  try {
    const store = (await browser.storage.local.get(IP_GEO_CACHE_KEY))[IP_GEO_CACHE_KEY] as
      | IpGeoCacheStore
      | undefined;
    if (!store) return undefined;
    const entry = store[ip];
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > IP_GEO_CACHE_TTL) {
      logger.debug("[IP-GEO-CACHE] Entry for", ip, "expired, ignoring");
      return undefined;
    }
    logger.debug("[IP-GEO-CACHE] Persistent cache hit for", ip);
    return entry.result;
  } catch {
    return undefined;
  }
}

async function persistentCacheSet(ip: string, result: IpGeolocationResult): Promise<void> {
  try {
    const existing = (await browser.storage.local.get(IP_GEO_CACHE_KEY))[IP_GEO_CACHE_KEY] as
      | IpGeoCacheStore
      | undefined;
    const store: IpGeoCacheStore = existing ?? {};
    store[ip] = { result, cachedAt: Date.now() };
    await browser.storage.local.set({ [IP_GEO_CACHE_KEY]: store });
    logger.debug("[IP-GEO-CACHE] Persisted geo result for", ip);
  } catch (error) {
    logger.warn("[IP-GEO-CACHE] Failed to persist cache entry:", error);
  }
}

async function persistentCacheClear(): Promise<void> {
  try {
    await browser.storage.local.remove(IP_GEO_CACHE_KEY);
  } catch (error) {
    logger.warn("[IP-GEO-CACHE] Failed to clear persistent cache:", error);
  }
}

// --- Types ---
export interface IpGeolocationResult {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  ip: string;
}

export interface VpnSyncError {
  error: "IP_DETECTION_FAILED" | "GEOLOCATION_FAILED" | "IP_BLOCKED" | "NETWORK";
  message: string;
}

export type VpnSyncResponse = IpGeolocationResult | VpnSyncError;

// --- FreeIPAPI Response Shape (internal) ---
interface FreeIpApiResponse {
  ipVersion: number;
  ipAddress: string;
  latitude: number;
  longitude: number;
  countryName: string;
  countryCode: string;
  cityName: string;
  regionName: string;
  continent: string;
  continentCode: string;
  isProxy: boolean;
}

// --- geojs.io Response Shape (internal) ---
// Note: latitude and longitude are strings (historic API design)
interface GeoJsResponse {
  ip: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
}

// --- reallyfreegeoip.org Response Shape (internal) ---
interface ReallyFreeGeoIpResponse {
  ip: string;
  city: string;
  country_name: string;
  latitude: number;
  longitude: number;
}

// --- Rate Limiting ---

async function throttle(): Promise<void> {
  const lastRequestTime = (await sessionGet<number>("vpnRateLimit")) ?? 0;
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - elapsed;
    logger.debug("[THROTTLE] Waiting", waitTime, "ms (last request was", elapsed, "ms ago)");
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  } else {
    logger.debug("[THROTTLE] No wait needed (last request was", elapsed, "ms ago)");
  }
  await sessionSet("vpnRateLimit", Date.now());
}

// --- IP Validation ---

/**
 * Validate an IP address string (IPv4 or IPv6).
 */
export function isValidIpAddress(ip: string): boolean {
  if (typeof ip !== "string" || ip.length === 0) {
    return false;
  }

  // IPv4: four octets 0-255
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4);
  if (ipv4Match) {
    return ipv4Match.slice(1).every((octet) => {
      const n = parseInt(octet, 10);
      return n >= 0 && n <= 255;
    });
  }

  // IPv6: simplified check for colon-hex groups
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6.test(ip);
}

// --- Public IP Detection ---

/**
 * Detect the user's public IP address via external API.
 * @throws Error with code IP_DETECTION_FAILED
 */
export async function detectPublicIp(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn("[IP-DETECT] Timeout triggered after", REQUEST_TIMEOUT, "ms");
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    logger.debug("[IP-DETECT] Fetching from:", PUBLIC_IP_URL);
    const fetchStart = Date.now();
    const response = await fetch(PUBLIC_IP_URL, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Connection: "close" },
    });
    logger.debug(
      "[IP-DETECT] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const jsonStart = Date.now();
    const data = (await response.json()) as { ip?: string };
    logger.debug("[IP-DETECT] JSON parsed in", Date.now() - jsonStart, "ms");
    const ip = data.ip;

    if (!ip || !isValidIpAddress(ip)) {
      throw new Error("Invalid IP address in response");
    }

    logger.debug("[IP-DETECT] Public IP detected:", ip);
    return ip;
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[IP-DETECT] Error:", { name: err.name, message: err.message });
    const message =
      err.name === "AbortError"
        ? "IP detection request timed out"
        : err.message || "Unknown error during IP detection";
    throw Object.assign(new Error(message), { code: "IP_DETECTION_FAILED" });
  }
}

// --- IP Geolocation ---

/**
 * Fetch a geo service URL with custom User-Agent, timeout, and exponential backoff retry.
 * Custom User-Agent forces a fresh TCP connection (bypasses stale connection pool after VPN switch).
 */
async function fetchGeoWithRetry(url: string, timeoutMs: number): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= GEO_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { "User-Agent": GEO_USER_AGENT },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      // Don't retry on abort (our own timeout) — only on network errors
      if (lastError.name === "AbortError" || attempt === GEO_MAX_RETRIES) {
        throw lastError;
      }
      const delay = 1000 * (attempt + 1);
      logger.debug(
        "[GEO-FETCH] Attempt",
        attempt + 1,
        "failed, retrying in",
        delay,
        "ms:",
        lastError.message
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error("Fetch failed");
}

/**
 * Geolocate an IP address to coordinates via FreeIPAPI (HTTPS).
 * @param ip - IPv4 or IPv6 address
 * @throws Error with code GEOLOCATION_FAILED or NETWORK
 */
async function geolocateWithFreeIpApi(ip: string): Promise<IpGeolocationResult> {
  const url = `${FREEIPAPI_URL}${ip}`;
  logger.debug("[IP-GEO] Fetching from:", url);

  try {
    const fetchStart = Date.now();
    const response = await fetchGeoWithRetry(url, GEO_TIMEOUT);
    logger.debug(
      "[IP-GEO] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );

    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), {
        code: "GEOLOCATION_FAILED",
        blocked: response.status === 403,
      });
    }

    let data: FreeIpApiResponse;
    try {
      const jsonStart = Date.now();
      data = (await response.json()) as FreeIpApiResponse;
      logger.debug("[IP-GEO] JSON parsed in", Date.now() - jsonStart, "ms");
    } catch {
      throw Object.assign(new Error("Failed to parse geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    if (!data.ipAddress || !isValidIpAddress(data.ipAddress)) {
      throw Object.assign(new Error("Invalid IP address in geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    const { latitude, longitude } = data;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw Object.assign(new Error("Invalid coordinates from geolocation service"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    return {
      latitude,
      longitude,
      city: typeof data.cityName === "string" ? data.cityName : "",
      country: typeof data.countryName === "string" ? data.countryName : "",
      ip: data.ipAddress,
    };
  } catch (error) {
    const err = error as Error & { code?: string; blocked?: boolean };
    logger.error("[IP-GEO] Error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      blocked: err.blocked,
    });

    if (err.code === "GEOLOCATION_FAILED") {
      throw err;
    }

    if (err.name === "AbortError") {
      throw Object.assign(new Error("Geolocation request timed out"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    throw Object.assign(new Error(err.message || "Network error during geolocation"), {
      code: "NETWORK",
    });
  }
}

/**
 * Geolocate an IP address to coordinates via geojs.io (PRIMARY service).
 * CORS-friendly, no API key, no rate limits.
 * Note: lat/lng returned as strings.
 * @param ip - IPv4 or IPv6 address
 * @throws Error with code GEOLOCATION_FAILED or NETWORK
 */
async function geolocateWithGeoJs(ip: string): Promise<IpGeolocationResult> {
  const url = `${GEOJS_URL}${ip}.json`;
  logger.debug("[IP-GEO-GEOJS] Fetching from:", url);

  try {
    const fetchStart = Date.now();
    const response = await fetchGeoWithRetry(url, GEO_TIMEOUT);
    logger.debug(
      "[IP-GEO-GEOJS] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );

    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), {
        code: "GEOLOCATION_FAILED",
        blocked: response.status === 403,
      });
    }

    let data: GeoJsResponse;
    try {
      data = (await response.json()) as GeoJsResponse;
    } catch {
      throw Object.assign(new Error("Failed to parse geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    if (!data.ip || !isValidIpAddress(data.ip)) {
      throw Object.assign(new Error("Invalid IP address in geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    // geojs returns lat/lng as strings
    const latitude = parseFloat(data.latitude);
    const longitude = parseFloat(data.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw Object.assign(new Error("Invalid coordinates from geolocation service"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    return {
      latitude,
      longitude,
      city: typeof data.city === "string" ? data.city : "",
      country: typeof data.country === "string" ? data.country : "",
      ip: data.ip,
    };
  } catch (error) {
    const err = error as Error & { code?: string; blocked?: boolean };
    logger.error("[IP-GEO-GEOJS] Error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      blocked: err.blocked,
    });

    if (err.code === "GEOLOCATION_FAILED") throw err;
    if (err.name === "AbortError") {
      throw Object.assign(new Error("Geolocation request timed out"), {
        code: "GEOLOCATION_FAILED",
      });
    }
    throw Object.assign(new Error(err.message || "Network error during geolocation"), {
      code: "NETWORK",
    });
  }
}

/**
 * Geolocate an IP address via reallyfreegeoip.org (Fallback #2).
 * No API key, no rate limits, HTTPS.
 */
async function geolocateWithReallyFreeGeoIp(ip: string): Promise<IpGeolocationResult> {
  const url = `${REALLYFREEGEOIP_URL}${ip}`;
  logger.debug("[IP-GEO-RFGI] Fetching from:", url);

  try {
    const fetchStart = Date.now();
    const response = await fetchGeoWithRetry(url, GEO_TIMEOUT);
    logger.debug(
      "[IP-GEO-RFGI] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );

    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), {
        code: "GEOLOCATION_FAILED",
        blocked: response.status === 403,
      });
    }

    let data: ReallyFreeGeoIpResponse;
    try {
      data = (await response.json()) as ReallyFreeGeoIpResponse;
    } catch {
      throw Object.assign(new Error("Failed to parse geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    if (!data.ip || !isValidIpAddress(data.ip)) {
      throw Object.assign(new Error("Invalid IP address in geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    const { latitude, longitude } = data;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw Object.assign(new Error("Invalid coordinates from geolocation service"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    return {
      latitude,
      longitude,
      city: typeof data.city === "string" ? data.city : "",
      country: typeof data.country_name === "string" ? data.country_name : "",
      ip: data.ip,
    };
  } catch (error) {
    const err = error as Error & { code?: string; blocked?: boolean };
    logger.error("[IP-GEO-RFGI] Error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      blocked: err.blocked,
    });

    if (err.code === "GEOLOCATION_FAILED") throw err;
    if (err.name === "AbortError") {
      throw Object.assign(new Error("Geolocation request timed out"), {
        code: "GEOLOCATION_FAILED",
      });
    }
    throw Object.assign(new Error(err.message || "Network error during geolocation"), {
      code: "NETWORK",
    });
  }
}

// --- Orchestrator ---

/**
 * Perform a full VPN sync: detect public IP, geolocate it, return result.
 * Runs geojs.io, freeipapi, and reallyfreegeoip in parallel — first success wins.
 * @param forceRefresh - bypass cache (used by Re-sync button)
 */
export async function syncVpnLocation(forceRefresh: boolean): Promise<VpnSyncResponse> {
  const syncStart = Date.now();
  logger.info("[VPN-SYNC] Starting sync, forceRefresh:", forceRefresh);

  try {
    const throttleStart = Date.now();
    await throttle();
    logger.debug("[VPN-SYNC] Throttle completed in", Date.now() - throttleStart, "ms");

    const ipStart = Date.now();
    logger.info("[VPN-SYNC] Detecting public IP...");
    let ip: string;
    try {
      ip = await detectPublicIp();
    } catch (ipErr) {
      // IP detection can fail instantly right after a VPN location switch (kill switch window).
      // Retry once after a short delay before giving up.
      const err = ipErr as Error & { code?: string };
      if (err.code === "IP_DETECTION_FAILED") {
        logger.warn(
          "[VPN-SYNC] IP detection failed, retrying in 2s (VPN may still be switching)..."
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        ip = await detectPublicIp(); // let this throw naturally if it fails again
      } else {
        throw ipErr;
      }
    }
    logger.info("[VPN-SYNC] IP detection completed in", Date.now() - ipStart, "ms, IP:", ip);

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await sessionGet<IpGeolocationResult>("ipGeo:" + ip);
      if (cached !== undefined) {
        logger.debug("[VPN-SYNC] Session cache hit, total time:", Date.now() - syncStart, "ms");
        return cached;
      }
      const persistent = await persistentCacheGet(ip);
      if (persistent !== undefined) {
        // Warm the session cache so subsequent lookups are instant
        await sessionSet("ipGeo:" + ip, persistent);
        logger.debug("[VPN-SYNC] Persistent cache hit, total time:", Date.now() - syncStart, "ms");
        return persistent;
      }
    }

    const geoStart = Date.now();
    logger.info("[VPN-SYNC] Geolocating IP:", ip, "(running all 3 services in parallel)");

    let result: IpGeolocationResult;
    try {
      result = await Promise.any([
        geolocateWithGeoJs(ip),
        geolocateWithFreeIpApi(ip),
        geolocateWithReallyFreeGeoIp(ip),
      ]);
    } catch (aggregateErr) {
      // All three failed — AggregateError contains each individual error
      const errors: Array<Error & { blocked?: boolean }> =
        aggregateErr instanceof AggregateError
          ? (aggregateErr.errors as Array<Error & { blocked?: boolean }>)
          : [];

      logger.error(
        "[VPN-SYNC] All geo services failed:",
        errors.map((e) => e.message)
      );

      // If any service got a real HTTP response (even a 403), the network is fine
      // but this IP is being rejected — tell the user to switch VPN location
      const anyServiceResponded = errors.some(
        (e) => e.blocked === true || (e.name !== "AbortError" && e.message !== "Failed to fetch")
      );

      if (anyServiceResponded) {
        throw Object.assign(
          new Error(
            "Could not detect your VPN location. Your browser may still be reconnecting — wait a moment and try again."
          ),
          { code: "IP_BLOCKED" }
        );
      }

      // All timed out — network/VPN issue
      throw Object.assign(
        new Error(
          "Could not detect your VPN location. Your browser may still be reconnecting — wait a moment and try again."
        ),
        { code: "GEOLOCATION_FAILED" }
      );
    }

    logger.info("[VPN-SYNC] Geolocation completed in", Date.now() - geoStart, "ms");
    logger.debug("[VPN-SYNC] Geolocation result:", result);

    // Cache the result in both session and persistent storage
    await sessionSet("ipGeo:" + ip, result);
    await persistentCacheSet(ip, result);

    logger.info("[VPN-SYNC] Total sync time:", Date.now() - syncStart, "ms");
    return result;
  } catch (error) {
    const err = error as Error & { code?: string };
    const errorCode =
      err.code === "IP_DETECTION_FAILED"
        ? "IP_DETECTION_FAILED"
        : err.code === "IP_BLOCKED"
          ? "IP_BLOCKED"
          : err.code === "GEOLOCATION_FAILED"
            ? "GEOLOCATION_FAILED"
            : "NETWORK";

    logger.error("[VPN-SYNC] Error after", Date.now() - syncStart, "ms:", {
      errorCode,
      message: err.message,
      name: err.name,
    });
    return {
      error: errorCode,
      message: err.message || "A network error occurred. Please try again.",
    };
  }
}

/**
 * Clear the IP geolocation cache (called when user disables sync mode).
 */
export async function clearIpGeoCache(): Promise<void> {
  await sessionClearNamespace("ipGeo");
  await persistentCacheClear();
}

// Exported for testing
export { MIN_REQUEST_INTERVAL, REQUEST_TIMEOUT, GEO_TIMEOUT };

/**
 * Reset the rate limiter timestamp (for testing).
 */
export async function resetRateLimiter(): Promise<void> {
  await sessionDelete("vpnRateLimit");
}
