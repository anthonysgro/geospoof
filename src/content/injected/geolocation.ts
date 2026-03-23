/**
 * Geolocation API overrides.
 *
 * Overrides `getCurrentPosition`, `watchPosition`, and `clearWatch` to
 * return the spoofed location when protection is enabled.
 */

import type { SpoofedLocation, SpoofedGeolocationPosition } from "./types";
import {
  spoofingEnabled,
  spoofedLocation,
  settingsReceived,
  originalGetCurrentPosition,
  originalWatchPosition,
  originalClearWatch,
} from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { waitForSettings } from "./settings-listener";

const watchCallbacks = new Map<number, PositionCallback>();
let watchIdCounter = 1;

/** Create a W3C-compliant GeolocationPosition from spoofed location. */
function createGeolocationPosition(location: SpoofedLocation): SpoofedGeolocationPosition {
  return {
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

/** Override for `navigator.geolocation.getCurrentPosition`. */
const getCurrentPositionOverride = (
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback | null,
  options?: PositionOptions
): void => {
  console.log(
    "[GeoSpoof Injected] getCurrentPosition called. Enabled:",
    spoofingEnabled,
    "Location:",
    spoofedLocation,
    "Settings received:",
    settingsReceived
  );

  if (settingsReceived) {
    // Settings already loaded — respond immediately
    if (spoofingEnabled && spoofedLocation) {
      const position = createGeolocationPosition(spoofedLocation);
      console.log("[GeoSpoof Injected] Returning spoofed position:", position);
      const delay = 10 + Math.random() * 40;
      setTimeout(() => {
        if (successCallback) {
          successCallback(position as GeolocationPosition);
        }
      }, delay);
    } else {
      console.log("[GeoSpoof Injected] Using original geolocation");
      originalGetCurrentPosition(successCallback, errorCallback, options);
    }
  } else {
    // Settings not yet received — wait for them before responding
    console.log("[GeoSpoof Injected] Deferring getCurrentPosition until settings arrive");
    void waitForSettings().then(() => {
      if (spoofingEnabled && spoofedLocation) {
        const position = createGeolocationPosition(spoofedLocation);
        console.log("[GeoSpoof Injected] Deferred: returning spoofed position:", position);
        const delay = 10 + Math.random() * 40;
        setTimeout(() => {
          if (successCallback) {
            successCallback(position as GeolocationPosition);
          }
        }, delay);
      } else {
        console.log("[GeoSpoof Injected] Deferred: using original geolocation");
        originalGetCurrentPosition(successCallback, errorCallback, options);
      }
    });
  }
};

/** Override for `navigator.geolocation.watchPosition`. */
const watchPositionOverride = (
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback | null,
  options?: PositionOptions
): number => {
  if (spoofingEnabled && spoofedLocation) {
    const watchId = watchIdCounter++;
    watchCallbacks.set(watchId, successCallback);

    const position = createGeolocationPosition(spoofedLocation);
    const delay = 10 + Math.random() * 40;

    setTimeout(() => {
      if (successCallback) {
        successCallback(position as GeolocationPosition);
      }
    }, delay);

    return watchId;
  } else {
    return originalWatchPosition(successCallback, errorCallback, options);
  }
};

/** Override for `navigator.geolocation.clearWatch`. */
const clearWatchOverride = (watchId: number): void => {
  if (spoofingEnabled) {
    watchCallbacks.delete(watchId);
  } else {
    originalClearWatch(watchId);
  }
};

/**
 * Install geolocation API overrides on `navigator.geolocation`.
 *
 * Overrides `getCurrentPosition`, `watchPosition`, and `clearWatch`.
 */
export function installGeolocationOverrides(): void {
  registerOverride(getCurrentPositionOverride, "getCurrentPosition");
  disguiseAsNative(getCurrentPositionOverride, "getCurrentPosition", 1);
  navigator.geolocation.getCurrentPosition = getCurrentPositionOverride;

  registerOverride(watchPositionOverride, "watchPosition");
  disguiseAsNative(watchPositionOverride, "watchPosition", 1);
  navigator.geolocation.watchPosition = watchPositionOverride;

  registerOverride(clearWatchOverride, "clearWatch");
  disguiseAsNative(clearWatchOverride, "clearWatch", 1);
  navigator.geolocation.clearWatch = clearWatchOverride;
}
