/**
 * Test Helper for Content Script
 * Provides utilities to test content script in isolated environment
 */
import { vi } from "vitest";
import type { Location, Timezone } from "../../src/shared/types/settings";
import type {
  SpoofedGeolocationPosition,
  PositionCallback,
  PositionErrorCallback,
} from "../../src/shared/types/location";

/** Input settings for setupContentScript */
interface ContentScriptSettings {
  enabled?: boolean;
  location?: Location | null;
  timezone?: Timezone | null;
}

/** Partial settings update for updateSettings */
interface SettingsUpdate {
  enabled?: boolean;
  location?: Location | null;
  timezone?: Timezone | null;
}

/** Return type of setupContentScript */
export interface ContentScriptTestInterface {
  navigator: {
    geolocation: {
      getCurrentPosition: (
        successCallback: PositionCallback,
        errorCallback?: PositionErrorCallback,
        options?: PositionOptions
      ) => void;
      watchPosition: (
        successCallback: PositionCallback,
        errorCallback?: PositionErrorCallback,
        options?: PositionOptions
      ) => number;
      clearWatch: (watchId: number) => void;
    };
  };
  Date: {
    prototype: {
      getTimezoneOffset: () => number;
      toString: () => string;
      toTimeString: () => string;
      toLocaleString: (locales?: string | string[], options?: Intl.DateTimeFormatOptions) => string;
      toLocaleDateString: (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ) => string;
      toLocaleTimeString: (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ) => string;
    };
  };
  Intl: {
    DateTimeFormat: (
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) => Intl.DateTimeFormat;
  };
  updateSettings: (newSettings: SettingsUpdate) => void;
  getWatchCallbacks: () => Map<number, PositionCallback>;
  originals: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
    getTimezoneOffset: typeof Date.prototype.getTimezoneOffset;
    DateTimeFormat: typeof Intl.DateTimeFormat;
    toString: typeof Date.prototype.toString;
    toTimeString: typeof Date.prototype.toTimeString;
    toLocaleString: typeof Date.prototype.toLocaleString;
    toLocaleDateString: typeof Date.prototype.toLocaleDateString;
    toLocaleTimeString: typeof Date.prototype.toLocaleTimeString;
  };
}

/**
 * Setup content script with given settings.
 * Returns an object with overridden APIs for testing.
 */
