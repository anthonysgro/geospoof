/**
 * Shared type definitions for the injected script modules.
 * This module contains only type definitions and interfaces — no runtime code.
 */

import type { AccuracySetting } from "@/shared/types/settings";

export interface SpoofedLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  /**
   * How the spoofed `accuracy` value should be produced. When absent the
   * Resolver falls back to {@link DEFAULT_ACCURACY_SETTING} (auto mode).
   */
  accuracySetting?: AccuracySetting;
  /**
   * Per-install stable seed used by the Resolver to deterministically derive
   * the accuracy value. When absent it defaults to `0`.
   */
  accuracySeed?: number;
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
