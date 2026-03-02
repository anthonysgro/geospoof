/**
 * Injected Script
 * This code runs in the page context (not isolated) to override browser APIs.
 *
 * It communicates with the content script via CustomEvent and overrides:
 * - navigator.geolocation (getCurrentPosition, watchPosition, clearWatch)
 * - Date.prototype.getTimezoneOffset
 * - Intl.DateTimeFormat (constructor + resolvedOptions)
 * - Date.prototype formatting methods (toString, toTimeString, toLocale*)
 */

/* eslint-disable no-var */
// `process.env.EVENT_NAME` is replaced at build time by Vite's `define` config.
declare var process: { env: Record<string, string | undefined> };
/* eslint-enable no-var */

(function (): void {
  "use strict";

  // ── Types ──────────────────────────────────────────────────────────────

  interface SpoofedLocation {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }

  interface TimezoneData {
    /** IANA timezone identifier */
    identifier: string;
    /** Minutes from UTC */
    offset: number;
    /** DST offset in minutes */
    dstOffset: number;
    /** True if estimated from longitude */
    fallback?: boolean;
  }

  interface SettingsEventDetail {
    enabled: boolean;
    location: SpoofedLocation | null;
    timezone: TimezoneData | null;
  }

  interface SpoofedGeolocationPosition {
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

  // Event name for settings updates (must match content script).
  const EVENT_NAME: string = process.env.EVENT_NAME || "__geospoof_settings_update";

  // ── Store original methods ─────────────────────────────────────────────

  const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(
    navigator.geolocation
  );
  const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  // Store original prototype methods. These are intentionally detached and
  // always re-bound at call sites via `.call(this)`, so the lint warning
  // about unintentional `this` scoping does not apply here.
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  const originalToString = Date.prototype.toString;
  const originalToTimeString = Date.prototype.toTimeString;
  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  /* eslint-enable @typescript-eslint/unbound-method */

  // ── Spoofing state ─────────────────────────────────────────────────────

  let spoofingEnabled = false;
  let spoofedLocation: SpoofedLocation | null = null;
  let timezoneData: TimezoneData | null = null;

  // ── Timezone helpers ───────────────────────────────────────────────────

  /** Validate timezone data structure. */
  function validateTimezoneData(tz: unknown): tz is TimezoneData {
    if (!tz || typeof tz !== "object") {
      return false;
    }

    const t = tz as Partial<TimezoneData>;

    if (typeof t.identifier !== "string" || t.identifier.length === 0) {
      console.error("[GeoSpoof Injected] Invalid timezone identifier:", t.identifier);
      return false;
    }

    if (typeof t.offset !== "number" || !Number.isFinite(t.offset)) {
      console.error("[GeoSpoof Injected] Invalid timezone offset:", t.offset);
      return false;
    }

    if (typeof t.dstOffset !== "number" || !Number.isFinite(t.dstOffset)) {
      console.error("[GeoSpoof Injected] Invalid timezone dstOffset:", t.dstOffset);
      return false;
    }

    return true;
  }

  /** Parse a GMT offset string like "GMT+5:30" or "GMT-8" into minutes from UTC. */
  function parseGMTOffset(gmtString: string): number {
    if (gmtString === "GMT" || gmtString === "UTC") {
      return 0;
    }

    const match = gmtString.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) {
      return 0;
    }

    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] || "0", 10);
    return sign * (hours * 60 + minutes);
  }

  /**
   * Resolve the actual UTC offset for a given date and IANA timezone using
   * Intl.DateTimeFormat. Returns offset in minutes from UTC (positive = east).
   * Falls back to the stored timezone.offset on any error.
   */
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
      // Invalid IANA identifier or unsupported environment — use fallback
      return fallbackOffset;
    }
  }

  // ── Settings listener ──────────────────────────────────────────────────

  window.addEventListener(EVENT_NAME, ((event: CustomEvent<SettingsEventDetail>) => {
    if (event.detail) {
      spoofingEnabled = event.detail.enabled;
      spoofedLocation = event.detail.location;

      if (event.detail.timezone) {
        if (validateTimezoneData(event.detail.timezone)) {
          timezoneData = event.detail.timezone;
          console.log("[GeoSpoof Injected] Timezone data updated:", timezoneData);
        } else {
          console.error(
            "[GeoSpoof Injected] Invalid timezone data received, timezone spoofing disabled"
          );
          timezoneData = null;
        }
      } else {
        timezoneData = null;
      }

      console.log("[GeoSpoof Injected] Settings updated via event:", {
        spoofingEnabled,
        spoofedLocation,
        timezoneData,
      });
    }
  }) as EventListener);

  // ── Geolocation overrides ──────────────────────────────────────────────

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

  // Override getCurrentPosition
  navigator.geolocation.getCurrentPosition = function (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void {
    console.log(
      "[GeoSpoof Injected] getCurrentPosition called. Enabled:",
      spoofingEnabled,
      "Location:",
      spoofedLocation
    );

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
  };

  // Override watchPosition
  navigator.geolocation.watchPosition = function (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number {
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

  // Override clearWatch
  navigator.geolocation.clearWatch = function (watchId: number): void {
    if (spoofingEnabled) {
      watchCallbacks.delete(watchId);
    } else {
      originalClearWatch(watchId);
    }
  };

  // ── Timezone overrides ─────────────────────────────────────────────────

  // Override Date.prototype.getTimezoneOffset()
  try {
    Date.prototype.getTimezoneOffset = function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          // getTimezoneOffset returns the offset TO GET TO UTC (negative of UTC offset)
          return -offsetMinutes;
        }
        return originalGetTimezoneOffset.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in getTimezoneOffset override:", error);
        return originalGetTimezoneOffset.call(this);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override getTimezoneOffset:", error);
  }

  // Override Intl.DateTimeFormat constructor to inject timezone
  try {
    Intl.DateTimeFormat = function (
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormat {
      try {
        if (spoofingEnabled && timezoneData) {
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          return new OriginalDateTimeFormat(locales, opts);
        }
        return new OriginalDateTimeFormat(locales, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in DateTimeFormat constructor override:", error);
        return new OriginalDateTimeFormat(locales, options);
      }
    } as typeof Intl.DateTimeFormat;

    // Copy static properties
    Object.defineProperty(Intl.DateTimeFormat, "prototype", {
      value: OriginalDateTimeFormat.prototype,
      writable: false,
      configurable: false,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Intl.DateTimeFormat constructor:", error);
  }

  // Override Intl.DateTimeFormat.prototype.resolvedOptions()
  try {
    Intl.DateTimeFormat.prototype.resolvedOptions =
      function (): Intl.ResolvedDateTimeFormatOptions {
        try {
          const options = originalResolvedOptions.call(this);
          if (spoofingEnabled && timezoneData) {
            options.timeZone = timezoneData.identifier;
          }
          return options;
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in resolvedOptions override:", error);
          return originalResolvedOptions.call(this);
        }
      };
  } catch (error) {
    console.error(
      "[GeoSpoof Injected] Failed to override Intl.DateTimeFormat.resolvedOptions:",
      error
    );
  }

  // ── Date formatting overrides ──────────────────────────────────────────

  // Override Date.prototype.toString()
  try {
    Date.prototype.toString = function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
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
        }
        return originalToString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toString override:", error);
        return originalToString.call(this);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toString:", error);
  }

  // Override Date.prototype.toTimeString()
  try {
    Date.prototype.toTimeString = function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          return formatter.format(this);
        }
        return originalToTimeString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toTimeString override:", error);
        return originalToTimeString.call(this);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toTimeString:", error);
  }

  // Override Date.prototype.toLocaleString()
  try {
    Date.prototype.toLocaleString = function (
      this: Date,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          return originalToLocaleString.call(this, locales as string, opts);
        }
        return originalToLocaleString.call(this, locales as string, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleString override:", error);
        return originalToLocaleString.call(this, locales as string, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleString:", error);
  }

  // Override Date.prototype.toLocaleDateString()
  try {
    Date.prototype.toLocaleDateString = function (
      this: Date,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          return originalToLocaleDateString.call(this, locales as string, opts);
        }
        return originalToLocaleDateString.call(this, locales as string, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleDateString override:", error);
        return originalToLocaleDateString.call(this, locales as string, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleDateString:", error);
  }

  // Override Date.prototype.toLocaleTimeString()
  try {
    Date.prototype.toLocaleTimeString = function (
      this: Date,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          return originalToLocaleTimeString.call(this, locales as string, opts);
        }
        return originalToLocaleTimeString.call(this, locales as string, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleTimeString override:", error);
        return originalToLocaleTimeString.call(this, locales as string, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleTimeString:", error);
  }

  console.log("[GeoSpoof Injected] Geolocation API overrides installed");
})();
