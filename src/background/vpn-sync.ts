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
const FREEIPAPI_URL = "https://free.freeipapi.com/api/json/";
const REQUEST_TIMEOUT = 5000; // 5 seconds
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

// --- Rate Limiting ---

async function throttle(): Promise<void> {
  const lastRequestTime = (await sessionGet<number>("vpnRateLimit")) ?? 0;
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
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
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    logger.debug("Detecting public IP via:", PUBLIC_IP_URL);
    const response = await fetch(PUBLIC_IP_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { ip?: string };
    const ip = data.ip;

    if (!ip || !isValidIpAddress(ip)) {
      throw new Error("Invalid IP address in response");
    }

    logger.debug("Public IP detected:", ip);
    return ip;
  } catch (error) {
    clearTimeout(timeoutId);
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "IP detection request timed out"
        : error instanceof Error
          ? error.message
          : "Unknown error during IP detection";
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
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${FREEIPAPI_URL}${ip}`, {
      signal: controller.signal,
      headers: { "User-Agent": "GeoSpoof-Extension/1.0" },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      throw Object.assign(err, { code: "GEOLOCATION_FAILED" });
    }

    let data: FreeIpApiResponse;
    try {
      data = (await response.json()) as FreeIpApiResponse;
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
 * @param forceRefresh - bypass cache (used by Re-sync button)
 */
export async function syncVpnLocation(forceRefresh: boolean): Promise<VpnSyncResponse> {
  try {
    await throttle();

    const ip = await detectPublicIp();

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await sessionGet<IpGeolocationResult>("ipGeo:" + ip);
      if (cached !== undefined) {
        logger.debug("VPN sync cache hit:", { ip, result: cached });
        return cached;
      }
    }

    logger.debug("Geolocating IP:", ip);
    const result = await geolocateWithFreeIpApi(ip);
    logger.debug("IP geolocation result:", result);

    // Cache the result
    await sessionSet("ipGeo:" + ip, result);

    return result;
  } catch (error) {
    const err = error as Error & { code?: string };
    const errorCode =
      err.code === "IP_DETECTION_FAILED"
        ? "IP_DETECTION_FAILED"
        : err.code === "GEOLOCATION_FAILED"
          ? "GEOLOCATION_FAILED"
          : "NETWORK";

    logger.error("VPN sync error:", { errorCode, message: err.message });
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
export { MIN_REQUEST_INTERVAL, REQUEST_TIMEOUT };

/**
 * Reset the rate limiter timestamp (for testing).
 */
export async function resetRateLimiter(): Promise<void> {
  await sessionDelete("vpnRateLimit");
}
