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
    permissions: {
      query: (descriptor: { name: string }) => Promise<PermissionStatus>;
    };
  };
  Date: {
    prototype: {
      getTimezoneOffset: () => number;
      toString: () => string;
      toTimeString: () => string;
      toDateString: () => string;
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
    permissionsQuery: ReturnType<typeof vi.fn>;
    getTimezoneOffset: typeof Date.prototype.getTimezoneOffset;
    DateTimeFormat: typeof Intl.DateTimeFormat;
    toString: typeof Date.prototype.toString;
    toTimeString: typeof Date.prototype.toTimeString;
    toDateString: typeof Date.prototype.toDateString;
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

  // Original permissions.query mock — returns "prompt" for geolocation by default
  const originalPermissionsQuery = vi.fn(
    (descriptor: { name: string }): Promise<PermissionStatus> => {
      const target = new EventTarget();
      const state = descriptor?.name === "geolocation" ? "prompt" : "granted";
      Object.defineProperty(target, "state", {
        get: () => state as PermissionState,
        enumerable: true,
        configurable: false,
      });
      Object.defineProperty(target, "onchange", {
        value: null,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return Promise.resolve(target as unknown as PermissionStatus);
    }
  );

  // Store prototype method references via index access to avoid unbound-method lint errors.
  // These are always invoked via .call(dateInstance) with the correct receiver.
  const dateProto = Date.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const originalGetTimezoneOffset = dateProto["getTimezoneOffset"] as (this: Date) => number;
  const originalToString = dateProto["toString"] as (this: Date) => string;
  const originalToTimeString = dateProto["toTimeString"] as (this: Date) => string;
  const originalToDateString = dateProto["toDateString"] as (this: Date) => string;
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

  // ── Timezone formatting helpers ──────────────────────────────────────

  /** Parse a GMT offset string like "GMT+5:30" or "GMT-8" into minutes from UTC. */
  function parseGMTOffset(gmtString: string): number {
    if (gmtString === "GMT" || gmtString === "UTC") return 0;
    const match = gmtString.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return 0;
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] || "0", 10);
    return sign * (hours * 60 + minutes);
  }

  /** Resolve the actual UTC offset for a given date and IANA timezone. */
  function getIntlBasedOffset(date: Date, timezoneId: string, fallbackOffset: number): number {
    try {
      const formatter = new OriginalDateTimeFormat("en-US", {
        timeZone: timezoneId,
        timeZoneName: "shortOffset",
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      return parseGMTOffset(tzPart?.value ?? "GMT");
    } catch {
      return fallbackOffset;
    }
  }

  /** Convert an offset in minutes from UTC to a `GMT±HHMM` string. */
  function formatGMTOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `GMT${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }

  /** Extract the long timezone name for a date and IANA tz. */
  function getLongTimezoneName(date: Date, timezoneId: string): string {
    try {
      const formatter = new OriginalDateTimeFormat("en-US", {
        timeZone: timezoneId,
        timeZoneName: "long",
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      return tzPart?.value ?? timezoneId;
    } catch {
      return timezoneId;
    }
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

  const toDateString = function (this: Date): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const formatter = new OriginalDateTimeFormat("en-US", {
          timeZone: timezoneOverride.identifier,
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "2-digit",
        });
        const parts = formatter.formatToParts(this);
        const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
        return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")}`;
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toDateString override:", error);
        return originalToDateString.call(this);
      }
    }
    return originalToDateString.call(this);
  };

  const toString = function (this: Date): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const offsetMinutes = getIntlBasedOffset(
          this,
          timezoneOverride.identifier,
          timezoneOverride.offset
        );
        const formatter = new OriginalDateTimeFormat("en-US", {
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
        const parts = formatter.formatToParts(this);
        const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
        const gmtOffset = formatGMTOffset(offsetMinutes);
        const longName = getLongTimezoneName(this, timezoneOverride.identifier);
        return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toString override:", error);
        return originalToString.call(this);
      }
    }
    return originalToString.call(this);
  };

  const toTimeString = function (this: Date): string {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const offsetMinutes = getIntlBasedOffset(
          this,
          timezoneOverride.identifier,
          timezoneOverride.offset
        );
        const formatter = new OriginalDateTimeFormat("en-US", {
          timeZone: timezoneOverride.identifier,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        const parts = formatter.formatToParts(this);
        const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
        const gmtOffset = formatGMTOffset(offsetMinutes);
        const longName = getLongTimezoneName(this, timezoneOverride.identifier);
        return `${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toTimeString override:", error);
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

  // Create spoofed PermissionStatus
  function createSpoofedPermissionStatus(): PermissionStatus {
    const target = new EventTarget();
    let onchangeHandler: ((this: PermissionStatus, ev: Event) => unknown) | null = null;

    Object.defineProperty(target, "state", {
      get: () => "granted" as PermissionState,
      enumerable: true,
      configurable: false,
    });

    Object.defineProperty(target, "onchange", {
      get: () => onchangeHandler,
      set: (value: ((this: PermissionStatus, ev: Event) => unknown) | null) => {
        onchangeHandler = value;
      },
      enumerable: true,
      configurable: true,
    });

    return target as unknown as PermissionStatus;
  }

  // Override permissions.query
  const permissionsQuery = function (descriptor: { name: string }): Promise<PermissionStatus> {
    try {
      if (spoofingEnabled && descriptor?.name === "geolocation") {
        return Promise.resolve(createSpoofedPermissionStatus());
      }
      return originalPermissionsQuery(descriptor);
    } catch (error) {
      console.error("[GeoSpoof Test] Error in permissions.query override:", error);
      return originalPermissionsQuery(descriptor);
    }
  };

  // Return test interface
  return {
    navigator: {
      geolocation: {
        getCurrentPosition,
        watchPosition,
        clearWatch,
      },
      permissions: {
        query: permissionsQuery,
      },
    },
    Date: {
      prototype: {
        getTimezoneOffset,
        toString,
        toTimeString,
        toDateString,
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
      permissionsQuery: originalPermissionsQuery,
      getTimezoneOffset: originalGetTimezoneOffset,
      DateTimeFormat: OriginalDateTimeFormat,
      toString: originalToString,
      toTimeString: originalToTimeString,
      toDateString: originalToDateString,
      toLocaleString: originalToLocaleString,
      toLocaleDateString: originalToLocaleDateString,
      toLocaleTimeString: originalToLocaleTimeString,
    },
  };
}

export { setupContentScript };