function setupContentScript(settings: ContentScriptSettings): ContentScriptTestInterface {
  // Store original methods
  const originalGetCurrentPosition = vi.fn(
    (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => {
      setTimeout(() => {
        success({
          coords: {
            latitude: 0,
            longitude: 0,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }, 10);
    }
  );

  const originalWatchPosition = vi.fn(
    (
      success: PositionCallback,
      _error?: PositionErrorCallback,
      _options?: PositionOptions
    ): number => {
      setTimeout(() => {
        success({
          coords: {
            latitude: 0,
            longitude: 0,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }, 10);
      return 1;
    }
  );

  const originalClearWatch = vi.fn();
  // Store prototype method references via index access to avoid unbound-method lint errors.
  // These are always invoked via .call(dateInstance) with the correct receiver.
  const dateProto = Date.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const originalGetTimezoneOffset = dateProto["getTimezoneOffset"] as (this: Date) => number;
  const originalToString = dateProto["toString"] as (this: Date) => string;
  const originalToTimeString = dateProto["toTimeString"] as (this: Date) => string;
  const originalToLocaleString = dateProto["toLocaleString"] as (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ) => string;
  const originalToLocaleDateString = dateProto["toLocaleDateString"] as (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ) => string;
  const originalToLocaleTimeString = dateProto["toLocaleTimeString"] as (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ) => string;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  // Settings
  let spoofingEnabled = settings.enabled || false;
  let spoofedLocation: Location | null = settings.location || null;
  let timezoneOverride: Timezone | null = settings.timezone || null;

  // Validate timezone data
  function validateTimezoneData(tz: Timezone | null): boolean {
    if (!tz) {
      return false;
    }

    if (typeof tz.identifier !== "string" || tz.identifier.length === 0) {
      return false;
    }

    if (typeof tz.offset !== "number" || !Number.isFinite(tz.offset)) {
      return false;
    }

    if (typeof tz.dstOffset !== "number" || !Number.isFinite(tz.dstOffset)) {
      return false;
    }

    return true;
  }

  // Validate initial timezone
  if (timezoneOverride && !validateTimezoneData(timezoneOverride)) {
    timezoneOverride = null;
  }

  // Watch callbacks storage
  const watchCallbacks = new Map<number, PositionCallback>();
  let watchIdCounter = 1;

  // Create GeolocationPosition object
  function createGeolocationPosition(location: Location): SpoofedGeolocationPosition {
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

  // Override getCurrentPosition
  const getCurrentPosition = function (
    this: Geolocation,
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback,
    options?: PositionOptions
  ): void {
    if (spoofingEnabled && spoofedLocation) {
      const position = createGeolocationPosition(spoofedLocation);
      const delay = 10 + Math.random() * 40;
      setTimeout(() => {
        if (successCallback) {
          successCallback(position);
        }
      }, delay);
    } else {
      originalGetCurrentPosition.call(this, successCallback, errorCallback, options);
    }
  };

  // Override watchPosition
  const watchPosition = function (
    this: Geolocation,
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback,
    options?: PositionOptions
  ): number {
    if (spoofingEnabled && spoofedLocation) {
      const watchId = watchIdCounter++;
      watchCallbacks.set(watchId, successCallback);

      const position = createGeolocationPosition(spoofedLocation);
      const delay = 10 + Math.random() * 40;

      setTimeout(() => {
        if (successCallback) {
          successCallback(position);
        }
      }, delay);

      return watchId;
    } else {
      return originalWatchPosition.call(this, successCallback, errorCallback, options);
    }
  };

  // Override clearWatch
  const clearWatch = function (this: Geolocation, watchId: number): void {
    if (spoofingEnabled) {
      watchCallbacks.delete(watchId);
    } else {
      originalClearWatch.call(this, watchId);
    }
  };

  // Override getTimezoneOffset
  const getTimezoneOffset = function (this: Date): number {
    if (spoofingEnabled && timezoneOverride) {
      return -timezoneOverride.offset;
    }
    return originalGetTimezoneOffset.call(this);
  };

  // Override DateTimeFormat
  const DateTimeFormat = function (
    ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
  ): Intl.DateTimeFormat {
    const instance = new OriginalDateTimeFormat(...args);

    if (spoofingEnabled && timezoneOverride) {
      const boundResolvedOptions = instance.resolvedOptions.bind(instance);
      instance.resolvedOptions = function (): Intl.ResolvedDateTimeFormatOptions {
        const resolvedOpts = boundResolvedOptions();
        resolvedOpts.timeZone = timezoneOverride!.identifier;
        return resolvedOpts;
      };
    }

    return instance;
  };

  // Override Date formatting methods
  const toString = function (this: Date): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezoneOverride.identifier,
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        return formatter.format(this);
      } catch {
        return originalToString.call(this);
      }
    }
    return originalToString.call(this);
  };

  const toTimeString = function (this: Date): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezoneOverride.identifier,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        return formatter.format(this);
      } catch {
        return originalToTimeString.call(this);
      }
    }
    return originalToTimeString.call(this);
  };

  const toLocaleString = function (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleString.call(this, locales, opts);
      } catch {
        return originalToLocaleString.call(this, locales, options);
      }
    }
    return originalToLocaleString.call(this, locales, options);
  };

  const toLocaleDateString = function (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleDateString.call(this, locales, opts);
      } catch {
        return originalToLocaleDateString.call(this, locales, options);
      }
    }
    return originalToLocaleDateString.call(this, locales, options);
  };

  const toLocaleTimeString = function (
    this: Date,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleTimeString.call(this, locales, opts);
      } catch {
        return originalToLocaleTimeString.call(this, locales, options);
      }
    }
    return originalToLocaleTimeString.call(this, locales, options);
  };

  // Return test interface
  return {
    navigator: {
      geolocation: {
        getCurrentPosition,
        watchPosition,
        clearWatch,
      },
    },
    Date: {
      prototype: {
        getTimezoneOffset,
        toString,
        toTimeString,
        toLocaleString,
        toLocaleDateString,
        toLocaleTimeString,
      },
    },
    Intl: {
      DateTimeFormat,
    },
    updateSettings: (newSettings: SettingsUpdate): void => {
      spoofingEnabled = newSettings.enabled !== undefined ? newSettings.enabled : spoofingEnabled;
      spoofedLocation = newSettings.location !== undefined ? newSettings.location : spoofedLocation;

      if (newSettings.timezone !== undefined) {
        if (newSettings.timezone && validateTimezoneData(newSettings.timezone)) {
          timezoneOverride = newSettings.timezone;
        } else {
          timezoneOverride = null;
        }
      }
    },
    getWatchCallbacks: () => watchCallbacks,

    originals: {
      getCurrentPosition: originalGetCurrentPosition,
      watchPosition: originalWatchPosition,
      clearWatch: originalClearWatch,
      getTimezoneOffset: originalGetTimezoneOffset,
      DateTimeFormat: OriginalDateTimeFormat,
      toString: originalToString,
      toTimeString: originalToTimeString,
      toLocaleString: originalToLocaleString,
      toLocaleDateString: originalToLocaleDateString,
      toLocaleTimeString: originalToLocaleTimeString,
    },
  };
}

export { setupContentScript };
