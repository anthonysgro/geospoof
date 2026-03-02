/**
 * Spoofed geolocation coordinates matching the W3C GeolocationCoordinates interface.
 * Fields not provided by spoofing (altitude, heading, speed) are always null.
 */
export interface SpoofedGeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: null;
  altitudeAccuracy: null;
  heading: null;
  speed: null;
}

/**
 * Spoofed geolocation position matching the W3C GeolocationPosition interface.
 */
export interface SpoofedGeolocationPosition {
  coords: SpoofedGeolocationCoordinates;
  timestamp: number;
}

/**
 * Callback invoked with a spoofed position.
 */
export type PositionCallback = (position: SpoofedGeolocationPosition) => void;

/**
 * Callback invoked when geolocation fails.
 */
export type PositionErrorCallback = (error: GeolocationPositionError) => void;
