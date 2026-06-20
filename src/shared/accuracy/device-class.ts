/**
 * Runtime device-class detection for the accuracy Resolver.
 *
 * The accuracy a real device reports correlates with how it positions itself:
 * a desktop on Wi-Fi / cell-tower triangulation lands in the tens-of-metres
 * range, while a mobile GPS fix is single-digit metres. To keep the spoofed
 * `GeolocationCoordinates.accuracy` plausible we map the running device to a
 * `DeviceClass` and resolve within that class's Band.
 *
 * Detection is page-side and best-effort (Requirement 2.3): it prefers the
 * structured `navigator.userAgentData.mobile` hint when present, falls back to
 * a user-agent regex combined with `maxTouchPoints`, and defaults to
 * `desktop` whenever the signals are missing or ambiguous (Requirement 2.4).
 */

export type DeviceClass = "desktop" | "mobile";

/**
 * Per-class accuracy Bands in metres.
 *
 * - desktop: Wi-Fi / MLS triangulation grade (~35–100m)
 * - mobile: GPS grade (~5–15m)
 */
export const BANDS: Record<DeviceClass, { min: number; max: number }> = {
  desktop: { min: 35, max: 100 },
  mobile: { min: 5, max: 15 },
};

/**
 * `navigator.userAgentData` is not part of the standard TS DOM lib. Narrow it
 * locally so we can read the `mobile` hint without resorting to `any`.
 */
interface UserAgentDataLike {
  mobile?: boolean;
}

/** Common mobile markers in a user-agent string. */
const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry/i;

/**
 * Detect the current Device_Class from page-side signals.
 *
 * Detection order:
 *  1. `navigator.userAgentData.mobile` (a boolean) when `userAgentData` exists.
 *  2. A user-agent regex match combined with `maxTouchPoints > 0`.
 *  3. Default to `"desktop"` when nothing is conclusive.
 *
 * Defensive against missing `navigator`, absent properties, and non-browser
 * contexts: any failure path resolves to `"desktop"` (Requirement 2.4).
 *
 * @param nav Optional Navigator to inspect; defaults to the global `navigator`.
 */
export function detectDeviceClass(nav?: Navigator): DeviceClass {
  try {
    const navigatorRef = nav ?? (globalThis as { navigator?: Navigator }).navigator ?? undefined;

    if (navigatorRef == null) {
      return "desktop";
    }

    // 1. Prefer the structured client-hint when available.
    const uaData = (navigatorRef as Navigator & { userAgentData?: UserAgentDataLike })
      .userAgentData;
    if (uaData != null && typeof uaData.mobile === "boolean") {
      return uaData.mobile ? "mobile" : "desktop";
    }

    // 2. Fall back to a UA regex backed by a touch-capability signal.
    const ua = typeof navigatorRef.userAgent === "string" ? navigatorRef.userAgent : "";
    const touchPoints =
      typeof navigatorRef.maxTouchPoints === "number" ? navigatorRef.maxTouchPoints : 0;

    if (MOBILE_UA_PATTERN.test(ua) && touchPoints > 0) {
      return "mobile";
    }

    // 3. Unknown / ambiguous → desktop.
    return "desktop";
  } catch {
    return "desktop";
  }
}
