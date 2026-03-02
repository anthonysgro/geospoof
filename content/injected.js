/**
 * Injected Script
 * This code runs in the page context (not isolated) to override APIs
 */

(function () {
  "use strict";

  // Event name for settings updates (must match content.js)
  const EVENT_NAME = process.env.EVENT_NAME || "__geospoof_settings_update";

  // Store original methods
  const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(
    navigator.geolocation
  );
  const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  const originalToString = Date.prototype.toString;
  const originalToTimeString = Date.prototype.toTimeString;
  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

  // Settings (received via CustomEvent from content script)
  let spoofingEnabled = false;
  let spoofedLocation = null;
  let timezoneData = null; // { identifier, offset, dstOffset, fallback? }

  // Validate timezone data structure
  function validateTimezoneData(tz) {
    if (!tz) {
      return false;
    }

    if (typeof tz.identifier !== "string" || tz.identifier.length === 0) {
      console.error("[GeoSpoof Injected] Invalid timezone identifier:", tz.identifier);
      return false;
    }

    if (typeof tz.offset !== "number" || !Number.isFinite(tz.offset)) {
      console.error("[GeoSpoof Injected] Invalid timezone offset:", tz.offset);
      return false;
    }

    if (typeof tz.dstOffset !== "number" || !Number.isFinite(tz.dstOffset)) {
      console.error("[GeoSpoof Injected] Invalid timezone dstOffset:", tz.dstOffset);
      return false;
    }

    return true;
  }

  // Determine if DST is active for a given date
  function isDSTActive(date, timezone) {
    // If no DST offset, DST is never active
    if (!timezone || timezone.dstOffset === 0) {
      return false;
    }

    const month = date.getMonth(); // 0-11

    // Determine hemisphere from timezone identifier
    // Northern hemisphere timezones
    const northernPrefixes = ["America/", "Europe/", "Asia/"];
    const isNorthern = northernPrefixes.some((prefix) => timezone.identifier.startsWith(prefix));

    // Southern hemisphere timezones
    const southernPrefixes = ["Australia/", "Pacific/", "Antarctica/"];
    const isSouthern = southernPrefixes.some((prefix) => timezone.identifier.startsWith(prefix));

    if (isNorthern) {
      // Northern hemisphere: DST typically March-November (months 2-10)
      return month >= 2 && month <= 10;
    } else if (isSouthern) {
      // Southern hemisphere: DST typically October-March (months 9-11 or 0-2)
      return month >= 9 || month <= 2;
    }

    // Default to no DST for unknown timezones
    return false;
  }

  // Calculate current offset including DST adjustment
  function getCurrentOffset(timezone, date = new Date()) {
    if (!timezone) {
      return 0;
    }

    const baseOffset = timezone.offset;

    if (isDSTActive(date, timezone)) {
      return baseOffset + timezone.dstOffset;
    }

    return baseOffset;
  }

  // Listen for settings updates via CustomEvent (CSP-safe)
  window.addEventListener(EVENT_NAME, (event) => {
    if (event.detail) {
      spoofingEnabled = event.detail.enabled;
      spoofedLocation = event.detail.location;

      // Extract and validate timezone data
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
  });

  // Watch callbacks storage
  const watchCallbacks = new Map();
  let watchIdCounter = 1;

  // Create GeolocationPosition object
  function createGeolocationPosition(location) {
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
  navigator.geolocation.getCurrentPosition = function (successCallback, errorCallback, options) {
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
          successCallback(position);
        }
      }, delay);
    } else {
      console.log("[GeoSpoof Injected] Using original geolocation");
      return originalGetCurrentPosition(successCallback, errorCallback, options);
    }
  };

  // Override watchPosition
  navigator.geolocation.watchPosition = function (successCallback, errorCallback, options) {
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
      return originalWatchPosition(successCallback, errorCallback, options);
    }
  };

  // Override clearWatch
  navigator.geolocation.clearWatch = function (watchId) {
    if (spoofingEnabled) {
      watchCallbacks.delete(watchId);
    } else {
      return originalClearWatch(watchId);
    }
  };

  // Override Date.prototype.getTimezoneOffset()
  try {
    Date.prototype.getTimezoneOffset = function () {
      try {
        // Use spoofed timezone if enabled and available
        if (spoofingEnabled && timezoneData) {
          const currentOffset = getCurrentOffset(timezoneData, this);
          // Return negative of offset (getTimezoneOffset returns offset TO GET TO UTC)
          return -currentOffset;
        }

        // Fallback to original method
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
    Intl.DateTimeFormat = function (locales, options) {
      try {
        // If spoofing is enabled and timezone data is available, inject timezone
        if (spoofingEnabled && timezoneData) {
          const opts = { ...options, timeZone: timezoneData.identifier };
          return new OriginalDateTimeFormat(locales, opts);
        }

        // Otherwise use original constructor
        return new OriginalDateTimeFormat(locales, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in DateTimeFormat constructor override:", error);
        return new OriginalDateTimeFormat(locales, options);
      }
    };

    // Copy static properties
    Intl.DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Intl.DateTimeFormat constructor:", error);
  }

  // Override Intl.DateTimeFormat.prototype.resolvedOptions()
  try {
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      try {
        // Get original resolved options
        const options = originalResolvedOptions.call(this);

        // Replace timeZone if spoofing is enabled and timezone data is available
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

  // Override Date.prototype.toString()
  try {
    Date.prototype.toString = function () {
      try {
        if (spoofingEnabled && timezoneData) {
          // Use Intl.DateTimeFormat to format with spoofed timezone
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
    Date.prototype.toTimeString = function () {
      try {
        if (spoofingEnabled && timezoneData) {
          // Use Intl.DateTimeFormat to format time with spoofed timezone
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
    Date.prototype.toLocaleString = function (locales, options) {
      try {
        if (spoofingEnabled && timezoneData) {
          // Add spoofed timezone to options
          const opts = { ...options, timeZone: timezoneData.identifier };
          return originalToLocaleString.call(this, locales, opts);
        }

        return originalToLocaleString.call(this, locales, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleString override:", error);
        return originalToLocaleString.call(this, locales, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleString:", error);
  }

  // Override Date.prototype.toLocaleDateString()
  try {
    Date.prototype.toLocaleDateString = function (locales, options) {
      try {
        if (spoofingEnabled && timezoneData) {
          // Add spoofed timezone to options
          const opts = { ...options, timeZone: timezoneData.identifier };
          return originalToLocaleDateString.call(this, locales, opts);
        }

        return originalToLocaleDateString.call(this, locales, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleDateString override:", error);
        return originalToLocaleDateString.call(this, locales, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleDateString:", error);
  }

  // Override Date.prototype.toLocaleTimeString()
  try {
    Date.prototype.toLocaleTimeString = function (locales, options) {
      try {
        if (spoofingEnabled && timezoneData) {
          // Add spoofed timezone to options
          const opts = { ...options, timeZone: timezoneData.identifier };
          return originalToLocaleTimeString.call(this, locales, opts);
        }

        return originalToLocaleTimeString.call(this, locales, options);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toLocaleTimeString override:", error);
        return originalToLocaleTimeString.call(this, locales, options);
      }
    };
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleTimeString:", error);
  }

  console.log("[GeoSpoof Injected] Geolocation API overrides installed");
})();
