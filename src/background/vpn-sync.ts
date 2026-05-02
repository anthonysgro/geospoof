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
const IPWHOIS_URL = "https://ipwho.is/"; // Primary geolocation service (10k/month per client)
const FREEIPAPI_URL = "https://free.freeipapi.com/api/json/"; // Fallback
const REQUEST_TIMEOUT = 10000; // 10 seconds (IP detection)
const GEO_REQUEST_TIMEOUT = 5000; // 5 seconds per geolocation attempt
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between API calls

// --- Types ---
export interface IpGeolocationResult {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  ip: string;
}

export interface VpnSyncError {
  error: "IP_DETECTION_FAILED" | "GEOLOCATION_FAILED" | "NETWORK";
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

// --- ipwho.is Response Shape (internal) ---
interface IpWhoisResponse {
  ip: string;
  success: boolean;
  type: string;
  continent: string;
  country: string;
  country_code: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  is_eu: boolean;
  postal: string;
  calling_code: string;
  capital: string;
  borders: string;
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
 * Geolocate an IP address to coordinates via FreeIPAPI (HTTPS).
 * @param ip - IPv4 or IPv6 address
 * @throws Error with code GEOLOCATION_FAILED or NETWORK
 */
async function geolocateWithFreeIpApi(ip: string): Promise<IpGeolocationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn("[IP-GEO] Timeout triggered after", GEO_REQUEST_TIMEOUT, "ms");
    controller.abort();
  }, GEO_REQUEST_TIMEOUT);

  const url = `${FREEIPAPI_URL}${ip}`;
  logger.debug("[IP-GEO] Fetching from:", url);

  try {
    const fetchStart = Date.now();
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "GeoSpoof-Extension/1.0",
      },
    });
    logger.debug(
      "[IP-GEO] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      throw Object.assign(err, { code: "GEOLOCATION_FAILED" });
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
    clearTimeout(timeoutId);
    const err = error as Error & { code?: string };
    logger.error("[IP-GEO] Error:", { name: err.name, message: err.message, code: err.code });

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
 * Geolocate an IP address to coordinates via ipwho.is (PRIMARY service).
 * @param ip - IPv4 or IPv6 address
 * @throws Error with code GEOLOCATION_FAILED or NETWORK
 */
async function geolocateWithIpWhois(ip: string): Promise<IpGeolocationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn("[IP-GEO-WHOIS] Timeout triggered after", GEO_REQUEST_TIMEOUT, "ms");
    controller.abort();
  }, GEO_REQUEST_TIMEOUT);

  const url = `${IPWHOIS_URL}${ip}`;
  logger.debug("[IP-GEO-WHOIS] Fetching from:", url);

  try {
    const fetchStart = Date.now();
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "GeoSpoof-Extension/1.0",
      },
    });
    logger.debug(
      "[IP-GEO-WHOIS] Fetch response received in",
      Date.now() - fetchStart,
      "ms, status:",
      response.status
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      throw Object.assign(err, { code: "GEOLOCATION_FAILED" });
    }

    let data: IpWhoisResponse;
    try {
      const jsonStart = Date.now();
      data = (await response.json()) as IpWhoisResponse;
      logger.debug("[IP-GEO-WHOIS] JSON parsed in", Date.now() - jsonStart, "ms");
    } catch {
      throw Object.assign(new Error("Failed to parse geolocation response"), {
        code: "GEOLOCATION_FAILED",
      });
    }

    // ipwho.is returns success: false on error
    if (!data.success) {
      throw Object.assign(new Error("ipwho.is returned unsuccessful response"), {
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
      country: typeof data.country === "string" ? data.country : "",
      ip: data.ip,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error & { code?: string };
    logger.error("[IP-GEO-WHOIS] Error:", { name: err.name, message: err.message, code: err.code });

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

// --- Orchestrator ---

/**
 * Perform a full VPN sync: detect public IP, geolocate it, return result.
 * Uses ipwho.is as primary geolocation service, freeipapi as fallback.
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
    const ip = await detectPublicIp();
    logger.info("[VPN-SYNC] IP detection completed in", Date.now() - ipStart, "ms, IP:", ip);

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await sessionGet<IpGeolocationResult>("ipGeo:" + ip);
      if (cached !== undefined) {
        logger.debug("[VPN-SYNC] Cache hit, total time:", Date.now() - syncStart, "ms");
        return cached;
      }
    }

    const geoStart = Date.now();
    logger.info("[VPN-SYNC] Geolocating IP:", ip);
    let result: IpGeolocationResult | undefined;

    // Try ipwho.is first (primary)
    try {
      logger.info("[VPN-SYNC] Trying ipwho.is (primary)...");
      result = await geolocateWithIpWhois(ip);
      logger.info("[VPN-SYNC] ipwho.is succeeded in", Date.now() - geoStart, "ms");
    } catch (primaryErr) {
      const err = primaryErr as Error & { code?: string };
      logger.warn("[VPN-SYNC] ipwho.is failed:", err.message, "— trying freeipapi fallback...");

      // Fallback to freeipapi
      try {
        const fallbackStart = Date.now();
        result = await geolocateWithFreeIpApi(ip);
        logger.info("[VPN-SYNC] freeipapi fallback succeeded in", Date.now() - fallbackStart, "ms");
      } catch (fallbackErr) {
        const fbErr = fallbackErr as Error & { code?: string };
        logger.error("[VPN-SYNC] freeipapi fallback also failed:", fbErr.message);
        // Throw the fallback error (more recent)
        throw fallbackErr;
      }
    }

    logger.info("[VPN-SYNC] Geolocation completed in", Date.now() - geoStart, "ms");
    logger.debug("[VPN-SYNC] Geolocation result:", result);

    // Cache the result
    await sessionSet("ipGeo:" + ip, result);

    logger.info("[VPN-SYNC] Total sync time:", Date.now() - syncStart, "ms");
    return result;
  } catch (error) {
    const err = error as Error & { code?: string };
    const errorCode =
      err.code === "IP_DETECTION_FAILED"
        ? "IP_DETECTION_FAILED"
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
}

// Exported for testing
export { MIN_REQUEST_INTERVAL, REQUEST_TIMEOUT, GEO_REQUEST_TIMEOUT };

/**
 * Reset the rate limiter timestamp (for testing).
 */
export async function resetRateLimiter(): Promise<void> {
  await sessionDelete("vpnRateLimit");
}
