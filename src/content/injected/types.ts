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
