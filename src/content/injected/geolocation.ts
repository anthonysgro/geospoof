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
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

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
  logger.debug(
    "getCurrentPosition called — settingsReceived:",
    settingsReceived,
    "spoofingEnabled:",
    spoofingEnabled,
    "hasLocation:",
    !!spoofedLocation
  );

  if (settingsReceived) {
    // Settings already loaded — respond immediately
    if (spoofingEnabled && spoofedLocation) {
      const position = createGeolocationPosition(spoofedLocation);
      const delay = 10 + Math.random() * 40;
      logger.debug("getCurrentPosition: returning spoofed coords", {
        coords: { lat: position.coords.latitude, lon: position.coords.longitude },
        delay: `${delay.toFixed(1)}ms`,
      });
      setTimeout(() => {
        if (successCallback) {
          successCallback(position as GeolocationPosition);
        }
      }, delay);
    } else {
      logger.debug("getCurrentPosition: spoofing disabled, using original");
      originalGetCurrentPosition(successCallback, errorCallback, options);
    }
  } else {
    // Settings not yet received — wait for them before responding
    logger.debug("getCurrentPosition: deferring until settings arrive");
    void waitForSettings().then(({ timedOut }) => {
      if (timedOut) {
        // Settings never arrived within the timeout window. We don't know
        // whether spoofing should be on or off, so we cannot safely fall
        // through to the real API (that would leak the user's real location
        // if spoofing was meant to be active). Fire the error callback instead.
        logger.warn("getCurrentPosition: settings timed out, returning TIMEOUT error");
        if (errorCallback) {
          errorCallback({
            code: GeolocationPositionError.TIMEOUT,
            message: "Settings not received in time",
            PERMISSION_DENIED: GeolocationPositionError.PERMISSION_DENIED,
            POSITION_UNAVAILABLE: GeolocationPositionError.POSITION_UNAVAILABLE,
            TIMEOUT: GeolocationPositionError.TIMEOUT,
          });
        }
        return;
      }
      if (spoofingEnabled && spoofedLocation) {
        const position = createGeolocationPosition(spoofedLocation);
        const delay = 10 + Math.random() * 40;
        logger.debug("getCurrentPosition (deferred): returning spoofed coords", {
          coords: { lat: position.coords.latitude, lon: position.coords.longitude },
          delay: `${delay.toFixed(1)}ms`,
        });
        setTimeout(() => {
          if (successCallback) {
            successCallback(position as GeolocationPosition);
          }
        }, delay);
      } else {
        logger.debug("getCurrentPosition (deferred): spoofing disabled, using original");
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

    logger.debug("watchPosition: returning spoofed coords", {
      watchId,
      coords: { lat: position.coords.latitude, lon: position.coords.longitude },
      delay: `${delay.toFixed(1)}ms`,
    });

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
 * Uses Object.defineProperty with writable:false/configurable:false so that
 * page scripts cannot restore the originals via simple assignment or
 * setInterval loops (the "aggressive window" bypass technique).
 */
export function installGeolocationOverrides(): void {
  registerOverride(getCurrentPositionOverride, "getCurrentPosition");
  disguiseAsNative(getCurrentPositionOverride, "getCurrentPosition", 1);
  Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
    value: getCurrentPositionOverride,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  registerOverride(watchPositionOverride, "watchPosition");
  disguiseAsNative(watchPositionOverride, "watchPosition", 1);
  Object.defineProperty(navigator.geolocation, "watchPosition", {
    value: watchPositionOverride,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  registerOverride(clearWatchOverride, "clearWatch");
  disguiseAsNative(clearWatchOverride, "clearWatch", 1);
  Object.defineProperty(navigator.geolocation, "clearWatch", {
    value: clearWatchOverride,
    writable: false,
    configurable: false,
    enumerable: true,
  });
}
