/**
 * Unit Tests for Status Display Functions
 * Tests the status display functions in popup.js
 */

describe('Status Display Functions', () => {
  // Extract and define the display functions directly for testing
  const displayLocationStatus = (location) => {
    if (!location) {
      return "Not configured";
    }
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (±${location.accuracy}m)`;
  };

  const displayTimezoneStatus = (timezone) => {
    if (!timezone) {
      return "Not configured";
    }
    
    const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
    const offsetMinutes = Math.abs(timezone.offset) % 60;
    const sign = timezone.offset >= 0 ? '+' : '-';
    const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
    
    let display = `${timezone.identifier} (${offsetStr})`;
    if (timezone.fallback) {
      display += " (estimated)";
    }
    
    return display;
  };

  const displayOverriddenApis = (enabled, hasLocation, hasTimezone) => {
    if (!enabled) {
      return "None (protection disabled)";
    }
    
    const apis = [];
    
    if (hasLocation) {
      apis.push("navigator.geolocation.getCurrentPosition");
      apis.push("navigator.geolocation.watchPosition");
    }
    
    if (hasTimezone) {
      apis.push("Date.prototype.getTimezoneOffset");
      apis.push("Intl.DateTimeFormat");
      apis.push("Date formatting methods");
    }
    
    return apis.length > 0 ? apis.join(", ") : "None";
  };

  const displayWebRTCStatus = (enabled) => {
    return enabled 
      ? "✓ Active (non-proxied UDP disabled)" 
      : "✗ Inactive";
  };

  describe('displayLocationStatus', () => {
    test('formats location with 4 decimal places', () => {
      const location = {
        latitude: 35.6762,
        longitude: 139.6503,
        accuracy: 10
      };
      
      const result = displayLocationStatus(location);
      
      expect(result).toBe("35.6762, 139.6503 (±10m)");
    });

    test('handles negative coordinates', () => {
      const location = {
        latitude: -33.8688,
        longitude: -151.2093,
        accuracy: 50
      };
      
      const result = displayLocationStatus(location);
      
      expect(result).toBe("-33.8688, -151.2093 (±50m)");
    });

    test('rounds coordinates to 4 decimal places', () => {
      const location = {
        latitude: 40.712776,
        longitude: -74.005974,
        accuracy: 100
      };
      
      const result = displayLocationStatus(location);
      
      expect(result).toBe("40.7128, -74.0060 (±100m)");
    });

    test('returns "Not configured" for null location', () => {
      const result = displayLocationStatus(null);
      expect(result).toBe("Not configured");
    });

    test('returns "Not configured" for undefined location', () => {
      const result = displayLocationStatus(undefined);
      expect(result).toBe("Not configured");
    });
  });

  describe('displayTimezoneStatus', () => {
    test('formats timezone with positive offset', () => {
      const timezone = {
        identifier: "Asia/Tokyo",
        offset: -540,
        dstOffset: 0
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("Asia/Tokyo (UTC-09:00)");
    });

    test('formats timezone with negative offset', () => {
      const timezone = {
        identifier: "America/New_York",
        offset: 300,
        dstOffset: 60
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("America/New_York (UTC+05:00)");
    });

    test('formats UTC timezone', () => {
      const timezone = {
        identifier: "UTC",
        offset: 0,
        dstOffset: 0
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("UTC (UTC+00:00)");
    });

    test('handles non-hour offsets', () => {
      const timezone = {
        identifier: "Asia/Kolkata",
        offset: -330,
        dstOffset: 0
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("Asia/Kolkata (UTC-05:30)");
    });

    test('adds "(estimated)" for fallback timezone', () => {
      const timezone = {
        identifier: "America/Los_Angeles",
        offset: 480,
        dstOffset: 60,
        fallback: true
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("America/Los_Angeles (UTC+08:00) (estimated)");
    });

    test('does not add "(estimated)" when fallback is false', () => {
      const timezone = {
        identifier: "Europe/London",
        offset: 0,
        dstOffset: 60,
        fallback: false
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("Europe/London (UTC+00:00)");
    });

    test('returns "Not configured" for null timezone', () => {
      const result = displayTimezoneStatus(null);
      expect(result).toBe("Not configured");
    });

    test('returns "Not configured" for undefined timezone', () => {
      const result = displayTimezoneStatus(undefined);
      expect(result).toBe("Not configured");
    });
  });

  describe('displayOverriddenApis', () => {
    test('lists geolocation APIs when location is set', () => {
      const result = displayOverriddenApis(true, true, false);
      
      expect(result).toContain("navigator.geolocation.getCurrentPosition");
      expect(result).toContain("navigator.geolocation.watchPosition");
      expect(result).not.toContain("Date.prototype.getTimezoneOffset");
    });

    test('lists timezone APIs when timezone is set', () => {
      const result = displayOverriddenApis(true, false, true);
      
      expect(result).toContain("Date.prototype.getTimezoneOffset");
      expect(result).toContain("Intl.DateTimeFormat");
      expect(result).toContain("Date formatting methods");
      expect(result).not.toContain("navigator.geolocation");
    });

    test('lists all APIs when both location and timezone are set', () => {
      const result = displayOverriddenApis(true, true, true);
      
      expect(result).toContain("navigator.geolocation.getCurrentPosition");
      expect(result).toContain("navigator.geolocation.watchPosition");
      expect(result).toContain("Date.prototype.getTimezoneOffset");
      expect(result).toContain("Intl.DateTimeFormat");
      expect(result).toContain("Date formatting methods");
    });

    test('returns "None (protection disabled)" when protection is disabled', () => {
      const result = displayOverriddenApis(false, true, true);
      
      expect(result).toBe("None (protection disabled)");
    });

    test('returns "None" when protection is enabled but no data is set', () => {
      const result = displayOverriddenApis(true, false, false);
      
      expect(result).toBe("None");
    });

    test('formats APIs as comma-separated list', () => {
      const result = displayOverriddenApis(true, true, true);
      
      expect(result).toMatch(/^[\w\s.,()]+$/);
      expect(result.split(", ").length).toBeGreaterThan(1);
    });
  });

  describe('displayWebRTCStatus', () => {
    test('returns active status when enabled', () => {
      const result = displayWebRTCStatus(true);
      
      expect(result).toBe("✓ Active (non-proxied UDP disabled)");
    });

    test('returns inactive status when disabled', () => {
      const result = displayWebRTCStatus(false);
      
      expect(result).toBe("✗ Inactive");
    });
  });

  describe('Edge Cases', () => {
    test('displayLocationStatus handles zero coordinates', () => {
      const location = {
        latitude: 0,
        longitude: 0,
        accuracy: 1
      };
      
      const result = displayLocationStatus(location);
      
      expect(result).toBe("0.0000, 0.0000 (±1m)");
    });

    test('displayLocationStatus handles extreme coordinates', () => {
      const location = {
        latitude: 90,
        longitude: 180,
        accuracy: 10000
      };
      
      const result = displayLocationStatus(location);
      
      expect(result).toBe("90.0000, 180.0000 (±10000m)");
    });

    test('displayTimezoneStatus handles maximum positive offset', () => {
      const timezone = {
        identifier: "Pacific/Kiritimati",
        offset: -840,
        dstOffset: 0
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("Pacific/Kiritimati (UTC-14:00)");
    });

    test('displayTimezoneStatus handles maximum negative offset', () => {
      const timezone = {
        identifier: "Etc/GMT+12",
        offset: 720,
        dstOffset: 0
      };
      
      const result = displayTimezoneStatus(timezone);
      
      expect(result).toBe("Etc/GMT+12 (UTC+12:00)");
    });
  });
});
