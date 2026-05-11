/**
 * Shared type definitions for the injected script modules.
 * This module contains only type definitions and interfaces — no runtime code.
 */

export interface SpoofedLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface TimezoneData {
  /** IANA timezone identifier */
  identifier: string;
  /** Minutes from UTC */
  offset: number;
  /** DST offset in minutes */
  dstOffset: number;
  /** True if estimated from longitude */
  fallback?: boolean;
}

export interface SettingsEventDetail {
  enabled: boolean;
  location: SpoofedLocation | null;
  timezone: TimezoneData | null;
  debugLogging: boolean;
  verbosityLevel: string;
  /**
   * Content-script-level WebRTC IP-leak protection. When true, the
   * injected script wraps `RTCPeerConnection` so ICE gathering never
   * produces any candidates — closes the srflx leak that Firefox's
   * `disable_non_proxied_udp` pref misses without a proxy, and covers
   * Safari (which doesn't expose browser.privacy at all).
   */
  webrtcProtection: boolean;
  /**
   * Advanced worker protection. When true and running on Firefox, the
   * background script's `webRequest.filterResponseData` listener will
   * prepend the spoofing payload to module-worker and service-worker
   * script responses. The injected script reads this flag to coordinate
   * with the background listener — specifically, to skip module-worker
   * interception on its own end (which would break imports with blob
   * URLs) since the webRequest path handles those cleanly.
   */
  advancedWorkerProtection: boolean;
}

export interface SpoofedGeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: null;
    altitudeAccuracy: null;
    heading: null;
    speed: null;
  };
  timestamp: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;
