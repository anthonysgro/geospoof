/**
 * Test Helper for Content Script
 * Provides utilities to test content script in isolated environment
 */

/**
 * Setup content script with given settings
 * Returns an object with overridden APIs for testing
 */
function setupContentScript(settings) {
  // Store original methods
  const originalGetCurrentPosition = jest.fn((success) => {
    // Simulate real geolocation API
    setTimeout(() => {
      success({
        coords: {
          latitude: 0,
          longitude: 0,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      });
    }, 10);
  });
  
  const originalWatchPosition = jest.fn((success) => {
    setTimeout(() => {
      success({
        coords: {
          latitude: 0,
          longitude: 0,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      });
    }, 10);
    return 1;
  });
  
  const originalClearWatch = jest.fn();
  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const originalToString = Date.prototype.toString;
  const originalToTimeString = Date.prototype.toTimeString;
  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

  // Settings
  let spoofingEnabled = settings.enabled || false;
  let spoofedLocation = settings.location || null;
  let timezoneOverride = settings.timezone || null;

  // Validate timezone data
  function validateTimezoneData(tz) {
    if (!tz) {
      return false;
    }
    
    if (typeof tz.identifier !== 'string' || tz.identifier.length === 0) {
      return false;
    }
    
    if (typeof tz.offset !== 'number' || !Number.isFinite(tz.offset)) {
      return false;
    }
    
    if (typeof tz.dstOffset !== 'number' || !Number.isFinite(tz.dstOffset)) {
      return false;
    }
    
    return true;
  }

  // Validate initial timezone
  if (timezoneOverride && !validateTimezoneData(timezoneOverride)) {
    timezoneOverride = null;
  }

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
        speed: null
      },
      timestamp: Date.now()
    };
  }

  // Override getCurrentPosition
  const getCurrentPosition = function(successCallback, errorCallback, options) {
    if (spoofingEnabled && spoofedLocation) {
      const position = createGeolocationPosition(spoofedLocation);
      
      // Simulate realistic timing (10-50ms delay with variance)
      const delay = 10 + Math.random() * 40;
      setTimeout(() => {
        if (successCallback) {
          successCallback(position);
        }
      }, delay);
    } else {
      return originalGetCurrentPosition.call(this, successCallback, errorCallback, options);
    }
  };

  // Override watchPosition
  const watchPosition = function(successCallback, errorCallback, options) {
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
  const clearWatch = function(watchId) {
    if (spoofingEnabled) {
      watchCallbacks.delete(watchId);
    } else {
      return originalClearWatch.call(this, watchId);
    }
  };

  // Override getTimezoneOffset
  const getTimezoneOffset = function() {
    if (spoofingEnabled && timezoneOverride) {
      return -timezoneOverride.offset;
    }
    return originalGetTimezoneOffset.call(this);
  };

  // Override DateTimeFormat
  const DateTimeFormat = function(...args) {
    const instance = new OriginalDateTimeFormat(...args);
    
    if (spoofingEnabled && timezoneOverride) {
      const originalResolvedOptions = instance.resolvedOptions;
      instance.resolvedOptions = function() {
        const options = originalResolvedOptions.call(this);
        options.timeZone = timezoneOverride.identifier;
        return options;
      };
    }
    
    return instance;
  };

  // Override Date formatting methods
  const toString = function() {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezoneOverride.identifier,
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return formatter.format(this);
      } catch (error) {
        return originalToString.call(this);
      }
    }
    return originalToString.call(this);
  };

  const toTimeString = function() {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezoneOverride.identifier,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return formatter.format(this);
      } catch (error) {
        return originalToTimeString.call(this);
      }
    }
    return originalToTimeString.call(this);
  };

  const toLocaleString = function(locales, options) {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleString.call(this, locales, opts);
      } catch (error) {
        return originalToLocaleString.call(this, locales, options);
      }
    }
    return originalToLocaleString.call(this, locales, options);
  };

  const toLocaleDateString = function(locales, options) {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleDateString.call(this, locales, opts);
      } catch (error) {
        return originalToLocaleDateString.call(this, locales, options);
      }
    }
    return originalToLocaleDateString.call(this, locales, options);
  };

  const toLocaleTimeString = function(locales, options) {
    if (spoofingEnabled && timezoneOverride) {
      try {
        const opts = { ...options, timeZone: timezoneOverride.identifier };
        return originalToLocaleTimeString.call(this, locales, opts);
      } catch (error) {
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
        clearWatch
      }
    },
    Date: {
      prototype: {
        getTimezoneOffset,
        toString,
        toTimeString,
        toLocaleString,
        toLocaleDateString,
        toLocaleTimeString
      }
    },
    Intl: {
      DateTimeFormat
    },
    updateSettings: (newSettings) => {
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
      toLocaleTimeString: originalToLocaleTimeString
    }
  };
}

module.exports = {
  setupContentScript
};
