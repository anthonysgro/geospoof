/**
 * Unit Tests for Geocoding Edge Cases
 * Feature: geolocation-spoof-extension-mvp
 */

const { test, expect, describe, beforeEach } = require("@jest/globals");

// Mock browser API
global.browser = {
  storage: {
    local: {
      data: {},
      get: jest.fn(async (key) => {
        if (key === "settings") {
          return { settings: global.browser.storage.local.data.settings };
        }
        return {};
      }),
      set: jest.fn(async (obj) => {
        if (obj.settings) {
          global.browser.storage.local.data.settings = obj.settings;
        }
      }),
      clear: jest.fn(async () => {
        global.browser.storage.local.data = {};
      })
    }
  },
  tabs: {
    query: jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    onCreated: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {})
  },
  browserAction: {
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setBadgeText: jest.fn(async () => {})
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: {
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {})
      }
    }
  }
};

const backgroundPath = require("path").join(process.cwd(), "background/background.js");

beforeEach(() => {
  // Clear storage before each test
  global.browser.storage.local.data = {};
  jest.clearAllMocks();
  
  // Clear require cache to get fresh module
  delete require.cache[backgroundPath];
  
  // Reset fetch mock
  global.fetch = jest.fn();
});

describe("Geocoding Edge Cases", () => {
  /**
   * Test empty results handling
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle empty geocoding results", async () => {
    const { geocodeQuery } = require(backgroundPath);
    
    // Mock fetch to return empty results
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: true,
        json: async () => []
      })
    );
    
    const results = await geocodeQuery("NonexistentCity12345");
    
    expect(results).toEqual([]);
    expect(global.fetch).toHaveBeenCalled();
  });
  
  /**
   * Test network failure scenarios
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle network failure gracefully", async () => {
    const { geocodeQuery } = require(backgroundPath);
    
    // Mock fetch to simulate network error
    global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));
    
    await expect(geocodeQuery("San Francisco")).rejects.toThrow("NETWORK");
  });
  
  /**
   * Test API error responses
   * Validates: Requirements 9.4, 10.5
   */
  test("should handle API error responses", async () => {
    const { geocodeQuery } = require(backgroundPath);
    
    // Mock fetch to return error status
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: false,
        status: 500
      })
    );
    
    // The implementation converts all errors to "NETWORK" errors
    await expect(geocodeQuery("San Francisco")).rejects.toThrow("NETWORK");
  });
  
  /**
   * Test free service usage (Nominatim)
   * Validates: Requirements 9.4, 10.5
   */
  test("should use Nominatim free service without authentication", async () => {
    const { geocodeQuery } = require(backgroundPath);
    
    // Mock successful response
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: true,
        json: async () => [{
          display_name: "San Francisco, CA, USA",
          lat: "37.7749",
          lon: "-122.4194",
          address: {
            city: "San Francisco",
            country: "USA"
          }
        }]
      })
    );
    
    await geocodeQuery("San Francisco");
    
    // Verify fetch was called with Nominatim URL
    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = global.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain("nominatim.openstreetmap.org");
    
    // Verify User-Agent header is set
    const fetchOptions = global.fetch.mock.calls[0][1];
    expect(fetchOptions.headers["User-Agent"]).toBe("GeoSpoof-Extension/1.0");
    
    // Verify no authentication is required (no API key in URL or headers)
    expect(fetchUrl).not.toContain("apikey");
    expect(fetchUrl).not.toContain("api_key");
    expect(fetchOptions.headers).not.toHaveProperty("Authorization");
  });
  
  /**
   * Test reverse geocoding with empty results
   */
  test("should handle reverse geocoding with minimal address data", async () => {
    const { reverseGeocode } = require(backgroundPath);
    
    // Mock fetch to return minimal address data
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: true,
        json: async () => ({
          display_name: "37.7749, -122.4194",
          address: {} // Empty address object
        })
      })
    );
    
    const result = await reverseGeocode(37.7749, -122.4194);
    
    expect(result.city).toBe("");
    expect(result.country).toBe("");
    expect(result.displayName).toBe("37.7749, -122.4194");
  });
  
  /**
   * Test query length validation
   */
  test("should return empty array for queries shorter than 3 characters", async () => {
    const { geocodeQuery } = require(backgroundPath);
    
    const results1 = await geocodeQuery("");
    const results2 = await geocodeQuery("ab");
    const results3 = await geocodeQuery("  ");
    
    expect(results1).toEqual([]);
    expect(results2).toEqual([]);
    expect(results3).toEqual([]);
    
    // Fetch should not be called for short queries
    expect(global.fetch).not.toHaveBeenCalled();
  });
  
  /**
   * Test retry logic for transient failures
   */
  test("should retry on transient network failures", async () => {
    const { geocodeQuery, MAX_RETRIES } = require(backgroundPath);
    
    let callCount = 0;
    
    // Mock fetch to fail twice then succeed
    global.fetch = jest.fn(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error("Transient network error"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => [{
          display_name: "San Francisco, CA, USA",
          lat: "37.7749",
          lon: "-122.4194",
          address: {
            city: "San Francisco",
            country: "USA"
          }
        }]
      });
    });
    
    const results = await geocodeQuery("San Francisco");
    
    // Should have retried and eventually succeeded
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("San Francisco, CA, USA");
    expect(callCount).toBe(3); // Initial + 2 retries
  });
  
  /**
   * Test reverse geocoding network failure
   */
  test("should handle reverse geocoding network failure", async () => {
    // Clear require cache to get fresh module with empty cache
    delete require.cache[backgroundPath];
    const { reverseGeocode } = require(backgroundPath);
    
    // Use different coordinates that haven't been cached
    const uniqueLat = 12.3456;
    const uniqueLon = 78.9012;
    
    // Mock fetch to simulate network error
    global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));
    
    await expect(reverseGeocode(uniqueLat, uniqueLon)).rejects.toThrow("NETWORK");
  });
  
  /**
   * Test cache key generation
   */
  test("should generate consistent cache keys for coordinates", async () => {
    const { getCacheKey } = require(backgroundPath);
    
    // Test rounding to 4 decimal places
    const key1 = getCacheKey(37.77491234, -122.41941234);
    const key2 = getCacheKey(37.77499999, -122.41949999);
    
    expect(key1).toBe("37.7749,-122.4194");
    expect(key2).toBe("37.7750,-122.4195");
    
    // Test negative coordinates
    const key3 = getCacheKey(-33.8688, 151.2093);
    expect(key3).toBe("-33.8688,151.2093");
  });
});
